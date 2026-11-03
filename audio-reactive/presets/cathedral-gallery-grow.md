---
preset: cathedral-gallery-grow
study: cathedral-gallery-grow
---

# cathedral-gallery-grow

Study id `cathedral-gallery-grow` · template Rooms · [all presets](README.md) · [workflow](../README.md)

## What moves

- The cathedral-gallery nave and camera, but each side piece keeps its outer face and **thickens inwards** until its inner face is at 0.25 of its open distance; pews, altar, far wall and ribs squeeze by the same fraction.

## The still

The same owner gallery still as [cathedral-gallery](cathedral-gallery.md): frame 0 is identical.

**Composition it must match:** As cathedral-gallery.

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/cathedral-gallery-grow/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a gothic cathedral nave in pale limestone seen from a high gallery, pews and an altar below, clustered piers and pointed arches on both sides, stained glass at the far end, shafts of soft daylight, photographic
```

Reuse the slide preset's still.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[cathedral-gallery-grow]`):

```text
Seen from a high gallery at one end of a gothic cathedral, the nave below with pews and an altar; on the beat the stone piers and arches swell inward, thickening toward the centre of the nave, and shrink back as the bass fades, stained glass at the far end, soft daylight. Still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies cathedral-gallery-grow --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Adaptive Reverb (`guides-cathedral-grow`): captured, **not rendered**.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → none. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** As cathedral-gallery.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- Gain 2 saturates the blend; use gain 1.
