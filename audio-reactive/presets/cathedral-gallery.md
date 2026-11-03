---
preset: cathedral-gallery
study: cathedral-gallery
---

# cathedral-gallery

Study id `cathedral-gallery` · template Rooms · [all presets](README.md) · [workflow](../README.md)

## What moves

- A 90-piece nave: six bays of 30 m piers with pointed arcade heads and a gallery ledge, aisle walls, a far wall with three pointed arches and windows, pews, an altar, vault ribs at 31 m above the camera (`recipes-clap.ts`).
- On the bass the whole nave slides inwards in x to **0.25**.
- Camera held at (0, 23, 18) looking at (0, 0, -3), 66 degree lens; 2 m clear of every piece at full close.

## The still

Owner still: the gallery view of the nave from the reference-page first frame.

**Composition it must match:** From a high gallery at the west end looking down the nave: piers and arches down both sides, pews in two blocks below, the altar and stained glass at the far end in the upper middle.

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/cathedral-gallery/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a gothic cathedral nave in pale limestone seen from a high gallery, pews and an altar below, clustered piers and pointed arches on both sides, stained glass at the far end, shafts of soft daylight, photographic
```

Built on the box's cathedral-walls aesthetic (`a gothic cathedral nave in pale limestone, clustered columns, tall stained glass, shafts of soft daylight, photographic`).

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[cathedral-gallery]`):

```text
Seen from a high gallery at one end of a gothic cathedral, the nave below with pews and an altar, stone piers and arches on both sides closing in toward the centre and opening again on the beat, stained glass at the far end, soft daylight. Still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies cathedral-gallery --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Adaptive Reverb 0 (w0) and 8.0417 (w1): captured (`guides-cathedral`). w0 was submitted when the box shut down: **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → none. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the stone, the glass or the light; keep "piers and arches on both sides" in the render prompt so the slide reads.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- Gain 2 saturates the blend; use gain 1.
