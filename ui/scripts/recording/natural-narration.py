"""Local neural narration, with pinned models and per-paragraph caches.

Run after download-narration-models.py. Never reads wallets or changes the demo.
The source story and edit durations are exported by prepare-natural-narration.mjs.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path

import mlx.core as mx
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / '.data/demo-recording/natural-voice'
STYLE = ('请用自然、温和而沉稳的普通话，像熟悉产品的同事面对面讲解操作。'
         '语气亲切可信，语速适中，按意思自然停顿，句子之间连贯，有轻微的重音和语调变化。'
         '避免播音腔、广告腔、夸张情绪和逐字朗读。英文缩写清晰准确。')


def spoken(text):
    return text.replace('MetaMask', 'Meta Mask').replace('Blockscout', 'Block Scout').replace('USDC', 'U S D C').replace('链上准入', '链上，准入')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--keys', default='')
    parser.add_argument('--speaker', default='Serena')
    parser.add_argument('--batch-size', type=int, default=3)
    parser.add_argument('--seed', type=int, default=20260924)
    args = parser.parse_args()
    rows = json.loads((WORK/'story.json').read_text())
    if args.keys:
        rows = [row for row in rows if row['key'] in args.keys.split(',')]
    model_meta = json.loads((WORK/'models/models.json').read_text())['tts']
    dest = WORK/args.speaker
    dest.mkdir(parents=True, exist_ok=True)
    pending = []
    retakes_file = Path(__file__).with_name('narration-retakes.json')
    retakes = json.loads(retakes_file.read_text()) if retakes_file.exists() else {}
    for row in rows:
        instruct = STYLE+retakes.get(row['key'], '')
        config = dict(text=spoken(row['text']), speaker=args.speaker, instruct=instruct,
                      model=model_meta['repo'], revision=model_meta['revision'],
                      engine='mlx-audio 0.5.5', temperature=.7, top_p=.95, seed=args.seed)
        digest = hashlib.sha256(json.dumps(config, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        meta = dest/(row['key']+'.json')
        if meta.exists() and (dest/(row['key']+'.wav')).exists() and json.loads(meta.read_text()).get('digest') == digest:
            continue
        pending.append((row, config, digest))
    if not pending:
        print('All narration cached.', flush=True)
        return
    print('Loading local voice model.', flush=True)
    model = load_model(WORK/'models/tts')
    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset:offset+args.batch_size]
        # Fixed per-batch seed is recorded; cache is tied to model, text and style.
        mx.random.seed(args.seed)
        started = time.monotonic()
        print('Generating: '+', '.join(row['key'] for row, _, _ in batch), flush=True)
        results = model.batch_generate(
            texts=[config['text'] for _, config, _ in batch],
            voices=[args.speaker]*len(batch), instructs=[config['instruct'] for _, config, _ in batch],
            lang_code='Chinese', temperature=.7, top_p=.95,
            repetition_penalty=1.05, max_tokens=1800, verbose=False)
        for result in results:
            row, config, digest = batch[result.sequence_idx]
            audio = np.asarray(result.audio, dtype=np.float32).reshape(-1)
            assert np.isfinite(audio).all() and len(audio) > result.sample_rate
            path = dest/(row['key']+'.wav')
            sf.write(path, audio, result.sample_rate, subtype='PCM_24')
            metadata = dict(digest=digest, config=config, sampleRate=result.sample_rate,
                            samples=len(audio), seconds=len(audio)/result.sample_rate,
                            originalSceneSeconds=row['seconds'],
                            generationSeconds=round(time.monotonic()-started, 2),
                            batchKeys=[r['key'] for r, _, _ in batch])
            (dest/(row['key']+'.json')).write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
            print(f"Ready {row['key']}: {metadata['seconds']:.2f}s (scene {row['seconds']:.2f}s)", flush=True)
        mx.clear_cache()


if __name__ == '__main__':
    main()
