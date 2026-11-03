---
preset: ship-mecha
study: ship-mecha
---

# ship-mecha

Study id `ship-mecha` · template Objects · [all presets](README.md) · [workflow](../README.md)

## What moves

- The `spacecraft-mecha` preset's 128 voxels morph from the silver spacecraft (`#c9ced6`) in silence to the gold mecha (`#d9a441`) at full bass; the mecha's feet 0.4 m above the floor, so the ship hovers higher.
- The morph reads the low band as swells above the take's own floor (`bassSwells`): its 75th percentile and below are the ship, its 95th and above the mecha, each swell held 8 frames and released over 12.
- Front view at 10 degrees, the mecha filling 60 percent of the frame height; turns on mid (twistY 0.2), no scale pulse.

## The still

Klein text-only look from the guide's `frame-0000.png`.

**Composition it must match:** Front view, the spacecraft centred and hovering over a dark studio floor, room above and below for the taller mecha (`regions.ship`).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/ship-mecha/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a sleek silver spacecraft hovering over a dark studio floor, seen from the front, hard studio light, photographic
```

Add a peak still of the gold mecha warrior at the closed frame so the colour turns with the shape.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[ship-mecha]`):

```text
A sleek silver spacecraft hovers over a dark studio floor, seen from the front; on every bass swell its hull folds and reassembles into a gold mecha warrior, then relaxes back into the spacecraft as the bass fades, turning slowly. Hard studio light, still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies ship-mecha --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Dimensions 40.125 (w3, `guides-ship/w3`): captured, **not rendered**. On that window the raw auto-gained band never fell under 0.54, which is why the study reads swells over the take's own floor.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `ship`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the floor and light only.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- The first still pins colour.
