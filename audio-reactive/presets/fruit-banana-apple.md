---
preset: fruit-banana-apple
study: fruit-banana-apple
---

# fruit-banana-apple

Study id `fruit-banana-apple` · template Fruits (single morph) · [all presets](README.md) · [workflow](../README.md)

## What moves

- The reverse of [fruit-apple-banana](fruit-apple-banana.md): the banana in silence, the apple at full bass, with Rubik flecks (the banana flecked red, the apple flecked yellow).

## The still

Klein or owner still of the banana, plus a peak still of the apple at the closed frame.

**Composition it must match:** Front view, the banana centred at half the frame height over a dark studio floor (`regions.fruit`).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/fruit-banana-apple/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a single ripe yellow banana built from matte cubes hovering over a dark studio floor, hard studio light, photographic
```

Peak still: `a single red apple built from matte cubes hovering over a dark studio floor, hard studio light, photographic`.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[fruit-banana-apple]`):

```text
A single ripe yellow banana hovers over a dark studio floor, seen from the front; on every bass swell it curls and rounds into a red apple and relaxes back into the banana as the bass fades. Hard studio light, still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies fruit-banana-apple --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 30 --band-smooth 5 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Fruit loop, gain 2: **rendered** (`banana-to-apple-fruit-song`).
- No gain-1 Rubik take captured yet; capture with the line above.

## Knobs

193 frames, 1024x576, band gain auto, release 30, smooth 5, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `fruit`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the floor and light only.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- As fruit-apple-banana: the first still pins colour, gain 2 sticks.
