"""Replace narration and subtitle strip, preserving the validated video edit.

Reads only public delivery artifacts and locally synthesized audio. The original
delivery is never overwritten. No RPC, wallet, or business API is accessed.
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT/'.data/demo-recording/natural-voice'
FF = '/opt/homebrew/bin/ffmpeg'
PROBE = '/opt/homebrew/bin/ffprobe'


def command(args):
    result = subprocess.run(list(map(str, args)), text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-4000:])
    return result.stdout


def quote(path):
    return "'"+str(path).replace("'", "'\\''")+"'"


def stamp(seconds):
    ms = round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'


def normalize(text):
    return re.sub(r'[^\w]', '', text).lower()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default=str(ROOT/'.data/demo-recording/delivery'))
    parser.add_argument('--output', default=str(ROOT/'.data/demo-recording/delivery-natural'))
    parser.add_argument('--speaker', default='Serena')
    parser.add_argument('--keys', default='')
    parser.add_argument('--available', action='store_true', help='Render checked paragraphs without assembling the final video yet.')
    args = parser.parse_args()
    source, dest = Path(args.source).resolve(), Path(args.output).resolve()
    assert source != dest, 'Keep the original edit and original narration.'
    dest.mkdir(parents=True, exist_ok=True)
    rows = json.loads((WORK/'story.json').read_text())
    edits = json.loads((source/'edit-index.json').read_text())
    voice = WORK/args.speaker
    captions, revised = [], []
    for index, (row, edit) in enumerate(zip(rows, edits, strict=True)):
        if args.keys and row['key'] not in args.keys.split(','):
            continue
        if args.available:
            files = [voice/(row['key']+suffix) for suffix in ['.json', '.asr.json', '.alignment.json']]
            if not all(p.exists() for p in files):
                continue
            if len({json.loads(p.read_text())['digest'] for p in files}) != 1:
                continue
        key, seconds = row['key'], edit['end']-edit['start']
        assert key == edit['key']
        folder = dest/'chapters'/f'{index+1:02}-{key}'
        folder.mkdir(parents=True, exist_ok=True)
        meta = json.loads((voice/(key+'.json')).read_text())
        alignment = json.loads((voice/(key+'.alignment.json')).read_text())
        asr = json.loads((voice/(key+'.asr.json')).read_text())
        assert meta['digest'] == alignment['digest'] == asr['digest']
        assert asr['similarity'] > .88, f'Inspect the speech transcript for {key} before rendering.'
        original = source/'chapters'/f'{index+1:02}-{key}'/'scene.mp4'
        cache_key = hashlib.sha256((meta['digest']+str(original.stat().st_mtime_ns)+Path(__file__).read_text()).encode()).hexdigest()
        items = alignment['items']
        assert normalize(''.join(i['text'] for i in items)) == normalize(meta['config']['text'])
        data, sr = sf.read(voice/(key+'.wav'), dtype='float32')
        # Preserve breaths around the first and final aligned word; trim only
        # leading/trailing padding, not the pauses within a paragraph.
        trim_start = max(0, items[0]['start']-.18)
        trim_end = min(len(data)/sr, items[-1]['end']+.28)
        length = trim_end-trim_start
        speed = max(1.0, length/(seconds-.6))
        assert speed <= 1.18, f'{key} requires {speed:.2f}x: regenerate a shorter, naturally paced take.'
        delay = .25
        audio = folder/'narration.wav'
        processed = folder/'trimmed.wav'
        sf.write(processed, data[round(trim_start*sr):round(trim_end*sr)], sr, subtype='PCM_24')
        command([FF, '-v', 'error', '-y', '-i', processed, '-af',
                 f'atempo={speed:.8f},highpass=f=60,loudnorm=I=-18:TP=-2:LRA=8,adelay=250,apad=whole_dur={seconds},atrim=duration={seconds}',
                 '-ar', '48000', '-c:a', 'pcm_s24le', audio])
        # Map original written sentences to aligned spoken characters, keeping
        # MetaMask/Blockscout/USDC correctly spelt in the subtitles.
        char_items = [item for item in items for _ in normalize(item['text'])]
        sentences = re.findall(r'[^。！？]+[。！？]?', row['text'])
        cue_rows, cursor = [], 0
        for sentence in sentences:
            count = len(normalize(sentence))
            start = max(0, delay+(char_items[cursor]['start']-trim_start)/speed-.1)
            end = min(seconds, delay+(char_items[cursor+count-1]['end']-trim_start)/speed+.25)
            cue_rows.append(dict(start=start, end=end, text=sentence))
            cursor += count
        assert cursor == len(char_items)
        cue_rows[0]['start'] = 0
        for i in range(len(cue_rows)-1):
            cue_rows[i]['end'] = min(cue_rows[i]['end'], cue_rows[i+1]['start'])
        assert all(0 <= c['start'] < c['end'] <= seconds for c in cue_rows)
        images = [dict(text='', path=str(folder/'blank.png'))]
        images += [dict(text=c['text'], path=str(folder/f'{i}.png')) for i, c in enumerate(cue_rows)]
        (folder/'captions.json').write_text(json.dumps(images, ensure_ascii=False))
        command(['python3', ROOT/'ui/scripts/recording/caption.py', folder/'captions.json'])
        timeline, at = [], 0
        for i, cue in enumerate(cue_rows):
            if cue['start'] > at:
                timeline.append(f"file {quote(folder/'blank.png')}\nduration {cue['start']-at:.8f}")
            timeline.append(f"file {quote(folder/f'{i}.png')}\nduration {cue['end']-cue['start']:.8f}")
            at = cue['end']
            captions.append(dict(start=edit['start']+cue['start'], end=edit['start']+cue['end'], text=cue['text']))
        if at < seconds:
            timeline.append(f"file {quote(folder/'blank.png')}\nduration {seconds-at:.8f}")
        timeline.append(f"file {quote(folder/'blank.png')}")
        (folder/'captions.ffconcat').write_text('\n'.join(timeline))
        (folder/'cues.json').write_text(json.dumps(cue_rows, ensure_ascii=False, indent=2))
        part = folder/'scene.mp4'
        cache = folder/'render-cache.json'
        if not (part.exists() and cache.exists() and json.loads(cache.read_text())['key'] == cache_key):
            # Only y >= 1320 contains the previous voiceover captions. The
            # actual business action, wallet, transaction note and speed badge
            # above it retain the original timing and pixels before encoding.
            filters = '[0:v]drawbox=x=0:y=1320:w=2560:h=120:color=0x102834:t=fill[v];[2:v]fps=30,format=rgb24[s];[v][s]overlay=0:1320:eof_action=repeat,format=yuv420p[out]'
            command([FF, '-v', 'error', '-y', '-i', original, '-i', audio,
                     '-f', 'concat', '-safe', '0', '-i', folder/'captions.ffconcat',
                     '-filter_complex', filters, '-map', '[out]', '-map', '1:a',
                     '-t', f'{seconds:.8f}', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast',
                     '-crf', '20', '-threads', '4', '-c:a', 'aac', '-b:a', '160k',
                     '-movflags', '+faststart', part])
            cache.write_text(json.dumps(dict(key=cache_key)))
        revision = dict(key=key, duration=seconds, rawSpeechSeconds=meta['seconds'],
                        speed=speed, leadingPadding=delay, asrSimilarity=asr['similarity'],
                        sourceVideoSha256=hashlib.sha256(original.read_bytes()).hexdigest(),
                        narrationDigest=meta['digest'], subtitleCount=len(cue_rows))
        revised.append(revision)
        print(f"Revoiced {index+1}/{len(rows)}: {key}, speed {speed:.3f}x, {len(cue_rows)} aligned captions", flush=True)
    if args.keys or args.available:
        return
    # Deliberately preserve the original business evidence and all video-time
    # references, while giving the audio revision its own provenance and QA.
    evidence_files = ['edit-index.json', 'chapters.ffmeta', '交易核对清单.json',
                      '交易核对清单.html', '业务步骤核对.json', '系统部署与测试资金.json',
                      'validation.json', 'explorer-reopen-qa.json', 'persistence.json',
                      '合约部署信息.json', '电站证据索引.json', '测试记录.md']
    for name in evidence_files:
        shutil.copy2(source/name, dest/name)
    script = '\n'.join(f"## {stamp(row['start'])[:8]} {row['chapter']} · {row['key']}\n\n{row['text']}\n" for row in rows)
    (dest/'中文讲稿.md').write_text('# 太阳能收益权平台全流程演示（新版配音）\n\n'+script)
    (dest/'中文字幕.srt').write_text('\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}\n" for i, c in enumerate(captions)))
    parts = [dest/'chapters'/f"{i+1:02}-{row['key']}"/'scene.mp4' for i, row in enumerate(rows)]
    (dest/'parts.ffconcat').write_text('\n'.join('file '+quote(p) for p in parts))
    master = dest/'Deye-RWA-完整演示-1440p.mp4'
    command([FF, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', dest/'parts.ffconcat',
             '-f', 'ffmetadata', '-i', dest/'chapters.ffmeta', '-map_metadata', '1', '-map_chapters', '1',
             '-c', 'copy', '-movflags', '+faststart', master])
    print('Master ready. Encoding 1080p.', flush=True)
    command([FF, '-v', 'error', '-y', '-i', master, '-vf', 'scale=1920:1080', '-r', '30',
             '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-threads', '4',
             '-c:a', 'copy', '-movflags', '+faststart', dest/'Deye-RWA-完整演示-1080p.mp4'])
    chapter_dir = dest/'分章节视频'
    chapter_dir.mkdir(exist_ok=True)
    for chapter in dict.fromkeys(row['chapter'] for row in rows):
        selected = [part for part, row in zip(parts, rows) if row['chapter'] == chapter]
        path = chapter_dir/(chapter.replace(' · ', '-')+'.ffconcat')
        path.write_text('\n'.join('file '+quote(p) for p in selected))
        command([FF, '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path,
                 '-c', 'copy', '-movflags', '+faststart', path.with_suffix('.mp4')])
    provenance = dict(revision='natural-narration-2026-09-24', engine='mlx-audio 0.5.5',
                      voice=args.speaker, syntheticVoice=True, localGeneration=True,
                      originalVideoSeconds=edits[-1]['end'], pictureEditUnchanged=True,
                      unchangedEvidenceSha256={n: hashlib.sha256((dest/n).read_bytes()).hexdigest() for n in evidence_files},
                      paragraphs=revised)
    (dest/'audio-revision.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2))
    print('Both revised videos and all chapter videos are ready.', flush=True)


if __name__ == '__main__':
    main()
