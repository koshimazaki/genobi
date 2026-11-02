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

- **Sideways-only close (cathedral-walls, canyon).** Two states that differ
  only in distance from the centre line: nave x, street z, at 0.55 when
  closed. `motion.morphControl` blends them with a manual baseline of 0 (open)
  plus `low × 1.2`, so loud = closed and the timeline clock never moves the
  walls. `stateAudio` cannot do this because it blends from the timeline pair,
  so the closed state would sit on the timeline. `--motion-gain` scales the
  blend amount too, up to 2.
- **`spread` (pyramid-inside).** `spread` multiplies each piece's distance from
  `motion.pivot` by `1 + spread`, so a negative amount means loud = closer.
  The study uses -0.3 with the camera at the centre of the floor: at -0.5 the
  terraces closed to 0.67 m from the lens and hid the figure. It contracts all three axes, so a nave also sinks and seems to zoom;
  that is why the two studies above use the blend.
- **Reverb box.** `roomWidth`/`roomDepth` are negative on `low` in every study,
  so the reverb box shrinks on the same bars.
- **Camera clearance.** cathedral-walls holds the gallery view at (0, 23, 18).
  From the old spot at (0, 21, 15) the nearest bay's vault rib was 1.9 m from
  the lens at full close and filled the frame. A test now keeps every piece
  more than 3 m away.
- **diamond** is the simplest object test: one faceted `diamond(128)` at 0.65
  scale, centred 8 m over the floor, in three identical states. It uses
  pulse's mappings (scale on `low` 0.9, lift on `sub` 1.5) plus twistY on
  `mid` 0.3, and orbits once at radius 26, elevation 3.
- **room-walls** shows the apartment's own room box and hides its two
  full-height partitions.
- **pyramid-inside** is a hollow stepped pyramid of 128 wall pieces with an
  oculus. A room box can only be a rectangle, so a hidden box stands in for
  the reverb.
- **fruit-dance** puts the dancing mannequin at the centre, about a third of
  the frame tall. The fruit is scaled to 0.7 and circles 2 m from the dancer
  at chest height. It switches apple and banana on the top three `low` peaks
  at least 2 s apart.

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

| Study                                  | Median | Corr with low |
| -------------------------------------- | ------ | ------------- |
| cathedral-walls blend, old (0, 21, 15) | 4.6    | 0.60          |
| cathedral-walls blend, 193 f           | 2.8    | 0.38          |
| cathedral-walls spread, old            | 9.9    | 0.36          |
| canyon blend                           | 0.67   | 0.52          |
| fruit-dance                            | 0.84   | 0.53          |
| room-walls                             | 0.39   | 0.62          |
| pyramid-inside, old -0.5               | 4.1    | 0.87          |
| pyramid-inside -0.3, 193 f             | 2.3    | 0.61          |
| diamond, 193 f                         | 1.3    | 0.60          |

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
