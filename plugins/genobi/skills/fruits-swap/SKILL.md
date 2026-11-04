---
name: fruits-swap
description: Make a version of Dance with Fruits, the content-swap mix template - the person drops an image of a fruit or a character as a reference and says what it replaces ("swap the apple with this"), and the agent writes the prompt for the first still from it, builds the moving fruit in Three.js, renders the loop's window with LTX-2.5 Layout-to-Render on the hosted deployment and cuts it in on the beat. Every paid step is quoted and waits for the person's yes.
license: MIT
compatibility: Needs this checkout with npm ci, Node 22 or later, Chrome (Playwright) and FFmpeg for captures; the Genobi studio, site or CLI for the paid first still and the render on the hosted Comfy deployment; a rented GPU box (scripts/vast) is the alternative render route.
metadata:
  version: "0.1.0"
  template: "fruits-swap"
  tier: "Open"
  tags: "agents, director, templates, world-builder, ltx"
  docs: "docs/fruits-swap.md, audio-reactive/videos/fruits-template.md, audio-reactive/videos/fruits.md, docs/comfy-deploy.md, docs/tester-access.md"
---

# Dance with Fruits (content swap)

A voxel dancer between two fruits, and every loop a different character: four
LTX-2.5 Layout-to-Render (open weights) renders of **the same guide window**
(window 0 of the explode capture, 8.04 s), cut hard on the loop and on the
drop beat so the pose, the fruits, the floor and the camera carry across and
only the dancer changes. It is a **mix** template (`run: "mix"`): opening it
generates nothing. The cut, the media and how to repeat it are in
[the template page](../../../../docs/fruits-swap.md); what a person can hand
in is in [the swap template](../../../../audio-reactive/videos/fruits-template.md).
Read both before touching anything.

## What the person hands in

The person drops one image (or writes a few words) and one sentence: what it
replaces. **Their image is the reference.** The agent writes the prompt for
the first still from it, builds the moving fruit in 3D, and renders the
video. The image itself never goes into the video.

| Slot      | They drop                           | "With what" sentence                     | Default when absent        |
| --------- | ----------------------------------- | ---------------------------------------- | -------------------------- |
| fruit     | an image of a fruit, or its name    | "swap the apple with this"               | banana and apple           |
| character | one image of a character, any style | "this instead of the gorilla"            | the grey and gold mecha    |
| track     | a track, or a caption for new music | "use this song" / "make it a slow bossa" | the Dance with Fruits loop |

One character is one loop (about 8 s); up to three characters make about
24 s, the first one opening the piece. Nothing beyond three: the loop wears
out. If the sentence does not say what is replaced, ask; never guess which
fruit or which loop.

## What the agent does with each slot

**A fruit.** The moving fruit is **built in Three.js** by the agent from a
description of the reference: the voxel catalogue holds **banana, papaya,
apple, orange and watermelon**, resampled to the same block count and
coloured per state; a fruit outside it is built as a new voxel asset in the
study code. Say which you did. Then capture the window again, change the
fruit's noun in the render prompt (say so), and write the still's prompt from
the reference for the fruit's rectangle (`regions.fruit-left` or
`regions.fruit-right` in the window's `keyframes.json`).

**A character.** The dance stays the guide's; the character comes from the
first still. The capture writes the dancer's frame-0 rectangle
(`regions.robot`, on the 1024 x 576 guide). Scale it to the still, pad it
about 10 percent so the raised arm fits, and show it as the suggested box.
Write the still's prompt from the reference, the character in the mecha's
pose, and with the person's yes make the still with **FLUX 3 Klein** (editing
only that rectangle) or **Genobi Image**. The still is 1360 x 765 (exactly
16:9) and lines up with frame 0: check a 50 percent blend.

The worked example is the owner's gorilla loop. Its first still was made
from the original mecha-with-fruits still, used as a shape guide only, with
this prompt, verbatim:

> voxel gorilla standing on the floor dancing human size making dance moves
> with vox banana floating on one side and vox apple on the other vox fruits
> advert studio shot, cinematic view, wide angle lens use image 1 for shape
> guide only, its floating in the air

Follow that pattern for a new character: the template's own still as
**image 1, the shape guide only**; the person's reference as the look; a
prompt in this shape (the character as voxels, its size and the dance, the
two fruits on either side, the advert studio shot and lens, "use image 1 for
shape guide only"). Show the prompt before quoting the still. Then the
Three.js capture and the LTX render below.

**The render.** **LTX-2.5 Layout-to-Render** renders the window on the guide
with that still. The new render takes that loop's place in the cut
(`fruits-swap-<character>.mp4`, 8.04 s), so the cut keeps its beats.

- **First route: the hosted Comfy deployment** `genobi-ltx-world-v2`
  (release v2, min 0 / max 1, scales to zero between jobs). The studio and the
  site have parity on this route: Camera offers **Comfy Deploy ·
  layout-to-video** once the endpoint is registered
  ([the deployment guide](../../../../docs/comfy-deploy.md),
  [tester access](../../../../docs/tester-access.md)). The box graphs from the
  Vast session run on v2 through the CLI.
- **Alternative: a rented GPU box** (`scripts/vast/box/`, set up with
  `box-setup.sh`; about 8 minutes and $0.25 a clip), following the
  `genobi-audio-reactive` skill.

**A track.** A new track is **measured, never assumed**: its loop period and
beat period from the audio, then the guide is captured again on it and the
seven cut frames are recomputed from the measured grid
([the general rule](../../../../audio-reactive/videos/fruits.md#the-general-rule-any-dance-edit-on-a-loop)).
New music from a caption comes from MiniMax Music 3, then the same
measurement. Every window then needs a new render, so say how many before
quoting.

After any swap, `checkMix` must pass, then render with the in-page renderer
(step 5 of the page's How to repeat it) and show a contact sheet before
saying anything about the result.

## The paid gates

Nothing is rendered or edited without a quote and the person's yes
([Quote, approve, then spend](../../../../docs/capabilities.md#quote-approve-then-spend)):

- **The first still** (Klein or Genobi Image): `genobi_quote`, show the
  price, wait for a yes, then `genobi_submit` with that quote (or
  `genobi submit --confirm` from the CLI).
- **Each render**, on the hosted deployment or a box: list every window you
  will render with the total, and wait for a yes to that list first.
- **New music** from MiniMax Music 3 is quoted and confirmed the same way.

Never retry an uncertain submission automatically or change its key. The
3D build, the capture, the bounding box, `checkMix` and the final in-page
render are free and local.

## Where the deep procedure lives

- The `genobi-audio-reactive` skill (load it with `genobi_skill`): the
  capture, bundle, render and review loop, and the three swaps.
- [The swap template](../../../../audio-reactive/videos/fruits-template.md):
  slots, what is proven, the first ffmpeg cut.
- [fruits.md](../../../../audio-reactive/videos/fruits.md): the swap edit and
  the rule any dance edit on a loop follows.
- The preset pages:
  [fruit-mecha](../../../../audio-reactive/presets/fruit-mecha.md),
  [fruit-mecha-morph](../../../../audio-reactive/presets/fruit-mecha-morph.md),
  [fruit-apple-banana](../../../../audio-reactive/presets/fruit-apple-banana.md),
  [fruit-banana-apple](../../../../audio-reactive/presets/fruit-banana-apple.md).

Record each brief and correction with `genobi_decision`, quoting the person,
one entry per correction.

## Not built yet

- The suggested bounding box in the interface: the rectangle is written by
  the capture, and the agent shows it by hand.
- The Klein region edit from a person's reference has a route but was not
  run for the six characters made on 3 November (the owner made those stills
  in Genobi Image).
- A new track or MiniMax music for this piece: the route exists, not run.
- A hosted card that takes these slots: today the drop happens in the
  Director's Make my version or in a chat with the agent.
