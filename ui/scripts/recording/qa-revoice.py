"""Verify voice-only revision without re-executing business transactions."""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FF = '/opt/homebrew/bin/ffmpeg'
PROBE = '/opt/homebrew/bin/ffprobe'


def metadata(path):
    return json.loads(subprocess.check_output([PROBE, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], text=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default=str(ROOT/'.data/demo-recording/delivery'))
    parser.add_argument('--output', default=str(ROOT/'.data/demo-recording/delivery-natural'))
    args = parser.parse_args()
    source, dest = Path(args.source), Path(args.output)
    revision = json.loads((dest/'audio-revision.json').read_text())
    checks = []
    for name, digest in revision['unchangedEvidenceSha256'].items():
        assert hashlib.sha256((source/name).read_bytes()).hexdigest() == digest
        assert hashlib.sha256((dest/name).read_bytes()).hexdigest() == digest
    checks.append('Original edit, transaction hashes, transaction timecodes and business validation records match byte for byte.')
    for filename in ['Deye-RWA-完整演示-1440p.mp4', 'Deye-RWA-完整演示-1080p.mp4']:
        before, after = metadata(source/filename), metadata(dest/filename)
        a = next(s for s in before['streams'] if s['codec_type'] == 'video')
        b = next(s for s in after['streams'] if s['codec_type'] == 'video')
        assert a['nb_frames'] == b['nb_frames'], f'Frame count changed: {filename}'
        assert a['width'] == b['width'] and a['height'] == b['height']
        assert abs(float(before['format']['duration'])-float(after['format']['duration'])) <= .05
    checks.append('Both full videos preserve the original frame count, resolution and duration.')
    comparisons = []
    edits = json.loads((dest/'edit-index.json').read_text())
    # Compare the actual business and wallet area in every scene, excluding
    # only the replaced 120-pixel subtitle strip.
    for index, edit in enumerate(edits):
        name = f"{index+1:02}-{edit['key']}"
        point = min(3, (edit['end']-edit['start'])/2)
        cmd = [FF, '-hide_banner', '-ss', str(point), '-i', str(source/'chapters'/name/'scene.mp4'),
               '-ss', str(point), '-i', str(dest/'chapters'/name/'scene.mp4'),
               '-filter_complex', '[0:v]crop=2560:1320:0:0[a];[1:v]crop=2560:1320:0:0[b];[a][b]ssim',
               '-frames:v', '1', '-an', '-f', 'null', '-']
        result = subprocess.run(cmd, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr[-1000:]
        match = re.search(r'All:([\d.]+)', result.stderr)
        assert match, 'Missing picture comparison'
        value = float(match.group(1))
        assert value > .985, f'Unexpected picture change in {name}: {value}'
        comparisons.append(dict(key=edit['key'], ssim=value))
    checks.append('Business, wallet and blockchain views match the original in every scene (SSIM above 0.985).')
    assert len(revision['paragraphs']) == 49
    assert all(1 <= p['speed'] <= 1.18 for p in revision['paragraphs'])
    transcripts = []
    voice_dir = ROOT/'.data/demo-recording/natural-voice'/revision['voice']
    for paragraph in revision['paragraphs']:
        key = paragraph['key']
        item = json.loads((voice_dir/(key+'.asr.json')).read_text())
        assert item['digest'] == paragraph['narrationDigest']
        context_file = voice_dir/(key+'.context-asr.json')
        context = json.loads(context_file.read_text()) if context_file.exists() else None
        if context and context['digest'] != item['digest']:
            context = None
        transcripts.append(dict(key=key, similarity=item['similarity'],
                                differences=item['differences'],
                                contextDifferences=context['differences'] if context else None))
    report = dict(checkedAt=datetime.now(timezone.utc).isoformat(), passed=True,
                  checks=checks, pictureComparisons=comparisons,
                  voice='Serena / Qwen3-TTS 1.7B / local synthetic narration',
                  paragraphs=49, transcriptReview=transcripts,
                  contentChecks='Unprompted transcription checked for every paragraph; ambiguous technical words also checked with domain vocabulary. Character-level homophone differences remain in ASR, and are retained here rather than hidden.',
                  listeningScope='Automated transcription and signal/timing checks; does not claim independent human listening approval.')
    (dest/'voice-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print('Voice revision verified: both videos, 49 scene images, unchanged transaction evidence.', flush=True)


if __name__ == '__main__':
    main()
