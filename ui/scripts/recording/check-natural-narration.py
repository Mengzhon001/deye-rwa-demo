"""Transcribe and word-align generated speech locally before video compositing."""
import argparse
import difflib
import json
import re
from pathlib import Path

import mlx.core as mx
from mlx_audio.stt.utils import load_model
from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT/'.data/demo-recording/natural-voice'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--speaker', default='Serena')
    parser.add_argument('--keys', default='')
    parser.add_argument('--available', action='store_true', help='Check already completed paragraphs while synthesis continues.')
    parser.add_argument('--context-review', action='store_true', help='Keep a second transcription with domain vocabulary for ambiguous words.')
    args = parser.parse_args()
    rows = json.loads((WORK/'story.json').read_text())
    if args.keys:
        rows = [r for r in rows if r['key'] in args.keys.split(',')]
    folder = WORK/args.speaker
    if args.available:
        rows = [r for r in rows if (folder/(r['key']+'.wav')).exists() and (folder/(r['key']+'.json')).exists()]
    asr = load_model(WORK/'models/asr')
    converter = OpenCC('t2s')
    for row in rows:
        meta = json.loads((folder/(row['key']+'.json')).read_text())
        path = folder/(row['key']+'.asr.json')
        if path.exists() and json.loads(path.read_text()).get('digest') == meta['digest']:
            continue
        result = asr.generate(str(folder/(row['key']+'.wav')), language='Chinese', max_tokens=1024)
        text = converter.convert(result.text)
        normalized = lambda s: re.sub(r'[^\w]', '', s).lower()
        a, b = normalized(meta['config']['text']), normalized(text)
        similarity = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
        differences = [dict(expected=a[i:j], heard=b[k:l], kind=kind)
                       for kind, i, j, k, l in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
                       if kind != 'equal']
        path.write_text(json.dumps(dict(digest=meta['digest'], expected=meta['config']['text'],
                                       transcript=text, similarity=similarity, differences=differences), ensure_ascii=False, indent=2))
        print(f"ASR {row['key']}: {similarity:.3f} {json.dumps(differences, ensure_ascii=False)}", flush=True)
    if args.context_review:
        vocabulary = ['MetaMask', 'Blockscout', 'USDC', '链上准入', '电站', '德业', '收益权',
                      '受托管理人', '复核', '待赎回份额', '季度分配', '净值', '到期', '现金流']
        for row in rows:
            meta = json.loads((folder/(row['key']+'.json')).read_text())
            first = json.loads((folder/(row['key']+'.asr.json')).read_text())
            if not first['differences']:
                continue
            result = asr.generate(str(folder/(row['key']+'.wav')), language='Chinese', max_tokens=1024, hotwords=vocabulary)
            text = converter.convert(result.text)
            a = re.sub(r'[^\w]', '', meta['config']['text']).lower()
            b = re.sub(r'[^\w]', '', text).lower()
            differences = [dict(expected=a[i:j], heard=b[k:l], kind=kind)
                           for kind, i, j, k, l in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()
                           if kind != 'equal']
            report = dict(digest=meta['digest'], transcript=text, hotwords=vocabulary, differences=differences,
                          purpose='Vocabulary disambiguation only; does not replace the unprompted transcript or human listening.')
            (folder/(row['key']+'.context-asr.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2))
            print(f"Context ASR {row['key']}: {json.dumps(differences, ensure_ascii=False)}", flush=True)
    del asr
    mx.clear_cache()
    aligner = load_model(WORK/'models/aligner')
    for row in rows:
        meta = json.loads((folder/(row['key']+'.json')).read_text())
        path = folder/(row['key']+'.alignment.json')
        if path.exists() and json.loads(path.read_text()).get('digest') == meta['digest']:
            continue
        result = aligner.generate(str(folder/(row['key']+'.wav')), text=meta['config']['text'], language='Chinese')
        items = [dict(text=r.text, start=r.start_time, end=r.end_time) for r in result]
        assert items and all(0 <= r['start'] <= r['end'] <= meta['seconds']+.2 for r in items)
        path.write_text(json.dumps(dict(digest=meta['digest'], items=items), ensure_ascii=False, indent=2))
        print(f"Aligned {row['key']}: {len(items)} speech tokens.", flush=True)


if __name__ == '__main__':
    main()
