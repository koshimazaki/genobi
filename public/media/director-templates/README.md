# Director offline template previews

These videos were exported from Director's browser renderer on 18 October 2026,
then transcoded to smaller H.264/AAC previews. Each is six seconds, 360 × 640,
30 fps / 180 frames. ZIP files are the corresponding editable Director bundles.
All artwork is an original deterministic illustration, not a model generation.
Outfit reveal shows two prepared looks; no garment transfer is implied.

The editable templates are assembled by `src/director/remix-template.ts` using
`template-catalogue.ts`, the registered caption recipe and supplied pulse audio.
The artwork generator is `scripts/generate-director-template-art.py` (Pillow).
To refresh a preview, open the matching template, export MP4 and save its editable
project. Verify decoded duration/frames and text before replacing these files.
