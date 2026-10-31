#!/usr/bin/env python3
"""Prepare a bounded atlas from the existing silent Bloom take. No generation."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/media/director-templates/bloom-teaser/bloom-h3-b.mp4'
EXPECTED = '5276e31e954a068d60a9b8a66fe3a5d4b0568cefdc1009a880a93243816b1114'
OUT = Path(__file__).parent / 'media'


def main():
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != EXPECTED:
        raise ValueError('The source changed; review its identity before rebuilding.')
    OUT.mkdir(exist_ok=True)
    atlas = OUT / 'bloom-atlas.jpg'
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(SOURCE),
        '-vf', 'fps=24,scale=480:270:flags=lanczos,tile=8x16:nb_frames=128',
        '-frames:v', '1', '-q:v', '3', '-map_metadata', '-1', '-y', str(atlas),
    ], check=True)
    metadata = dict(
        source=str(SOURCE.relative_to(ROOT)), sourceSha256=digest,
        atlasSha256=hashlib.sha256(atlas.read_bytes()).hexdigest(),
        atlasBytes=atlas.stat().st_size, columns=8, rows=16, frames=128,
        width=480, height=270, fps=24, primaryOffsetFrames=16,
        studyFrames=96, sourceStartSeconds=0,
        provenance='Existing owner-supplied MiniMax H3 output; no new generation.',
    )
    (OUT / 'source.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
