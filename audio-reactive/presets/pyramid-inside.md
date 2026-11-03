---
preset: pyramid-inside
study: pyramid-inside
---

# pyramid-inside

Study id `pyramid-inside` · template Rooms (the base) · [all presets](README.md) · [workflow](../README.md)

## What moves

- A hollow stepped pyramid 36 m tall: 128 wall pieces and an oculus.
- On the low band the walls squeeze inwards in x and z to **0.3** of the open chamber (`morphControl`, low x 1.2, clamped at 1, so loud = closed); pieces keep their size. At full close the base terrace's inner face is 5 m from the centre, about 3 m from the lens.
- Camera 1 m above the floor, 85 degree lens, panning 45 degrees over the take, looking up toward the open top. A small figure stands 5.5 m ahead for scale.

## The still

Owner still (a Genobi Image edit of the reference-page first frame): a rusted sci-fi hangar interior with a gold robot.

**Composition it must match:** Camera at floor height looking up through a wide lens; the terraced walls fill both sides and climb to the bright opening at the top; the small figure stands on the floor right of centre in the lower half (its rectangle is `regions.robot` in `keyframes.json`).

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/pyramid-inside/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a rusted sci-fi hangar interior with riveted steel panels, cyan light strips, a gold robot, hard sunlight from the open top, photographic
```

This is the aesthetic the closed still was made with on the box (`look.py one --frame frame-closed-0096.png --reference look-first.png`), so first and closed match.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[pyramid-inside]`):

```text
Inside a vast hollow stepped pyramid the towering terraced walls contract on every bass hit and expand back, a small figure standing on the floor for scale, the camera low and wide, looking up toward the open top. Dim warm light from above.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies pyramid-inside --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Old 2 November excerpt: **rendered** (`pyramid-inside-layout-audio`), follow 0.97, bass 0.58, "best so far, proves the concept".
- Dimensions 16.0 (w0) and 24.0417 (w1) at gain 1: captured (`dim-g1`), bundles built; w0 was submitted when the box shut down, so **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `robot` only. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Interior swaps stay in the sci-fi family so the walls still read as terraces: keep "terraced walls", "open top" and "small figure" in the render prompt and change only the surfaces and light in the still prompt.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- Motion gain 2 saturates the blend: the walls slam shut on any bass. Use gain 1; the close is set by the study's 0.3.
- The first still pins colour and material for the whole take.
- Start each window on a quiet low-band frame so frame 0 is open and matches the still.
