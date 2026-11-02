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

`node scripts/experiments/capture.mjs` gained five options, all recorded in
`study.json` under `reactivity`:

| Option             | What it does                                                                          | Value used                                               |
| ------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `--band-gain auto` | per band, scale so the 95th percentile sits at 0.8, clamped to 1                      | `auto`                                                   |
| `--motion-gain N`  | multiply every mapping amount within its validated range; above 1 sets intensity to 1 | 3 (morph), 1.5 (pulse, rubik), 2.5 (clockwork)           |
| `--radius N`       | camera distance in world units                                                        | 72 (morph with towers), 26 (pulse, rubik), 9 (clockwork) |
| `--orbit DEG`      | camera orbit over the take; 360 is one full turn                                      | 360                                                      |
| `--elevation DEG`  | camera elevation                                                                      | 9 (to match a low reference still)                       |

Measured on the architecture guide (193 frames):

| Capture                      | Median motion | Corr. mid | Corr. high | Note                             |
| ---------------------------- | ------------- | --------- | ---------- | -------------------------------- |
| stock                        | 0.15          | 0.13      | 0.23       | static between cues              |
| gain 3                       | 6.2           | 0.42      | 0.62       | towers clip the top at radius 44 |
| gain 6                       | 14.3          | 0.51      | 0.66       | cubes scatter out of frame       |
| gain 3, radius 72, orbit 360 | 2.0           | 0.42      | 0.64       | everything in frame; the pick    |

Three studies now exist for the pyramid: `architecture` (pyramid → towers →
diamond on two cues), `pulse` (one pyramid scaling on the low band and
lifting on the sub band; motion-to-bass correlation 0.86 at gain 1.5) and
`rubik` (terraces twisting against each other on the mid band, twist 0.55;
correlation 0.82). Hermes' `clockwork` (vanes) stays as a fourth.

## The look still

The model card's rule holds: the look must be a different image from the
grey guide frame, aligned to its camera, at the guide's aspect ratio (the
prepare step allows one output pixel of rounding). Owner-supplied stills were
centre-cropped with ffmpeg to 1536:896 (768×448 guides) or 1920:1024
(960×512 guides). A clean background (the desert pyramid) blurs far less
during the orbit than a dense city.

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
