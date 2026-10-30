---
tags: [director, sound, templates, world-builder]
summary: Adaptive reverb, the 3D + LTX mix template - one LTX-2.5 (open weights) + AKUSPACE LoRA take through a cathedral, a crowded hall and a small studio, its own sound changing with each room, under a room-scan look; and Acoustic Space end to end, from a World Builder room to the sound in it, and how to regenerate a room.
---

# Adaptive reverb: the 3D + LTX template

The fourth **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)),
added on 30 October 2026, and the gallery's **3D · LTX template**. It is the
proof of the open acoustics path: one take made with LTX-2.5 (open weights)
and the AKUSPACE acoustic-space LoRA (ours, open weights), whose sound changes
with the room it is in. Nothing is generated, quoted or paid when you open it.
In the Gallery it is the fourth card, **Adaptive reverb · 3D · LTX template**,
after the Genobi teaser, the Dimensions mix and Bloom; it took the Audio-visual
card's place, and the Audio-visual template keeps its skill and links
(`NOT_IN_GALLERY` in `shared/gallery/catalogue.ts`).

Watch it: the gallery card plays
[`adaptive-reverb.mp4`](https://github.com/koshimazaki/Genobi/blob/main/public/media/template-gallery/adaptive-reverb.mp4),
and the public page is `/watch/adaptive-reverb`.

| Piece    | Where                                                                       |
| -------- | --------------------------------------------------------------------------- |
| Template | `shared/templates/adaptive-reverb.ts`                                       |
| Cut      | `shared/templates/adaptive-reverb.cut.json`                                 |
| Media    | `public/media/director-templates/adaptive-reverb/`                          |
| Showcase | [v1 and its memory](director-bundle/showcase/adaptive-reverb/README.md)     |
| Tests    | `tests/adaptive-reverb.test.ts`, `tests/gallery-badges-order.test.ts`       |
| Render   | `TEASER_EXAMPLE=adaptive-reverb node scripts/render-genobi-teaser.mjs out/` |

## Acoustic Space, end to end

Acoustic Space is how a picture's room becomes the room you hear. It has four
steps, each a piece of this repository:

1. **A room in 3D.** World Builder (the studio's 3D tab, and the
   [World Builder nodes in ComfyUI](capabilities.md#world-builder-nodes-in-comfyui))
   holds a room set: a box with materials. The example rooms are
   `custom_nodes/director_world_builder/examples/rooms/` (cathedral, medium
   room, empty club, small room). See
   [World Builder sets and capture](capabilities.md#world-builder-sets-and-capture).
2. **Its decay, measured.** Acoustics computes the room's RT60 with Sabine's
   formula over its surfaces and maps it to an AKUSPACE preset band
   ([World Builder acoustics](world-builder-acoustics.md),
   [Scenes as data and room acoustics](capabilities.md#scenes-as-data-and-room-acoustics)).
3. **The model hears the room.** The preset becomes AKUSPACE's room caption
   and conditioning, and LTX-2.5 (open weights) with the AKUSPACE LoRA loaded
   renders the picture and its sound in that room
   ([LTX-2.5 open workflow and Acoustic Space](capabilities.md#ltx-25-open-workflow-and-acoustic-space)).
   The same graph also runs a DSP route (image-source reflections and a
   seeded tail from the same room) so the two sounds can be compared.
4. **The sound in the room.** The output is video with the room's reverb in
   its audio. In this template that audio is the track: it is never replaced.

The whole chain is one ComfyUI graph,
[`workflows/world-builder-akuspace-ltx.json`](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-akuspace-ltx.json)
([its README](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-akuspace-ltx.README.md)), and
[`workflows/world-builder-layout-to-render.json`](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-layout-to-render.json)
([README](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-layout-to-render.README.md)) is the
layout-to-picture route for the same set. The template shows the first as a
node diagram drawn from its JSON (`reverb-workflow.jpg`), labelled as the
workflow, not a screenshot of ComfyUI.

## How the rooms change across the cut

The take is 30.46 s at 24 fps and 1280 × 720, and plays whole: four slices
end to end in source time on one track slot, so the picture and its sound
stay in sync. The cut runs on a 120 BPM grid (a beat is half a second) only
so the overlays snap; nothing is cut to music. It is 60.5 beats, 726 frames,
30.25 s, inside the 30.65 s track.

| Seconds   | Room                                | AKUSPACE preset (the owner's) | RT60, as trained |
| --------- | ----------------------------------- | ----------------------------- | ---------------- |
| 0–7.9     | Falling between skyscrapers         | none shown                    | none shown       |
| 7.9–15.9  | Cathedral                           | `cathedral`                   | ~4.8 s           |
| 15.9–22.5 | Crowded hall                        | `medium_room`                 | ~1.9 s           |
| 22.5–30.5 | Small wooden studio, drums and keys | `small_room`                  | ~0.67 s          |

The RT60s are each preset's `estimated_rt60` in
`shared/akuspace-presets.json` (the decay it was trained on), not a
measurement of the take. Which preset belongs to which room is the owner's
call, recorded in `REVERB_ROUTE` in the template.

## The look

Every overlay is an existing trusted recipe:

- **The drop** (0–8 s): the screen open, a `build-panel` caption (DROP,
  OUTSIDE / BETWEEN TOWERS / ROOM AHEAD) and a `wire-scan` sweep into the
  cut, which a `slice-glitch` marks.
- **The cathedral, a room scan** (7.9–15.9 s): from the cut itself (7.9 s,
  beat 15.75), `crt` surveillance scanlines and the `hud` reading
  `● REC CAM 01 // ROOM SCAN` and `AKUSPACE / CATHEDRAL`, with the `scan`
  readout `RT60 ~4.8 S` from 8 s, then a `ui-focus` measure box on the nave.
  One readout only: v2 dropped the cathedral's `build-panel`, which doubled
  the scan readout and read as ghosted under the scanlines.
- **The hall** (16–22.5 s): a wireframe sweep and a glitch into it, and its
  readout panel (RT60 ~1.9 S, MEDIUM ROOM).
- **The built room in the workflow** (20–22.5 s): `space-hud` over the node
  diagram, labelled WORKFLOW GRAPH · FROM THE JSON and
  `world-builder-akuspace-ltx.json` (the label allows 32 characters, so the
  file name is the credit line), its trackers locking onto World Builder capture, Acoustics, the
  AKUSPACE prompt, the Reverb, the AKUSPACE text encode and the LoRA route's
  save, then a glitch into the studio.
- **The studio** (22.5–27 s): its readout panel (RT60 ~0.67 S, SMALL ROOM).
- **End card** (27–30.25 s, `end-card-still` over a frame of the studio):
  GENOBI // 3D + LTX, ADAPTIVE REVERB, LTX-2.5 · OPEN WEIGHTS, AKUSPACE
  ROOMS, WORLD BUILDER 3D · KOSHIMAZAKI. Every word is a parameter.

## Swap in your own recordings

The workflow card is one replaceable still: `reverb-workflow.jpg` in
`public/media/director-templates/adaptive-reverb/`, shown by the `workflow`
layer from 20 to 22.5 s. To show the actual ComfyUI graph or the World
Builder Three.js scene instead, save a frame of your recording as a
16:9 JPEG (or PNG / WebP) and replace that file under the same name; nothing
is re-timed, and the card keeps its slot. To keep the old diagram too, add
your file next to it (`reverb-world-builder.jpg`, say), point the layer's
`still` at it in the Editor or in the cut, and set its `label` and `credit`
to say what it is. Then re-render and update the gallery card.

The slot takes a still, not a moving clip: `space-hud` only shows images. A
moving recording would need its own shot slot in the cut, which is not in
this version.

## The media

Copied, never moved, and renamed on copy:

- `reverb-ltx.mp4`: the owner's take, encoded once at its native 1280 × 720
  (libx264, CRF 18, no sound, `+faststart`), 14 MiB. Not upscaled.
- `reverb-track.mp3`: the take's own sound, 30.65 s, re-encoded once from AAC
  to MP3 at 320 kb/s and otherwise untouched (no gain, no trim).
- `reverb-end-card.jpg`: a frame of the studio at 29 s.
- `reverb-workflow.jpg`: the node diagram of the workflow.

The project's media is about 16 MiB, each file under 25 MiB.

## How to regenerate a room

The template generates nothing. The reusable [worked API collection](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-world-builder.README.md)
now separates the sound routes and retains the actual GPU graph settings.
Use the [shared deployment guide](comfy-deploy.md) and its endpoint catalogue;
those endpoints have not been tested on the Developer Platform.

| Room / endpoint                 | Workflow                                                                                                                                                                                                                         | Sound route                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `cathedral`                     | [L2R cathedral](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-l2r-cathedral.README.md)                                                                                                                 | Original track → scene IR → CPU Reverb                            |
| `party` (medium_room geometry)  | [L2R + a2v party](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-l2r-a2v.README.md)                                                                                                                     | Track in both sampler latents, original track through CPU Reverb  |
| `studio` (small_room geometry)  | [L2R + a2v studio](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-l2r-a2v-studio.README.md)                                                                                                             | Same CPU path                                                     |
| `medium_room`, `small_room`     | [Medium-room dive](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-i2v-dive-medium-room.README.md), [small-room dive](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-i2v-dive-small-room.README.md) | i2v picture and generated audio; scene IR applied separately      |
| `studio_cpu`, `studio_akuspace` | [i2v + track](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-i2v-a2v.README.md), [AKUSPACE variant](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-i2v-a2v-akuspace.README.md)                     | Mask 0 / external CPU treatment, or mask 0.5 / learned room audio |

1. Read `REVERB_ROUTE` in `shared/templates/adaptive-reverb.ts` and the
   [showcase record](director-bundle/showcase/adaptive-reverb/memory.json)
   for the room, timing and intended preset. Party and studio are scene names,
   mapped to medium_room and small_room; they are not new trained presets.
2. Build and capture the matching room, keeping the full recipe. For L2R use
   1024 × 576, 193 frames at 24 fps; create the look still from the take's
   first frame at the same angle. Supply your own track slice and media.
3. Fill a new API template with its documented placeholders. Use the CPU
   L2R path first: its Acoustics → Reverb branch saves the scene IR and wet
   audio. For whole-track transitions use [room-reverb.sh](https://github.com/koshimazaki/Genobi/blob/main/workflows/room-reverb.README.md),
   which levels the weak IRs against the original dry track. The i2v CPU
   graph requires that room treatment separately.
4. Quote generation and get the owner's approval before running it
   ([Quote, approve, then spend](capabilities.md#quote-approve-then-spend)).
   The owner also starts the paid build/deploy. Do not retry an uncertain
   submission. AKUSPACE at mask 0.5 can change the music, so use the original
   track when preserving it matters; this is different from CPU convolution.
5. Replace the slice in the Editor, or swap picture and soundtrack together,
   update `durationSeconds`, listen against the dry source and check the cut
   with `checkMix`.

## How to repeat it

1. **Memory first.** Read the [showcase record](director-bundle/showcase/adaptive-reverb/memory.json).
2. **Inputs.** Copy and rename the take; no file or text names the tool it
   came through.
3. **Look before cutting.** `ffprobe` it and contact-sheet it at 1 to 5
   frames a second to find the room changes (here they are hard cuts at
   7.9, 15.9 and 22.5 s that scene detection misses).
4. **Encode once** at native size, CRF 18, no sound; keep the take's own
   audio as the track.
5. **Write the cut as data**: whole-beat slices in source time, overlays on
   the grid. Space.js targets take their centre; target boxes their top-left
   corner.
6. **Render** with the in-page renderer:
   `TEASER_URL="$LOCAL_STUDIO_URL" TEASER_EXAMPLE=adaptive-reverb TEASER_MBPS=24 node scripts/render-genobi-teaser.mjs out/`
   (the master stays out of the repository), then a gallery copy under
   25 MiB and a cathedral room-scan poster at 10 seconds (native 1280 × 720).
7. **Showcase.** Add a version to the record and run
   `node --import tsx scripts/showcase-versions.mjs adaptive-reverb`.

## Limits

- Nobody listened to the cut here. The room changes were found by eye from
  frames; the sound is the take's own, untouched.
- The RT60s on screen are the presets' trained decays, not a measurement of
  the take, and the room-to-preset mapping is the owner's.
- The workflow appears as a diagram drawn from its JSON, not a capture of
  ComfyUI, and no 3D-tab recording is in this version.
- The gallery badge reads the registry's `ltx-2-5-akuspace` entry.
