---
preset: towers-descent
study: towers-descent
---

# towers-descent

Study id `towers-descent` · template Rooms · [all presets](README.md) · [workflow](../README.md)

## What moves

- Ten 60 m glass towers in two rows at x ±18.4 and a 36-piece gothic cathedral in the street (`recipes-clap.ts`).
- On the bass the whole street squeezes in x to **0.25** (`CLAP_FRACTION`, "walls closing like clapping"), sizes included, so the rows nearly meet and nothing collides.
- Camera descends from (0, 88, 24) looking at (0, 0, -23) to (0, 42, -2) looking at (0, 0, -28), 42 degree lens; 2 m clear of every piece at full close.

## The still

Owner still: a top-down Manhattan street at golden hour, framed on the reference-page first frame.

**Composition it must match:** High above the street looking down and forward: a tower row down each side of the frame, the street between them leading to the cathedral facade in the lower middle distance.

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/towers-descent/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
two rows of Manhattan glass office towers at golden hour seen from high above the street, a gothic cathedral facade far below, warm reflections in the glass, hard afternoon light, photographic
```

Derived from the box's canyon and falling aesthetics; the owner's still is the one that rendered.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[towers-descent]`):

```text
Seen from high above, two rows of Manhattan glass office towers at golden hour close in toward the street and open again on the beat while the camera descends between them toward a gothic cathedral facade below. Warm reflections in the glass, hard afternoon light, no people.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies towers-descent --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Adaptive Reverb 0 (w0): **rendered** (`towers-descent-adaptive-w0`), follow 0.87, "does exactly what I wanted with the buildings". That take was captured at motion gain 2 (`takes.sh`); re-capture at gain 1.
- Adaptive Reverb 8.0417 (w1), release 12 and 6: captured and bundled, **not rendered**.
- Two reverb mixes of w0 exist: room reverb and bass-ducked reverb (see [spaces](../videos/spaces.md)).

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → none. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the city, the light or the facade in the still prompt; keep "two rows of … towers" and "cathedral facade below" in the render prompt.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- The first still pins the light; a blue-hour still will not turn golden.
