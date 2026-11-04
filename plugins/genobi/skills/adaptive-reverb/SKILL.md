---
name: adaptive-reverb
description: Make a version of Adaptive reverb, the first 3D + LTX mix template - the person drops an image of a space as a reference and says which room it replaces ("this room instead of the hall"), and the agent writes the first still's prompt from it, builds the room in World Builder, renders it with LTX-2.5 Layout-to-Render on the hosted deployment, processes the track with the room's CPU reverb and labels it with a fixed AKUSPACE preset RT60. Every paid step is quoted and waits for the person's yes.
license: MIT
compatibility: Needs this checkout with npm ci, Node 22 or later and FFmpeg; World Builder captures need Chrome (Playwright) or the World Builder ComfyUI nodes; renders run on the hosted Comfy deployment (studio, site or CLI), or on a rented GPU box (scripts/vast) as the alternative.
metadata:
  version: "0.1.0"
  template: "adaptive-reverb"
  tier: "Open"
  tags: "agents, director, templates, world-builder, sound, ltx"
  docs: "docs/adaptive-reverb.md, docs/audio-reactive-drop.md, audio-reactive/videos/spaces.md, docs/comfy-deploy.md, docs/tester-access.md"
---

# Adaptive reverb (v1, preset rooms)

One LTX-2.5 Layout-to-Render (open weights) take of four World Builder rooms,
30.46 s, played whole in four slices on one track: falling between
skyscrapers, a cathedral, a crowded hall and a small wooden studio. The sound
is the take's track processed with the source scenes' CPU impulse responses.
Each room is **labelled with a fixed AKUSPACE preset and that preset's trained
RT60** (`cathedral` about 4.8 s, `medium_room` about 1.9 s, `small_room`
about 0.67 s), read from `shared/akuspace-presets.json`: these are not
measurements of the take, and the room-to-preset mapping is the owner's
(`REVERB_ROUTE` in `shared/templates/adaptive-reverb.ts`). AKUSPACE itself was
tested separately; never attribute this cut's sound to the LoRA. It is a
**mix** template (`run: "mix"`): opening it generates nothing. Read
[the template page](../../../../docs/adaptive-reverb.md) first. For measured
rooms, use [Acoustic Spaces v2](../../../../docs/audio-reactive-drop.md) and its
`audio-reactive-drop` skill.

## What the person hands in

| Slot      | They drop                   | "With what" sentence            | What it replaces                             |
| --------- | --------------------------- | ------------------------------- | -------------------------------------------- |
| room      | an image of a space         | "this room instead of the hall" | one slice of the take and its sound          |
| recording | a 16:9 still of a recording | "show my ComfyUI graph here"    | `reverb-workflow.jpg`, the 20 to 22.5 s card |
| words     | a line of text              | "call it …"                     | the end card's parameters                    |

**Their image is the reference.** The agent writes the prompt for the first
still from it, builds the moving room in 3D, and renders the video; the image
itself never goes into the video. If the sentence does not say which room,
ask. The recording still and the
words are free swaps in the Director (Make my version, or the Editor); the
card takes a still, not a moving clip.

## What the agent does with each slot

**A room.** Follow the page's "How to regenerate a room":

1. **Read the route**: `REVERB_ROUTE` and the
   [showcase record](../../../../docs/director-bundle/showcase/adaptive-reverb/memory.json)
   for the room's seconds, preset, trained RT60 and World Builder set.
2. **Build the room** in World Builder (Three.js) from a description of the
   reference: the nearest example set with its size and materials set, or a
   new set in the study code when none is close. Capture a take, and say
   which you did.
3. **Make the look still** at the capture's angle from a prompt the agent
   writes from the reference (FLUX 3 Klein or Genobi Image).
4. **Render** with the Layout-to-video workflow (the capture, that still and
   the track) through LTX-2.5 Layout-to-Render. The first route is the hosted
   Comfy deployment `genobi-ltx-world-v2` (release v2, min 0 / max 1, scales
   to zero between jobs): Camera's **Comfy Deploy · layout-to-video**, with
   parity between the studio and the site
   ([the deployment guide](../../../../docs/comfy-deploy.md),
   [tester access](../../../../docs/tester-access.md)); the box graphs from
   the Vast session run on v2 through the CLI. The alternative is a rented
   GPU box (`scripts/vast/box/`).
5. **The sound**: run the local CPU reverb template with the scene recipe and
   the original track, then level and crossfade the exported impulse
   responses with `room-reverb.sh`. The sound belongs to the picture, so the
   slice and its sound change together.
6. **The label**: propose the nearest fixed AKUSPACE preset for the new room
   and show its trained RT60; the person decides, since the mapping is
   theirs. Say plainly that the number is the preset's trained decay, not a
   measurement.
7. **Cut it in**: the new take replaces the slice in the Editor, or replaces
   `reverb-ltx.mp4` and `reverb-track.mp3` together and set their `durationSeconds`; run
   `checkMix`, render with the in-page renderer and show a contact sheet.

The AKUSPACE i2v/a2v workflow is a separate route that learns room sound but
partly regenerates the music at mask 0.5; it is the deployment's
`akuspace` graph. Offer it only as an experiment, and
never as this cut's soundtrack.

## The paid gates

Nothing is rendered or edited without a quote and the person's yes
([Quote, approve, then spend](../../../../docs/capabilities.md#quote-approve-then-spend)):

- **The first still** (Klein or Genobi Image) goes through `genobi_quote`, the
  price shown, a yes, then `genobi_submit` with that quote (or
  `genobi submit --confirm`). Never retry an uncertain submission
  automatically or change its key.
- **The Layout-to-Render take**, on the hosted deployment or a box, is paid.
  Say what will run, where, and the price, and wait for a yes.

The 3D build, the capture, the CPU reverb, `checkMix` and the in-page render are free and
local.

## Where the deep procedure lives

- [How to regenerate a room](../../../../docs/adaptive-reverb.md#how-to-regenerate-a-room)
  and [How to repeat it](../../../../docs/adaptive-reverb.md#how-to-repeat-it).
- The `genobi-audio-reactive` skill (load it with `genobi_skill`) for the
  World Builder capture, still and render.
- [spaces.md](../../../../audio-reactive/videos/spaces.md): the four windows
  and the reverb mix command.
- The preset pages:
  [towers-descent](../../../../audio-reactive/presets/towers-descent.md),
  [cathedral-gallery](../../../../audio-reactive/presets/cathedral-gallery.md),
  [party-walls](../../../../audio-reactive/presets/party-walls.md),
  [studio-walls](../../../../audio-reactive/presets/studio-walls.md).
- [The three key workflows](../../../../docs/comfy-deploy.md).

Record each brief and correction with `genobi_decision`, quoting the person.

## Not built yet

- Measured rooms: v1 shows fixed preset RT60s. Measured rooms are
  Acoustic Spaces v2.
- Nobody listened to the cut: the room changes were found by eye. Say "give
  it a listen" and leave the verdict to the person.
- A moving recording in the workflow card's slot: it takes a still only.
- A hosted card that takes these slots: today the drop happens in the
  Director's Make my version or in a chat with the agent.
