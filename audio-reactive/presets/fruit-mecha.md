---
preset: fruit-mecha
study: fruit-mecha
---

# fruit-mecha

Study id `fruit-mecha` · template Fruits (explode) · [all presets](README.md) · [workflow](../README.md)

## What moves

- The dancer, front-on from 1 m with a 40 degree lens, fills 85 percent of the frame between two fruits at shoulder height, x -0.95 and +0.95.
- Banana left and apple right at rest. On each of the two strongest low peaks (2 s apart) both step Banana, Papaya, Apple, so they always differ.
- Each change is a burst: the fruit holds until 8 frames before the peak; at the peak every voxel has flown 3 to 4 fruit radii outward; the next fruit is whole 8 frames after. 48 voxels per fruit (the 64 KB recipe bound).
- Both fruits pulse on low (scale 0.15) and glow on low (0.5).

## The still

Owner still (`looks-vox/fruit-mecha`): a blocky mecha between cube-built fruit on a dark sweep.

**Composition it must match:** Front view at chest height; the robot centred from head to just below the feet, filling most of the height; a banana left and an apple right at shoulder height, clear of the arms (`regions.robot`, `regions.fruit-left`, `regions.fruit-right`).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/fruit-mecha/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a blocky grey and gold mecha robot standing on a dark studio sweep between a yellow banana and a red apple floating at shoulder height, both fruits built from matte cubes, hard studio light, photographic
```

Colours must match the guide's (banana `#f2d14b`, papaya `#f0a040`, apple `#c8322b`).

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[fruit-mecha]`):

```text
A blocky mecha figure dances on a dark studio sweep between a banana and an apple floating at shoulder height; on the heavy beats each fruit bursts apart into flying blocks that reassemble as another fruit, and both swell and glow with the bass. Hard studio light, still camera, front view.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies fruit-mecha --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- 2 November excerpt: **rendered** (`fruit-mecha-layout-audio`), follow 0.86, bass 0.43, "really good"; swaps land on the beat; the uncoloured papaya was painted as an apple (since fixed: every voxel carries its fruit's colour).
- Fruit loop x3, start 0 (w0): **rendered** from the gain-2 take (`mecha-explode-fruit-song-w0`).
- Fruit loop x3, starts 0, 8.0417, 16.0833 at gain 1, release 12, fruits at ±0.95 m (`guides-fruits-explode-g1`): captured, **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `robot`, `fruit-left`, `fruit-right`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the sweep and light only; the robot and fruit are subject swaps.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- Fruits sit at ±0.95 m: at 1.1 they read as too far; the pulse is 0.15 so they stay in frame at full bass and gain 1 (a test keeps every voxel inside the frustum).
- Gain 2 pushed the fruits out of the picture.
- Seven keys must fit 64 KB, hence 48 coarser voxels per fruit.
