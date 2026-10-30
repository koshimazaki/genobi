# Layout-to-video: studio input preset

## What it makes

`world-builder-l2r-a2v-studio.json` is an input preset of
[Layout-to-video](world-builder-l2r-a2v.README.md), not another endpoint.

## Inputs and placeholders

Use the same tokens, with your studio take, recipe, reference and track.
Select `--endpoint layout-to-video --preset studio` when materializing.
Only node 9's guide width/height and node av3's mask width/height differ:
1024 × 576 instead of 1280 × 704. Output is 2048 × 1152. Tests enforce that
these four input values are the entire difference.

## Models

Exactly the same six weights and three node packs as Layout-to-video.
No additional build or model set is needed.

## Recorded result

`l2r9-studio-a2v` made the wooden studio shot used in the v5 cuts; the vocalist
turned and smiled (30 October 2026, RTX PRO 6000 96 GB, ComfyUI 0.41.0).

## Limits

All Layout-to-video limits apply, including reference-angle sensitivity and
static CPU room response. Neither preset has been rerun by this port or on
the Developer Platform. Private inputs are not included.
