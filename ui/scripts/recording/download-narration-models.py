"""Fetch pinned public models into the project's ignored audio workspace."""
import json
import hashlib
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import httpx
from huggingface_hub import HfApi, snapshot_download

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / '.data/demo-recording/natural-voice/models'
MODELS = {
    'tts': ('mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit', '41d3337e8b7f2843a75841595fc14e4b9a7a4b96'),
    'aligner': ('mlx-community/Qwen3-ForcedAligner-0.6B-8bit', '0e1a68e91d815300c7c9754b2a7639378b23db15'),
    'asr': ('mlx-community/Qwen3-ASR-0.6B-8bit', '89e96d92ba34aca20b3e29fb10cc284097d1219f'),
}

def fetch(item):
    kind, (repo, revision) = item
    print(f'Downloading {kind}: {repo} at {revision}', flush=True)
    path = snapshot_download(repo, revision=revision, local_dir=DEST/kind, token=False, max_workers=4,
                             ignore_patterns=['*.safetensors'])
    info = HfApi().model_info(repo, revision=revision, files_metadata=True, token=False)
    for file in info.siblings:
        if not file.rfilename.endswith('.safetensors'):
            continue
        target = DEST/kind/file.rfilename
        expected = file.lfs.sha256
        if target.exists() and hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() == expected:
            continue
        partial = target.with_suffix('.partial')
        # Reuse only a contiguous prefix from an interrupted HTTPS download.
        cache = target.parent/'.cache/huggingface/download'
        if '/' in file.rfilename:
            cache = DEST/kind/'.cache/huggingface/download'/Path(file.rfilename).parent
        candidates = sorted(cache.glob('*.'+expected+'.*.incomplete'), key=lambda p:p.stat().st_size, reverse=True)
        prefix = 0
        if not partial.exists() and candidates:
            candidates[0].rename(partial)
            prefix = partial.stat().st_size
        with httpx.Client(follow_redirects=True, timeout=60) as client:
            url = f'https://huggingface.co/{repo}/resolve/{revision}/{file.rfilename}'
            with client.stream('GET', url, headers={'Range':'bytes=0-1023'}) as response:
                response.raise_for_status()
                resolved = str(response.url)
            fd = os.open(partial, os.O_CREAT | os.O_RDWR, 0o644)
            os.ftruncate(fd, file.size)
            try:
                chunks = [(start, min(file.size, start+8*1024*1024)-1) for start in range(prefix, file.size, 8*1024*1024)]
                def get_chunk(bounds):
                    start, end = bounds
                    for attempt in range(5):
                        try:
                            r = client.get(resolved, headers={'Range':f'bytes={start}-{end}'})
                            r.raise_for_status()
                            if r.headers.get('content-range') != f'bytes {start}-{end}/{file.size}' or len(r.content) != end-start+1:
                                raise RuntimeError('Range mismatch')
                            os.pwrite(fd, r.content, start)
                            return
                        except Exception:
                            if attempt == 4:
                                raise RuntimeError(f'Model chunk download failed: {kind}/{file.rfilename} at {start}') from None
                            time.sleep(1+attempt)
                with ThreadPoolExecutor(max_workers=8) as pool:
                    for count, _ in enumerate(pool.map(get_chunk, chunks), 1):
                        if count % 24 == 0 or count == len(chunks):
                            print(f'{kind}/{file.rfilename}: {count}/{len(chunks)} chunks', flush=True)
            finally:
                os.close(fd)
        with partial.open('rb') as handle:
            assert hashlib.file_digest(handle, 'sha256').hexdigest() == expected, 'Model file checksum mismatch'
        partial.replace(target)
    print(f'Ready: {kind}', flush=True)
    return kind, dict(repo=repo, revision=revision, path=str(Path(path).resolve()))

if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        result = dict(pool.map(fetch, MODELS.items()))
    (DEST/'models.json').write_text(json.dumps(result, indent=2))
