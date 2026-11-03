---
preset: studio-walls
study: studio-walls
---

# studio-walls

Study id `studio-walls` · template Rooms · [all presets](README.md) · [workflow](../README.md)

## What moves

- The booth of the 30 October cut: the small room turned across the frame, 3.2 x 2.4 x 2.5 m, four panelled walls, a drum kit left, a desk right, the idle mannequin bottom centre with its back to the camera.
- On the bass the walls clap in to **0.35** (`BOOTH_CLOSED`), clear of the singer.
- Camera held at (0, 6.4, 1.5) looking at (0, 0, -0.7), 38 degree lens, straight down.

## The still

Owner still: the booth shot of the 30 October cut.

**Composition it must match:** Straight down into the booth: panelled walls on all four sides of the frame, drum kit on the left, desk on the right, the singer at the bottom centre under one lamp.

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/studio-walls/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a small wood-panelled recording booth seen from above, a drum kit, a mixing desk, a singer with headphones under one warm lamp, photographic
```

Only for a space swap; the owner's still is the one to use.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[studio-walls]`):

```text
Straight down into a small wood-panelled recording booth: a drum kit, a mixing desk, a singer with headphones under one warm lamp; on the beat the booth's walls close in and open again. Still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies studio-walls --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Adaptive Reverb **23.6083** (`w-open2`): captured; opens at only 0.60 (auto gain lifts its quiet excerpt), shuts to 0.35. **Not rendered.**
- Better: a window from the 9-13 s vocal stretch, so it opens open.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `robot` (the singer). The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the panelling, the lamp or the kit; keep "the booth walls close in and open again".
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- The handoff lists the hall and booth at 0.25; the study's `BOOTH_CLOSED` is 0.35, which keeps the walls clear of the singer.
- Start on a quiet frame.
