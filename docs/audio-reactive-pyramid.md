---
tags: [workflows, comfy, models, world-builder]
summary: How to repeat the audio-reactive pyramid — World Builder guide capture with measured band gain, a look still, LTX-2.5 Layout-to-Render on a rented GPU, and the checks that prove the motion follows the music.
---

# Audio-reactive pyramid: how to repeat it

One repeatable piece: **music → World Builder animation → look still →
LTX-2.5 Layout-to-Render → the dry track muxed back**. First proven on
2 November 2026 on a rented RTX PRO 6000 (96 GB). This page is the recipe;
[the Vast runner](vast-runner.md) and [the experiments README](../workflows/experiments/README.md)
hold the tool contracts.

## Why the earlier pilots did not move

The World Builder band envelopes are raw RMS values: on the Dimensions mix
excerpt the low band averages 0.04 and peaks near 0.3. The architecture
study's stock mappings (lift 1.2, scale 0.18, spread 0.25, intensity 0.5)
therefore moved a 44-unit scene by hundredths of a unit. Measured as mean
frame-to-frame grey difference at 192×112, the guide's median motion was
0.15 with a motion-to-bass correlation of 0.03: static between the two
authored cues. No LTX setting can add motion the guide does not carry.

## The capture knobs

`node scripts/experiments/capture.mjs` gained these options, all recorded in
`study.json` under `reactivity`:

| Option             | What it does                                                                                | Value used                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `--band-gain auto` | per band, scale so the 95th percentile sits at 0.8, clamped to 1                            | `auto`                                                     |
| `--band-release N` | peak follower: instant attack, exponential release over N frames (a hit holds, then decays) | 10 to 12 (about half a second)                             |
| `--band-smooth N`  | moving average over N frames before gain                                                    | 9 when no release is used                                  |
| `--motion-gain N`  | multiply every mapping amount within its validated range; above 1 sets intensity to 1       | 1 (pulse), 3 (morph), 4 (cathedral), 20 (falling)          |
| `--radius N`       | camera distance in world units                                                              | 26 (pulse, matched to a low still), 72 (morph with towers) |
| `--elevation DEG`  | camera elevation                                                                            | 3 to 9 for a near-ground still                             |
| `--orbit DEG`      | camera orbit over the take; 360 is one full turn                                            | 360                                                        |
| `--avatar`         | the idle mannequin inside the room, for scale                                               | room studies                                               |

Measured on the architecture guide (193 frames):

| Capture                      | Median motion | Corr. mid | Corr. high | Note                             |
| ---------------------------- | ------------- | --------- | ---------- | -------------------------------- |
| stock                        | 0.15          | 0.13      | 0.23       | static between cues              |
| gain 3                       | 6.2           | 0.42      | 0.62       | towers clip the top at radius 44 |
| gain 6                       | 14.3          | 0.51      | 0.66       | cubes scatter out of frame       |
| gain 3, radius 72, orbit 360 | 2.0           | 0.42      | 0.64       | everything in frame              |

Studies for the pyramid: `architecture` (pyramid, towers, diamond on two
cues), `pulse` (one pyramid scaling on the low band and lifting on the sub
band; guide motion-to-bass correlation 0.86), `rubik` (terraces twisting
against each other on the mid band, twist 0.55; at 1.6 the silhouette is
lost) and Hermes' `clockwork`. For rooms: `falling` (city towers, cathedral
nave, small room, with the dynamic CPU reverb rendered beside the guide) and
`cathedral` (one nave held throughout, gallery camera, piers spreading on the
bass). The room box in those two is invisible, so `roomWidth`, `roomDepth`
and `roomHeight` mappings move the acoustics only; visible wall distance
comes from `spread` on the pier objects.

## What the video actually followed

Follow = correlation of per-frame motion, generated against guide, with the
camera drift high-passed out; bass = correlation of the generated motion with
the low band. 193 frames unless noted, seed 42, `layout-audio` unless noted.

| Guide                        | Look           | Size      | Follow | Bass |
| ---------------------------- | -------------- | --------- | ------ | ---- |
| pulse, release 10, gain 1    | desert         | 1920x1024 | 0.92   | 0.65 |
| pulse, 97 frames             | desert         | 1920x1024 | 0.84   | 0.76 |
| pulse                        | desert         | 1536x896  | 0.88   | 0.63 |
| pulse                        | anime neon     | 1536x896  | 0.76   | 0.64 |
| pulse                        | cyberpunk city | 1536x896  | 0.55   | 0.32 |
| orbit morph                  | desert         | 1536x896  | 0.71   | 0.18 |
| orbit morph (`layout`)       | anime neon     | 1536x896  | 0.78   | 0.08 |
| orbit morph                  | cyberpunk city | 1536x896  | 0.13   | 0.08 |
| falling, gain 20             | anime NYC      | 1920x1024 | 0.65   | 0.35 |
| rubik, twist 0.55, 97 frames | desert         | 1920x1024 | 0.49   | 0.49 |

Three rules fall out. A clean background (desert sky, flat anime) transmits
the layout's motion; a dense photoreal look absorbs it. Continuous motion
(scale, lift, spread) transmits the music; discrete state changes are painted
on top of the previous shape rather than replacing it. A peak-then-decay
envelope follows best, because the generation cannot keep up with a value
that jumps every frame.

## The look still

The model card's rule holds: the look must be a different image from the
grey guide frame, aligned to its camera, at the guide's aspect ratio (the
prepare step allows one output pixel of rounding). Owner-supplied stills were
centre-cropped with ffmpeg to 1536:896 (768×448 guides) or 1920:1024
(960×512 guides). A clean background (the desert pyramid) blurs far less
during the orbit than a dense city.

## New studies: the space moves, the camera holds

`cathedral-walls`, `canyon`, `room-walls` and `pyramid-inside` hold the camera
still (pyramid-inside pans 45 degrees) and move the space on the `low` band.

- **Sideways-only close (cathedral-walls, canyon, pyramid-inside).** Two
  states that differ only in distance from the centre: nave x, street z (both
  0.55 when closed), pyramid x and z (0.3, a much smaller chamber; the
  blend position is clamped at 1, so `--motion-gain` cannot squeeze past the
  closed layout, which is why the pyramid has its own fraction). `motion.morphControl` blends them
  with a manual baseline of 0 (open) plus `low × 1.2`, so loud = closed and
  the timeline clock never moves the walls. `stateAudio` cannot do this
  because it blends from the timeline pair, so the closed state would sit on
  the timeline. `--motion-gain` scales the blend amount too, up to 2.
- **Why not `spread`.** `spread` multiplies each piece's distance from
  `motion.pivot` by `1 + spread` (negative = loud closer) on all three axes, so
  walls also sink and the scene seems to zoom. Only `diamond` and the voxel
  studies still use it.
- **Reverb box.** The room box shrinks on the same bars in every study:
  `roomWidth`/`roomDepth` mappings in cathedral-walls, canyon and room-walls,
  and a smaller closed-state box (×0.3) in pyramid-inside.
- **Box sizes.** The engine limits each box axis to 0.1-8 and `scale` to
  0.1-32, so long pieces carry their length in `scale` (`sized()` in
  `recipe-parts.ts`).
- **cathedral-walls** is a 146-piece gothic nave (`cathedral-nave.ts`):
  clustered columns, a pointed arcade, a clerestory, side aisles with
  lean-to roofs, a ribbed vault meeting at a 21 m ridge, an apse wall with a
  pointed window and a floor. Closing narrows the whole nave in x, with rib
  angles recomputed so the ridge holds. The vault would roof over a high
  gallery view, so the camera holds a west-end loft below it at (0, 12, 15).
  The nearest piece stays 4.8 m from the lens at full close.
- **room-walls** is an empty small room (4.8 × 2.6 × 3.9 m, every apartment
  piece hidden) with the dancer at the centre and the camera at eye height.
  At full bass the room is 2.8 × 2.3 m, the walls 1.4 m from the dancer.
- **pyramid-inside** is a hollow stepped pyramid three times larger, 36 m tall
  with 128 wall pieces and an oculus. It is shot from 1 m above the floor with
  an 85 degree lens, panning 45 degrees, the figure 5.5 m ahead for scale.
  At full close the base terrace's inner face is 5 m from the centre, about
  3 m from the lens.
- **pyramid-inside-spin** is the same interior, close and figure, with the
  camera 1.2 m above the floor centre (0.5 m off the axis, looking through
  it about 10 degrees up) turning one full 360 degrees. The turn is the
  camera path's `orbit`, not keys, so the heading advances by the same angle
  every frame at 97, 193 or 241 frames.
- **towers-descent** (`recipes-clap.ts`) is framed on the owner's top-down
  Manhattan still (`looks/falling/look-first.png`): ten 60 m glass towers in
  two rows at x ±18.4 and a 36-piece gothic cathedral in the street. Frame 0
  is the camera at (0, 88, 24) looking at (0, 0, -23) with a 42 degree lens;
  it descends to (0, 42, -2) looking at (0, 0, -28). On the bass the whole
  street is squeezed in x to 0.25 (`CLAP_FRACTION`, "walls closing like
  clapping"), sizes included, so the rows nearly meet and nothing collides;
  the camera keeps 2 m from every piece at full close.
- **cathedral-gallery** (`recipes-clap.ts`) is framed on the owner's gallery
  still (`looks/cathedral-gallery/look-first.png`) from the old `cathedral`
  camera, held at (0, 23, 18) looking at (0, 0, -3) with a 66 degree lens.
  The 90-piece nave has six bays of 30 m piers with pointed arcade heads and
  a gallery ledge, aisle walls, a far wall with three pointed arches and
  windows, two blocks of pews, an altar and vault ribs at 31 m, above the
  camera. On the bass the whole nave is squeezed in x to 0.25.
  **cathedral-gallery-grow** keeps each side piece's outer face and thickens
  it inwards until its inner face is at 0.25 of its open distance, while the
  pews, altar, far wall and ribs squeeze by the same fraction. Both keep the
  lens 2 m from every piece at full close.
- **diamond** is the simplest object test: one faceted `diamond(128)` at 0.65
  scale, centred 8 m over the floor, in three identical states. It uses
  pulse's mappings (scale on `low` 0.9, lift on `sub` 1.5) plus twistY on
  `mid` 0.3, and orbits once at radius 26, elevation 3.
- **fruit-dance** holds a front view with no orbit. The dancer at the centre
  is about a third of the frame tall, and the fruit (scaled to 0.7) sits 2 m
  beside them at chest height. It switches apple and banana on the top three
  `low` peaks at least 2 s apart.
- **fruit-mecha** matches the owner's `looks-vox/fruit-mecha` still: the
  dancer, held front-on from 1 m with a 40 degree lens, fills 85 percent of
  the frame (the distance comes from the lens and that share), between two
  fruits at shoulder height, x -1.1 and +1.1. Left opens on the banana and
  right on the apple; on each of the top two `low` peaks (2 s apart) both
  step Banana, Papaya, Apple, so they always differ. Each change is a burst
  (the owner: "they should explode and then move into the new thing"): the
  fruit holds until 8 frames before the peak; at the peak every voxel has
  flown 3 to 4 fruit radii across the picture (fixed per voxel, outward and
  back from the lens with a wide seeded spread, a little spin, the outgoing
  colour; "having them explode more would be good"), shortened where it
  would leave the frame or come within 0.6 m of the dancer's centre line;
  and the next fruit is whole 8 frames after. Seven keys must fit the 64 KB recipe bound, so the fruits use the
  96-voxel preset, 48 coarser voxels each (about 47 KB at 193 frames).
- **fruit-mecha-morph** is the same scene with no cues: two keys, banana |
  apple at rest and papaya | banana at the peak, 96 voxels per fruit from
  the fine preset, blended by `morphControl` on `low` (x 1.2) like the
  single-fruit morphs, with the glow at 0.6. The pulse stays 0.3: the one
  pivot between the fruits already pushes them outward as they swell.
  Both pulse on `low` (scale 0.3) about a point between them, which pushes
  them outward, and glow on `low` (0.5) through a `primitives` glow route.
  No twist: about the shared pivot it would swing them round the dancer.
  Its median motion (1.37 below) is mostly the dancer, who now fills the frame.
- **fruit-apple, fruit-banana, fruit-papaya** share one helper
  (`singleFruit`). Each shows one fruit from the 96-block preset resting on
  the floor, no morph and no figure. It is held from the front at 8 degrees
  and framed to half the frame, pulsing on `low` (scale 0.3) with a twist on
  `mid` (0.2).
- **fruit-apple-banana** and **fruit-banana-apple** (`fruitMorph`, one
  helper on a rest fruit and a peak fruit) use the same floor, framing (on
  the rest fruit) and mappings, but their two states are the apple and the
  banana, blended by the engine's
  continuous morph (`morphControl`, as the wall studies use): progress is
  `low` x 1.2, clamped at 1, so silence is the rest fruit and the band's p95
  is the peak fruit, whatever the frame. The capture's `--motion-gain` scales the
  blend amount too (bounded at 2), so at gain 2 the banana arrives at about
  half the band. `frame-closed` (the loudest bar) is the peak fruit's still.
- **Fruit colours.** Every voxel of a fruit state carries its fruit's colour
  (`FRUIT_COLOURS`: banana `#f2d14b`, papaya `#f0a040`, apple `#c8322b`), so
  the RGB guide shows the fruit, and the morph blends the colour with the
  shape. The renderer gives each voxel its own material, so the per-object
  colour reaches the capture. fruit-dance, the single fruits, both morph
  studies and both mecha studies are coloured.

Every capture now writes `keyframes.json` with `frame-0000.png`,
`frame-closed-NNNN.png` (loudest smoothed `low`) and `frame-open-NNNN.png`
(quietest smoothed `low` from frame 8). `source` is the raw frame of the peak
or trough. `index` is that frame snapped to LTX's 8-frame latent grid (never 0
or the last frame), and the PNG is that exact decoded frame of `rgb.webm`.
`scripts/experiments/sweep.sh --output DIR --studies ID [flags]` captures
motion gain 0.5, 1 and 2 into `DIR-g05`, `DIR-g10` and `DIR-g20`.

Measured on 1024×576 captures (auto gain, release 12, studio), 97 frames
unless marked 193 f. The median is the per-frame change in grey levels. Rows
marked old predate the camera and spread fixes.

| Study                            | Median | Corr with low |
| -------------------------------- | ------ | ------------- |
| cathedral-walls blend, old ribs  | 4.6    | 0.60          |
| cathedral-walls nave, 193 f      | 3.5    | 0.50          |
| cathedral-walls spread, old      | 9.9    | 0.36          |
| canyon blend                     | 0.67   | 0.52          |
| fruit-dance, old orbit           | 0.84   | 0.53          |
| fruit-dance front view, 193 f    | 0.21   | 0.58          |
| fruit-mecha, 193 f               | 1.37   | 0.59          |
| fruit-apple, 193 f               | 0.27   | 0.49          |
| fruit-banana, 193 f              | 0.40   | 0.52          |
| fruit-papaya, 193 f              | 0.11   | 0.49          |
| room-walls, old (8 m, furnished) | 0.39   | 0.62          |
| room-walls empty small, 193 f    | 0.57   | 0.45          |
| pyramid-inside, old -0.5         | 4.1    | 0.87          |
| pyramid-inside -0.3, old, 193 f  | 2.3    | 0.61          |
| pyramid-inside big blend, 193 f  | 3.2    | 0.42          |
| diamond, 193 f                   | 1.3    | 0.60          |

For cathedral-walls, the blend calmed the jitter; smoothing did not. Frames
changing by more than 8 fell from 65 to 18, and the motion follows the band's
frame-to-frame change at 0.93. Adding `--band-smooth 5` or `9` on top of the
release leaves the median near 4.6-4.8 and only cuts the largest jump (37 to
20 and 18). It also moves the closed keyframe from 72 to 32.

## Run

```sh
# capture (Mac, no GPU)
node scripts/experiments/capture.mjs --output .local/cap --studies pulse --frames 97 \
  --width 960 --height 512 --band-gain auto --motion-gain 1.5 --radius 26 --elevation 9
# bundle (Mac)
python3 workflows/experiments/prepare.py --recipe .local/cap/pulse/recipe.json \
  --rgb .local/cap/pulse/rgb.webm --look look.png --audio .local/cap/pulse/control.wav \
  --capture-receipt .local/cap/pulse/capture.json --output ~/runs/pulse --mode layout-audio \
  --frames 97 --seed 42 --prompt '…one or two sentences, match the still, never "clay" or "3D"…'
# run (box, one job at a time)
python3 workflows/experiments/run.py --bundle /workspace/run/bundles/pulse \
  --url http://127.0.0.1:8189 --submit --budget-usd 5 --wait-seconds 1500
```

`layout-audio` conditions the latent on the track and carries the original
trimmed audio in the output; `layout` is the silent control. Measured on the
orbit guide, the audio mode tracked the bands better (mid 0.36 vs 0.26,
high 0.32 vs 0.21) at the same motion. 1536×896 ran in about 165–195 s with
69 GB peak VRAM; 1920×1024 fits the same card.

## Box setup facts (2 November 2026)

- Bootstrap needed `GIT_LFS_SKIP_SMUDGE=1`: the image's git-lfs fails to
  smudge the LTX node pack's example PNGs.
- The image venv (`/venv/main`, torch 2.10 cu130) is the interpreter to run
  `bootstrap.py` with; the system Python has no torch.
- Tailscale SSH asks for a browser check per connection. One persistent
  `ControlMaster` connection with a short `ControlPath` (under 104 bytes)
  turns that into one approval per session.
- Keep ComfyUI on loopback; the image's Caddy listens publicly on 8188.
- Do not edit `capture-browser.ts` while a capture is running: Vite reloads
  the page and the capture dies without an error.
