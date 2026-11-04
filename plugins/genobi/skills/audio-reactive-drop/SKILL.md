---
name: audio-reactive-drop
description: Make a version of Acoustic Spaces v2, the 3D + LTX mix template - the person drops an image of a space as a reference and says which room it replaces ("this room instead of the cathedral"), or swaps the track, and the agent writes the first still's prompt from it, builds the room in World Builder, measures its CPU room sound, renders it with LTX-2.5 Layout-to-Render on the hosted deployment and lays the measured reverb under it. Every paid step is quoted and waits for the person's yes.
license: MIT
compatibility: Needs this checkout with npm ci, Node 22 or later, Chrome (Playwright) and FFmpeg for captures; the Genobi studio, site or CLI for a paid first still and the render on the hosted Comfy deployment; a rented GPU box (scripts/vast) is the alternative render route.
metadata:
  version: "0.1.0"
  template: "audio-reactive-drop"
  tier: "Open"
  tags: "agents, director, templates, world-builder, sound, ltx"
  docs: "docs/audio-reactive-drop.md, docs/adaptive-reverb.md, audio-reactive/videos/spaces.md, docs/world-builder-dynamic-sound.md, docs/comfy-deploy.md"
---

# Acoustic Spaces v2 (room swap)

Five World Builder rooms, each rendered by LTX-2.5 Layout-to-Render (open
weights) on the owner's track "Adaptive Reverb v2", one after another, with
each room's own **measured** CPU room sound under its section: towers,
cathedral, pyramid inside, pyramid outside (open air, dry) and a small studio
where the singer turns to the camera. Every room is its own file and its own
shot, so a new room drops in with no re-timing. It is a **mix** template
(`run: "mix"`): opening it generates nothing. It is version two of
[Adaptive reverb](../../../../docs/adaptive-reverb.md), which uses fixed
AKUSPACE preset RT60s instead of measured rooms. Read
[the template page](../../../../docs/audio-reactive-drop.md) first: the rooms,
their frames and seconds, the double-time grid and how the room sound is
measured.

## What the person hands in

| Slot  | They drop                    | "With what" sentence                 | What it replaces                             |
| ----- | ---------------------------- | ------------------------------------ | -------------------------------------------- |
| room  | an image of a space          | "this room instead of the cathedral" | one of the five rooms, its picture and sound |
| track | a track                      | "use this song"                      | `drop-track.mp3` and every room's sound      |
| words | a line of text               | "credit it to …"                     | the `end-title` layer's `text` and `line`    |
| end   | a 97-frame, 1920 x 1080 clip | "end on this instead of the singer"  | `drop-studio.mp4`                            |

**Their image is the reference.** The agent writes the prompt for the first
still from it, builds the moving room in 3D, and renders the video; the image
itself never goes into the video. If the sentence does not say which room,
ask; never guess. The words and the
ending are free swaps in the Director (Make my version, or the Editor).

## What the agent does with each slot

**A room.** The agent **builds the room in World Builder (Three.js)** from a
description of the reference: the nearest wall study (towers, cathedral,
pyramid, party walls for a hall, studio walls for a booth; see the preset
pages) with its size and materials set in its recipe, or a new study in the
study code when none is close. Say which you did and why. Then:

1. **Capture** the room's window on the track (the phrase start of the room
   it replaces, 193 frames at 1024 x 576, on a quiet low-band frame for any
   wall study). The capture evaluates the scene per frame and writes the room
   sound: up to 24 acoustic snapshots, the Sabine RT60 from the room's volume
   and absorption, impulse responses, and `room-sound.json` with what it
   measured.
2. **Make the look still** from the capture's `frame-0000.png`, changed only
   in surfaces, light and atmosphere, from a prompt the agent writes from the
   reference (FLUX 3 Klein text only, or Genobi Image). Never pass the image
   as Klein's `--aesthetic-image`: it copies that image's composition. The still is
   exactly 16:9 and lines up with frame 0 (check a 50 percent blend).
3. **Render** the window with LTX-2.5 Layout-to-Render, with the render
   prompt's nouns changed to the new space (say so). The first route is the
   hosted Comfy deployment `genobi-ltx-world-v2` (release v2, min 0 / max 1,
   scales to zero between jobs): Camera's **Comfy Deploy · layout-to-video**,
   with parity between the studio and the site
   ([the deployment guide](../../../../docs/comfy-deploy.md),
   [tester access](../../../../docs/tester-access.md)); the box graphs from the
   Vast session run on v2 through the CLI. The alternative is a rented GPU box
   (`scripts/vast/box/`, about 8 minutes and $0.25 a clip).
4. **Lay the measured reverb under it**: the room's wet signal at 0.45 under
   the dry track, crossfaded over 0.25 s at the picture cuts, as the template
   does for every room. The RT60 you report is the shoebox model's from the
   evaluated geometry, not a measurement of the render.
5. **Cut it in**: the new render takes the room's place under the same name
   (each room file holds exactly its shot, `sourceSeconds` 0), run `checkMix`, render with the
   in-page renderer and show a contact sheet before saying anything about it.

**A track.** A new track is **measured, never assumed**: tempo and phrase
starts from the audio, then a grid on which every phrase start lands on a
whole beat (the template doubles the tempo for that). Every room is captured
again on its new window, so every room's sound follows the new track, and
every room is rendered again: say how many renders that is before quoting.

## The paid gates

Nothing is rendered or edited without a quote and the person's yes
([Quote, approve, then spend](../../../../docs/capabilities.md#quote-approve-then-spend)):

- **A still made by a paid edit** (Klein or Genobi Image) goes through
  `genobi_quote`, the price shown, a yes, then `genobi_submit` with that quote
  (or `genobi submit --confirm`). Never retry an uncertain submission
  automatically or change its key. An owner's own still costs nothing.
- **Each render**, on the hosted deployment or a box: list every room you
  will render with the total and wait for a yes to that list first.

The 3D build, the capture, the room-sound measurement, the reverb mix, `checkMix` and the
in-page render are free and local.

## Where the deep procedure lives

- The `genobi-audio-reactive` skill (load it with `genobi_skill`): capture,
  bundle, render, review and the space swap.
- [spaces.md](../../../../audio-reactive/videos/spaces.md): the windows, the
  reverb mix command and the stitch.
- [Room sound along the scene timeline](../../../../docs/world-builder-dynamic-sound.md):
  how the room sound is computed.
- The preset pages:
  [towers-descent](../../../../audio-reactive/presets/towers-descent.md),
  [cathedral-gallery](../../../../audio-reactive/presets/cathedral-gallery.md),
  [cathedral-gallery-grow](../../../../audio-reactive/presets/cathedral-gallery-grow.md),
  [party-walls](../../../../audio-reactive/presets/party-walls.md),
  [studio-walls](../../../../audio-reactive/presets/studio-walls.md),
  [pyramid-inside](../../../../audio-reactive/presets/pyramid-inside.md),
  [pyramid-outside](../../../../audio-reactive/presets/pyramid-outside.md).

Record each brief and correction with `genobi_decision`, quoting the person.

## Not built yet

- Nobody has listened to the cut in a build: the sound is measured, not heard.
  Say "give it a listen" and leave the verdict to the person.
- The hologram over both pyramid rooms and the depth box are baked into the
  picture; a new pyramid room comes without them unless they are run again.
- A hosted card that takes these slots: today the drop happens in the
  Director's Make my version or in a chat with the agent.
