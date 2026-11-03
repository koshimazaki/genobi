---
preset: fruit-apple-banana
study: fruit-apple-banana
---

# fruit-apple-banana

Study id `fruit-apple-banana` · template Fruits (single morph) · [all presets](README.md) · [workflow](../README.md)

## What moves

- One fruit, 96 voxels, morphs continuously from the apple (silence) to the banana (full bass): progress is low x 1.2, clamped at 1.
- Pulses on low (scale 0.3), twists on mid (0.2); front view at 8 degrees, the rest fruit framed to half the frame. Rubik flecks: a quarter of the voxels carry the other fruit's colour.

## The still

Klein or owner still of the rest fruit, plus a peak still at the closed frame.

**Composition it must match:** Front view, the fruit centred at half the frame height over a dark studio floor (`regions.fruit`).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/fruit-apple-banana/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a single red apple built from matte cubes hovering over a dark studio floor, hard studio light, photographic
```

Peak still (closed frame): `a single ripe yellow banana built from matte cubes hovering over a dark studio floor, hard studio light, photographic`, made from `frame-closed-NNNN.png` with the first still as reference.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[fruit-apple-banana]`):

```text
A single red apple hovers over a dark studio floor, seen from the front; on every bass swell it stretches and bends into a ripe yellow banana and relaxes back into the apple as the bass fades. Hard studio light, still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies fruit-apple-banana --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 30 --band-smooth 5 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Fruit loop, gain 2: **rendered** (`apple-to-banana-fruit-song`): the shape morphs but stays red; gain 2 sticks at the banana.
- Fruit loop, start 0 with Rubik flecks, release 30, smooth 5, gain 1 (`guides-fruits-rubik`): captured, **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 30, smooth 5, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `fruit`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the floor and light only.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- The first still pins colour: without the peak still the banana stays red.
- Gain 2 reaches the banana at half the band and holds it.
