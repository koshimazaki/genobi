---
preset: pyramid-outside
study: pulse
---

# pyramid-outside

Study id `pulse` · template Objects · [all presets](README.md) · [workflow](../README.md)

## What moves

- One stepped pyramid on open ground scales on the low band and lifts on the sub band (guide motion-to-bass correlation 0.86).
- The camera circles it once.

## The still

Klein text-only look made on the box from the guide's `frame-0000.png`.

**Composition it must match:** The pyramid centred on a low horizon, seen from a few degrees above the ground, sky filling the upper half; the whole pyramid inside the frame with ground around it.

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/pulse/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a stepped sandstone pyramid in an empty desert at late afternoon, long shadows, clean pale sky, photographic
```

The longer desert aesthetic in LOOK.md (`a lone limestone pyramid in a vast desert at late afternoon, …`) gave follow 0.92 and bass 0.65 on 2 November at release 10, gain 1.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[pulse]`):

```text
A lone pyramid on open ground swells and settles with the music while the camera circles it once. Clean sky, long shadows, still air.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies pulse --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- 2 November excerpt, desert look: **rendered**, follow 0.92 (1920x1024), the proven control.
- Dimensions 32.0833 (w2) at gain 1: captured, Klein look made, bundle `pulse-dimg1-w2` built, **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → none (no avatar, no morph group); a subject swap here is a new study, not a region edit. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** A clean background transmits the motion; a dense photoreal city absorbs it (cyberpunk city follow 0.55 against desert 0.88). Swap to another open, uncluttered setting.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- A pure pulse tolerates motion gain 2; the blend studies do not.
- Dense looks absorb the motion; keep the sky clean.
