---
preset: diamond
study: diamond
---

# diamond

Study id `diamond` · template Objects · [all presets](README.md) · [workflow](../README.md)

## What moves

- One faceted diamond (128 voxels) at 0.65 scale, 8 m over the floor: scale on low (0.9), lift on sub (1.5), twistY on mid (0.3).
- The camera orbits once at radius 26, elevation 3. Measured on a 193-frame capture: median motion 1.3, correlation with low 0.60.

## The still

Klein text-only look from the guide's `frame-0000.png`.

**Composition it must match:** The diamond centred above a flat floor with clean sky around it (`regions.diamond`).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/diamond/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a faceted crystal diamond floating over a desert at dusk, clean gradient sky, photographic
```

The aesthetic used for the box look.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[diamond]`):

```text
A single faceted diamond hovers above a flat lit floor and breathes with the music, swelling on every bass hit and settling between them while the camera circles it once. Clean background, one light source, crisp edges.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies diamond --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Adaptive Reverb guide set (`guides-adaptive`): captured, Klein look made, **not rendered** (the start is not recorded in the handoff).

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `diamond`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Keep the background clean so the motion transmits.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- Still uses `spread` (all three axes), so a strong hit can read as a zoom; a busy background absorbs the motion.
