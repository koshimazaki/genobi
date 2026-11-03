# Audio-reactive Layout-to-Render: the featured workflow

Genobi's main repeatable workflow. A Three.js scene moves to the music, one
still sets its look, and one LTX-2.5 graph paints the video with the track in
it. The presets have captured guides, and selected excerpts have been rendered;
the three multi-window videos are assembly recipes, not yet completed exports.
With the owner's track and look stills supplied, an agent (Claude Code, Hermes
or Codex) can reconstruct them or change one thing using these pages.

```
track window ─► World Builder study (capture.mjs) ─► rgb.webm, depth.webm, control.wav, keyframes.json
                                                       │
                     first still (owner edit or Klein) ┤
                                                       ▼
          LTX-2.5 22B distilled + Layout-to-Render IC-LoRA, look at frame -1,
          optional second still at the closed frame, two stages to 2048x1152,
          the excerpt muxed in (prepare.py → run.py, one graph for every shot)
                                                       ▼
                 measure ─► contact sheet ─► stitch windows ─► audio swap at the end
```

Three swaps change a video without changing the pipeline: the **track**, the
**subject** (robot, fruit, ship) and the **space** (hangar, desert, nave).

## The three templates

| Template | Presets                                                                                                                                                                                                                                                                                                                         | Video                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Rooms    | [pyramid-inside](presets/pyramid-inside.md) (the base; interior swaps in the sci-fi family), [towers-descent](presets/towers-descent.md), [cathedral-gallery](presets/cathedral-gallery.md) slide and [grow](presets/cathedral-gallery-grow.md), [party-walls](presets/party-walls.md), [studio-walls](presets/studio-walls.md) | [spaces](videos/spaces.md), [pyramid](videos/pyramid.md) |
| Fruits   | [fruit-mecha](presets/fruit-mecha.md) (explode) and [fruit-mecha-morph](presets/fruit-mecha-morph.md), [fruit-apple-banana](presets/fruit-apple-banana.md), [fruit-banana-apple](presets/fruit-banana-apple.md) with Rubik flecks                                                                                               | [fruits](videos/fruits.md)                               |
| Objects  | [pyramid-outside](presets/pyramid-outside.md) (pulse), [diamond](presets/diamond.md), [ship-mecha](presets/ship-mecha.md)                                                                                                                                                                                                       | [pyramid](videos/pyramid.md)                             |

All presets with their study ids, windows and status:
[presets/README.md](presets/README.md).

## The knobs that matter

These values worked on the 2 and 3 November box sessions. Change one at a time.

| Knob         | Value                                                                       | Why                                                                                       |
| ------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frames       | 193 (8.04 s at 24 fps)                                                      | 8k+1, the LTX latent grid; windows chain back to back every 8.0417 s                      |
| Guide size   | 1024x576; output 2048x1152                                                  | sides divide by 64                                                                        |
| Band gain    | `--band-gain auto` (p95 at 0.8)                                             | every track lands at the same drive                                                       |
| Band release | `--band-release 12`; `30` with `--band-smooth 5` for slow morphs            | half a second of decay reads as the beat; 30 eases a morph over about a second            |
| Motion gain  | `--motion-gain 1`                                                           | gain 2 saturates every blend (walls slam shut on any bass); only a pure pulse tolerates 2 |
| Close amount | pyramid interior 0.3, towers and cathedral 0.25, hall 0.25, booth 0.35      | set in the study (`CLAP_FRACTION`, `WALLS_CLOSED`, `BOOTH_CLOSED`), not with gain         |
| Stage        | `--stage studio`                                                            | a lit floor that turns with the camera                                                    |
| Look stills  | exactly 16:9 and aligned with frame 0                                       | a 1360x768 still crops to 1360x765; 768 high fails `prepare.py` by eight output pixels    |
| Sampling     | CFG 1, euler_ancestral, seed 42, two stages                                 | the model card's recipe, already in the graph                                             |
| Prompts      | one or two sentences of the finished shot; never clay, 3D, Unreal or render | with those words the LoRA paints voxels as voxels                                         |

## The three swaps

### Track swap

1. Pick the window: 193 frames from a start time. Videos chain windows at
   `start`, `start + 8.0417`, `start + 16.0833`, `start + 24.125`.
2. **Start on a quiet frame** for any wall study (rooms) and any morph. A
   window that starts on a bass hit opens with the walls closed, and frame 0
   must match the open still. Find the quietest low-band frame within 0.6 s
   before the planned cut: capture 97 frames at `--band-gain 1
--band-release 0` starting 0.6 s early, read `bandEnvelopes.low` in its
   `recipe.json`, and take the lowest frame. That gave 15.6916 (hall) and
   23.6083 (booth) on Adaptive Reverb. Keep 193 frames inside the track.
3. Capture with the preset's one-line command, `--track` and `--start`
   changed. Check `frame-0000.png` against the still before bundling.
4. Mux the final audio at the end of the cut (videos chain windows, then the
   full track or a mix replaces the per-window excerpts).

### Subject swap (tomato to cucumber, robot to John Travolta)

The subject swap is a **Klein region edit of the first still**; the guide,
prompt and window stay.

1. The region comes from `keyframes.json`: every capture writes
   `regions: { robot: {x, y, w, h}, "fruit-left": …, "fruit-right": … }` (or
   `fruit`, `ship`, `diamond`), the frame-0 3D bounds of the avatar and each
   morph group projected through the frame-0 camera onto the 1024x576 guide
   and padded by 8 percent per side (`scripts/experiments/regions.ts`).
   Studies with neither an avatar nor a morph group write none.
2. The agent scales the rectangle to the still's size (x and w by still
   width / 1024, y and h by still height / 576) and edits only that rectangle
   with the user's prompt ("a ripe cucumber made of matte green blocks"). For
   a FLUX/Klein edit row the same rectangle is a resolution-free box,
   `[top, left, bottom, right]` on the 0-1000 grid:
   `[1000·y/576, 1000·x/1024, 1000·(y+h)/576, 1000·(x+w)/1024]`, used as both
   `src_bbox` and `tgt_bbox` (rows are read by `shared/image-layout.ts`). The
   edit is a paid generation: quote it and wait for the person's yes.
3. A vision check of the still is only the fallback for a hand-made still
   that drifts from the guide.
4. For a morph, the swapped subject must also be in the guide's colours or in
   a second still at the closed frame: the first still pins colour (a red apple
   morphing into a banana stayed red). Make the peak still with `look.py one
--frame frame-closed-NNNN.png --reference look-first.png`.
5. Change the noun in the render prompt to match ("a cucumber" for "a banana").

### Space swap (hangar to desert, nave to club)

Make a new first still from the preset's `frame-0000.png` with the preset's
still prompt, changed only in surfaces, light and atmosphere. Keep the camera
words out: the frame holds the framing. Klein text-only (`look.py one
--frame … --aesthetic "…"`) or a Genobi Image edit of the frame both work;
Klein with `--aesthetic-image` copies the mood image's composition and is
unusable. Then change the render prompt's nouns to the new space.

## Order of operations

1. Recall the preset page and its last window.
2. Make or request the still (owner stills aligned every time).
3. Capture the window (Mac, no GPU, about a minute per study).
4. Bundle: `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` (the
   PROMPT map there is the per-study render prompt). **Copy the resulting
   bundle directories to the GPU box under `$RUN/bundles/<bundle-name>`**
   (`RUN` defaults to `/workspace/run`). The local folders are not shared
   with the box; `run-queue.sh` otherwise logs `SKIP` for a missing bundle.
5. Render on the box: `scripts/vast/box/run-queue.sh <bundle>…` in tmux,
   about 8 minutes and $0.25 per clip on an RTX PRO 6000.
6. Measure follow (clip motion against guide motion) and bass correlation.
7. Review a contact sheet; record the verdict and any correction.

## Links

- [Second-pass runbook](../docs/audio-reactive-second-pass.md): box session
  order, looks, bundles, refine pass.
- [Audio-reactive pyramid](../docs/audio-reactive-pyramid.md): every study's
  geometry, capture knobs and measured follow.
- Scripts: [`scripts/experiments/`](../scripts/experiments/) (`capture.mjs`,
  `recipes-*.ts`, `keyframes.mjs`, `regions.ts`, `sweep.sh`).
- Graph tooling: [`workflows/experiments/README.md`](../workflows/experiments/README.md)
  (`prepare.py`, `run.py`, `refine.py`) and [LOOK.md](../workflows/experiments/LOOK.md) (Klein looks).
- Box tooling: [`scripts/vast/box/`](../scripts/vast/box/) (`box-setup.sh`,
  `make-bundles.sh`, `run-queue.sh`, `after-download.sh`) and
  [the Vast runner](../docs/vast-runner.md).
- [Featured demo templates](featured-demo-templates.md): the two Gallery cards
  (Mecha × Fruits, Reactive Spaces) and what each swap rebuilds and renders.
- Agent skill: [`genobi-audio-reactive`](../plugins/genobi/skills/genobi-audio-reactive/SKILL.md).
