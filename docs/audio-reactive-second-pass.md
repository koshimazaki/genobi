---
tags: [workflows, comfy, models, world-builder]
summary: The next Vast session, planned so the box time is renders only — walls that move to the music, a second image guide at the closed-walls frame, Union Control from the depth track, the LTX refine pass, Klein looks made on the box, and the stitch.
---

# Audio-reactive architecture: the second pass

Follows [the audio-reactive pyramid](audio-reactive-pyramid.md). That page
proved the pyramid breathes with the music. This one plans the session that
makes the architecture move (walls, buildings, rooms), renders it twice (layout
first, refine second) and cuts the pieces together. Everything here is built
and tested on the Mac before the box is rented; the box runs a queue.

## The three demos

| Track           | What moves                                                                                                                      | Study                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Acoustic space  | walls, piers and buildings close in on the loud bars and open on the quiet ones; the reverb is computed from the same room size | `cathedral-walls`, `canyon`, `room-walls`, `pyramid-inside` |
| Things in space | objects in an orbiting shot react to the bands, a dancer in the middle                                                          | `fruit-dance`, `pulse`                                      |
| Changing shapes | state changes on the beats (apple to banana, towers to nave)                                                                    | `fruit-dance` cues, `falling`                               |

The owner's words, 2 November 2026: "skyscraper closing walls together,
moving buildings to audio, and same with cathedral, and we manipulate and
calculate reverb there"; "fun horror once the walls come close and open to
music"; "360 view of pyramid, then inside with reverb and modifying space and
reverb inside".

## What was learned on 2 November

- A clean background transmits layout motion to the render; a dense photoreal
  look absorbs it. A lit studio floor makes the background turn with the camera.
- Continuous motion (scale, lift, spread) transmits the music. Discrete morphs
  are painted over the previous shape rather than replacing it.
- A peak-then-decay band envelope (`--band-release 12`) follows best.
- The camera moving to the beat works (cathedral v2, follow 0.88) but it is
  not the wanted effect; the walls must move and the camera hold.
- The room box is invisible in the falling and cathedral studies, so room
  mappings only change the acoustics. Visible wall distance comes from
  `spread` on the pier or tower objects, with the sign chosen so loud means
  closer.

## The pipeline

```
capture (Mac) ─► keyframe stills ─► Klein looks (box) ─► bundle (Mac or box)
   │                                     │
   │   rgb.webm, depth.webm, control.wav │ look-first, look-closed, look-open
   ▼                                     ▼
Layout-to-Render, look at -1 + closed still at its frame index (box)
   or Union Control from depth.webm with the same stills
   ▼
Refine pass: Tiled Fusion with the Refine-Details IC-LoRA, 1920x1088 (box)
   ▼
measure follow + sharpness ─► stitch the keepers on beat cuts, dry track + room reverb (Mac)
```

### 1. Capture

```sh
node scripts/experiments/capture.mjs --studies diamond,cathedral-walls,canyon,room-walls,pyramid-inside,fruit-dance,fruit-apple,fruit-banana,fruit-papaya \
  --output ~/genobi-runs/DATE/guides --frames 97 --width 1024 --height 576 \
  --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

In `cathedral-walls` and `canyon` the walls close sideways only: a blend
driven by the low band between an open and a closed layout that differ only
in distance from the centre line (`morphControl`, so the timeline never moves
them), with the camera held and the room width and depth shrinking on the
same bars for the reverb. Measured on the 4-second excerpt: cathedral median
motion 4.6, correlation with the band's change 0.93 (the earlier `spread`
version sank and zoomed the whole nave: 9.9 and 0.81). `room-walls` is an empty small room whose size alone follows the bass. `pyramid-inside` is a hollow stepped pyramid seen from the floor
(median 4.1, correlation 0.87). Keyframe stills land beside each guide as
`frame-0000.png`, `frame-closed-NNNN.png` and `frame-open-NNNN.png`, with
`keyframes.json` giving the index snapped to the 8-frame latent grid.
`scripts/experiments/sweep.sh` captures one study at motion gain 0.5, 1 and 2
so the sweet spot of change is picked before any image is swapped. Review the
cathedral at the loudest hit before rendering: at the 0.55 close the ribs pass
near the gallery camera; `CLOSED_FRACTION` in `recipes-rooms.ts` sets it.

### 2. Looks

Either owner-supplied stills cropped to the guide aspect, or Klein on the box:

```sh
python3 workflows/experiments/look.py batch --capture GUIDE_DIR \
  --aesthetic "…one sentence of look…" --width 2048 --height 1152 \
  --url http://127.0.0.1:8189 --out LOOKS_DIR --preflight
```

FLUX 3 Image Klein Base edits frame 0 into the first look, then the closed and
open frames with the first look as a reference so the three match. Output size
is twice the guide (the aspect is checked the way `prepare.py` checks
`--look`). See [LOOK.md](../workflows/experiments/LOOK.md) for the four Klein
files, the aesthetics used and what is unverified until a box run.

### 3. Bundles

`prepare.py` as before, plus `--keyframe PATH@INDEX[@STRENGTH]` (repeatable)
for a second image guide at that frame index, and `--mode union-depth` to
drive the Union Control IC-LoRA from the capture's depth track (`--depth`
required; the RGB guide is archived, not used). Both keep the look at frame
-1, both sampling stages and the audio mux; with no keyframe the graph is
byte-identical to before.

```sh
python3 workflows/experiments/prepare.py --recipe G/recipe.json --rgb G/rgb.webm \
  --depth G/depth.webm --audio G/control.wav --capture-receipt G/capture.json \
  --look LOOKS/look-first.png --keyframe LOOKS/look-closed-0048.png@48 \
  --mode layout-audio --frames 97 --seed 42 --output BUNDLES/cathedral-walls \
  --prompt '…one or two sentences, match the still…'
```

Keyframe indices are multiples of 8 (the LTX latent time grid); the picker
snaps them. The still must differ from the guide frame at that index (mean
8-bit difference above 2), the same rule as the first look.

### 4. Refine

Once per session, against the running server (it refuses if any node class
is missing and lists them):

```sh
python3 workflows/experiments/refine.py convert \
  --ui LTX-2.5_V2V_TiledFusion_Upscale.json --url http://127.0.0.1:8189 --out refine.api.json
python3 workflows/experiments/refine.py submit --graph refine.api.json \
  --video OUT/cathedral-walls.mp4 --prompt '…look and style only, no named objects…' \
  --output-size FullHD --seed 42 --url http://127.0.0.1:8189 --run-dir REFINE/cathedral-walls
python3 workflows/experiments/refine.py status --run-dir REFINE/cathedral-walls --url http://127.0.0.1:8189
```

The upstream file is Lightricks' `example_workflows/2.5/LTX-2.5_V2V_TiledFusion_Upscale.json`
(Tiled Fusion sampler with the 2.5 Refine-Details IC-LoRA, 8 fused steps).
The converter prunes the prompt-enhancer and Gemma API branches, so those
models are not needed.

### 5. Measure and stitch

`follow.py` (clip against guide, bands) and a per-frame sharpness score flag
the stretches to re-render. The keepers are cut on beats with ffmpeg and the
dry track and the CPU room reverb are muxed underneath.

## Box session order

1. `GENOBI_REF=<branch head> bash scripts/vast/box/box-setup.sh` inside tmux.
2. Download with `--profile second-pass` (eight files, 74 GB: the six layout
   files, the Union Control LoRA, the Refine-Details LoRA; pinned in
   `scripts/vast/second-pass-models.txt`, kept out of the deployed release
   manifest on purpose). Refine-Details and the Klein repository are gated:
   accept their terms on huggingface.co with the token's account first. Klein
   needs four more files (18 GB), listed in LOOK.md.
3. Start ComfyUI on 127.0.0.1:8189, then `EXPECT=8 after-download.sh` with
   the bundle names below.
4. Queue, in this order, easiest for the model first (all 193 frames,
   1024x576 guides, `layout-audio`, look at -1 plus the closed still at its
   frame index; `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES`
   builds them all):
   1. `diamond`: one object, the surest result
   2. `pulse`: the pyramid, the proven control
   3. `cathedral-walls`: piers sliding in, camera held
   4. `canyon`: tower rows closing across the street
   5. `room-walls`: the dancer in an empty small room that shrinks on the bass
   6. `pyramid-inside`: a vast interior from the floor, terraces tightening
   7. `fruit-apple`, `fruit-banana`, `fruit-papaya`: one fruit each, front view
   8. `fruit-dance`: front view, the fruit swapping shapes beside the dancer
   9. `cathedral-walls` and `canyon` again in `union-depth`
   10. sweep: `cathedral-walls` at motion gain 0.5 and 2
5. `refine.py convert`, then `refine.py submit` on the best clip of each study.
6. Copy `/workspace/run` to the Mac, measure, stitch, review.

## What needs the owner

- A yes to push `feat/ltx-reactive-capture` and open the PR to `release/v0.14`.
- The rotated Hugging Face token at download time (typed into the box shell,
  never saved) and the Refine-Details terms accepted.
- Either prepared stills or an aesthetic sentence per study for `look.py`.
  The guide frames to make them from (first, open, closed, and the banana
  frame) are captured per study beside each guide; an anime and a realistic
  look per object is the planned compilation. The 2 November reference set
  and its images-needed list sit in the owner's Downloads export.
