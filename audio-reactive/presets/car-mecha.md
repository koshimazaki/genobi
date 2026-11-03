---
preset: car-mecha
study: car-mecha
---

# car-mecha

Study id `car-mecha` · template Objects · [all presets](README.md) · [workflow](../README.md)

## What moves

- The `car-mecha` preset's 128 voxels morph from the gunmetal car (`#1b2a3a`) in silence to the gold mecha (`#d9a441`) at full bass. The car is the catalogue's `car` form: a low wedge about 2.2 m long, 1.0 m wide and 0.7 m tall, nose toward the camera, with a sloped hood, a cabin two thirds back, a flat rear with a spoiler bar and four wheel blocks. Its parts take the spacecraft's place in the part order, so the deck becomes the torso, the cabin the head, the wheels and bumpers the legs and the spoiler the wings.
- Both forms stand on the floor on one vertical axis, so the car folds up into the mecha in place.
- The morph reads the low band as swells above the take's own floor (`bassSwells`, shared with ship-mecha): its 75th percentile and below are the car, its 95th and above the mecha, each swell held 8 frames and released over 12. Release 30 and smooth 5 narrow the band, so any p75-to-p95 spread above 0.02 counts (`CAR_MIN_SWELL`; ship-mecha needs 0.05).
- Held front three-quarter view, 35 degrees round from the nose and 12 above, the mecha filling 55 percent of the frame height; turns on mid (twistY 0.2), no scale pulse.

## The still

Make the car still in Genobi Image from the guide's `frame-0000.png`.

**Composition it must match:** front three-quarter view from slightly above, the car low and centred on the floor in the lower half of the frame, its nose toward the lower left of the camera, and empty room above it for the standing mecha (`regions.car`).

Prompt to make it:

```text
a low futuristic sports car with a long sloped nose, a cabin set far back and a flat rear with a spoiler bar, dark gunmetal body with thin cyan light strips, parked on a wet dark studio floor with neon pink and cyan reflections, seen from the front three-quarter slightly above, hard key light, cyberpunk night, photographic
```

Add a peak still of the gold mecha warrior at the closed frame so the colour turns with the shape.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[car-mecha]`):

```text
A low futuristic sports car in dark gunmetal with cyan light strips sits on a wet dark studio floor under neon reflections, seen from the front three-quarter; on every bass swell its body folds and rises into a gold mecha warrior, then settles back into the car as the bass fades, turning slowly. Hard key light, still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies car-mecha --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 30 --band-smooth 5 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Dimensions 40.125 (w3, `guides-car/w3`): captured, **not rendered**. The band spans 0.772 (p75) to 0.800 (p95) there; with ship-mecha's 0.05 guard the first take (`guides-car/w3-guard005`) held the mecha from frame 0, which is why the car reads swells over 0.02.

## Knobs

193 frames, 1024x576, band gain auto, release 30, smooth 5, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `car`. The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the floor and light only.
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- The first still pins colour.
- The frame is set by the standing mecha, so the car is small, about an eighth of the frame height; its still must keep it that size.
