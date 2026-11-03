---
preset: fruit-mecha-morph
study: fruit-mecha-morph
---

# fruit-mecha-morph

Study id `fruit-mecha-morph` · template Fruits (morph) · [all presets](README.md) · [workflow](../README.md)

## What moves

- The fruit-mecha scene with no cues: banana | apple at rest and papaya | banana at the peak, 96 voxels per fruit, blended continuously by `morphControl` on low (x 1.2).
- Glow 0.6, pulse 0.15, Rubik flecks (a quarter of the body voxels swap colours between the keys).

## The still

The fruit-mecha owner still; frame 0 has the same banana | apple pair.

**Composition it must match:** As [fruit-mecha](fruit-mecha.md).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/fruit-mecha-morph/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a blocky grey and gold mecha robot standing on a dark studio sweep between a yellow banana and a red apple floating at shoulder height, both fruits built from matte cubes, hard studio light, photographic
```

Add a peak still at the closed frame (papaya | banana) with `look.py one --frame frame-closed-NNNN.png --reference look-first.png` so the colour follows the shape.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[fruit-mecha-morph]`):

```text
A blocky grey and gold mecha dances on a dark studio floor between two fruits at shoulder height; on every bass swell the fruits swell and glow and change into other fruits, a banana becoming a papaya and an apple becoming a banana, and relax back as the bass fades. Hard studio light, still camera, energetic dancing.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies fruit-mecha-morph --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 30 --band-smooth 5 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Fruit loop x3, starts 0, 8.0417, 16.0833 at gain 1, release 30, smooth 5 (`guides-fruits-morph-g1`): captured, **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 30, smooth 5, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `robot`, `fruit-left`, `fruit-right`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** As fruit-mecha.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- The take does not open on a clean rest pair: the loop's bass is high at frame 0 and release 30 holds it. Nudge the start or accept.
- The first still pins colour; the peak still is the fix (untested together with the coloured guide).
