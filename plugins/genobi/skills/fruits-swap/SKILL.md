---
name: fruits-swap
description: Make a version of Dance with Fruits, the content-swap mix template - the person says or types what they want and what it replaces ("a mango instead of the apple"), an image being an optional reference, and the agent writes the prompt for the first still, builds the moving fruit in Three.js, renders the loop's window with LTX-2.5 Layout-to-Render on the hosted deployment and cuts it in on the beat. Words, icons and UI are live recipe layers, changed with Director commands, never baked into the clips. Every paid step is quoted and waits for the person's yes.
license: MIT
compatibility: Needs this checkout with npm ci, Node 22 or later, Chrome (Playwright) and FFmpeg for captures; the Genobi studio, site or CLI for the paid first still and the render on the hosted Comfy deployment; a rented GPU box (scripts/vast) is the alternative render route.
metadata:
  version: "0.2.0"
  template: "fruits-swap"
  tier: "Open"
  tags: "agents, director, templates, world-builder, ltx"
  docs: "docs/fruits-swap.md, docs/fruits-swap-recipes.md, audio-reactive/videos/fruits-template.md, audio-reactive/videos/fruits.md, docs/comfy-deploy.md, docs/tester-access.md"
---

# Dance with Fruits (content swap)

A voxel dancer between two fruits, and every loop a different character: four
LTX-2.5 Layout-to-Render (open weights) renders of **the same guide window**
(window 0 of the explode capture, 8.04 s), cut hard on the loop and on the
drop beat so the pose, the fruits, the floor and the camera carry across and
only the dancer changes. It is a **mix** template (`run: "mix"`): opening it
generates nothing.

This is version 7, 33 s at 100 BPM. It opens on a splash of pixel fruit
flying over Signal black (`sprite-shower`), then the mecha with DANCE WITH
FRUITS typed on the beat (`typewriter`); the gorilla and the pink cat land on
loop restarts, the gold ninja on the drop of loop 2, and the end card closes
it. The words are set in Press Start 2P. The clips are plain footage: every
word, icon and UI element is a live recipe layer in the cut. The cut, the media and how to repeat it are in
[the template page](../../../../docs/fruits-swap.md); what a person can hand
in is in [the swap template](../../../../audio-reactive/videos/fruits-template.md).
Read both before touching anything.

## What the person hands in

Genobi is voice-first: the person **says or types** what they want ("say
what it replaces, or drop a reference and say what it is for"). An image is
optional; a spoken sentence alone is enough to start, and the agent then
generates what it needs. When they do drop an image, **it is the reference**:
the agent writes the prompt for the first still from it (or from their words
alone), builds the moving fruit in 3D, and renders the video. The image itself
never goes into the video.

| Slot      | They say or type (a reference is optional)         | Example sentence                                                                | Default when absent        |
| --------- | -------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| fruit     | the fruit they want and which one it replaces      | "a mango instead of the apple", or an image and "swap the apple with this"      | banana and apple           |
| character | the character they want and which loop it replaces | "a gorilla instead of the mecha", or an image and "this instead of the gorilla" | the grey and gold mecha    |
| track     | the song, or a caption for new music               | "use this song" / "make it a slow bossa"                                        | the Dance with Fruits loop |

The cut has four dancers: three on loops (mecha, gorilla, pink cat, each
13 beats of picture and a two-beat swap card) and the gold ninja swapped in
on the drop. A character replaces one of those four; the cut keeps its
length and its beats. If the sentence does not say what is replaced, ask; never guess which
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

The mecha's own still was made the same way, prompt verbatim: "voxel mecha
standing human size making dance moves with vox banana floating on one side
and vox apple on the other vox fruits advert studio shot, cinematic view, wide
angle lens use image 1 for shape guide only, its floating in the air".

Follow that pattern for a new character: the template's own still as
**image 1, the shape guide only**; the person's reference as the look; a
prompt in this shape (the character as voxels, its size and the dance, the
two fruits on either side, the advert studio shot and lens, "use image 1 for
shape guide only"). Show the prompt before quoting the still. Then the
Three.js capture and the LTX render below.

**The render.** **LTX-2.5 Layout-to-Render** renders the window on the guide
with that still. The new render takes that loop's place in the cut
(`fruits-swap-<character>.mp4`, 8.04 s), so the cut keeps its beats. Hand it
in with `genobi_take_to_project` and `replace-plate` on that shot's layer
(`shot-02` mecha, `shot-03` gorilla, `shot-04` gold ninja, `shot-05` pink
cat; `shot-01` is the splash). The render stays plain: no word goes into it.

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

## Words, icons and UI: live layers

A version changes the layers, not the footage (the house rule, [Layers, not
bakes](../genobi-director/SKILL.md#layers-not-bakes)). After a swap, rename
what names the old character with `set-parameters`, read the layer's current
`parameters` from `genobi_project` first and keep the rest:

| Layer id                                           | Recipe                          | What a swap changes                                                |
| -------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `title-typed`                                      | `typewriter`                    | `text` (DANCE WITH FRUITS)                                         |
| `word-gorilla`, `word-watermelon`, `word-pink-cat` | `kinetic`                       | `text`, the word slammed on the swap                               |
| `swap-1`, `swap-2`                                 | `space-hud`                     | `label` (SWAP // MECHA OUT), `credit` (NEXT · GORILLA)             |
| `hud-gorilla`                                      | `hud`                           | `text` (● REC CAM 02 // SUBJECT GORILLA)                           |
| `scan-gorilla`                                     | `scan-lock`                     | `text` while acquiring, `locked` once locked (" / " breaks a line) |
| `fruit-swarm`, `splash-fruit*`, `flood-*`          | `sprite-swarm`, `sprite-shower` | `count`, `x`/`y` (swarm); `density`, `speed` (shower); `size`      |
| `end-card`                                         | `end-card-still`                | `eyebrow`, `title`, `subtitle`, `credit1`, `credit2`               |

For example, a mango instead of the watermelon:
`set-parameters {layerId: "word-watermelon", parameters: {text: "MANGO"}}`.
To move a word in time use `move-clip`; to place it, `set-placement`; a new
word or icon is `add-graphic` with a recipe the cut already uses, so it
copies that layer's look. Never burn a word, icon or HUD into a clip, and
never re-encode a render to change one; the full layer list is in [changing
the words and icons](../../../../docs/fruits-swap.md#changing-the-words-and-icons).

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

- The swap cards hold darkened frames of the outgoing clip
  (`fruits-swap-card-1.jpg` from the mecha, `-2` from the gold ninja, made by
  `audio-reactive/edit/fruits-swap-media.py`, no words); a new mecha or gold
  ninja render needs its card still made again from that render.
- The suggested bounding box in the interface: the rectangle is written by
  the capture, and the agent shows it by hand.
- The Klein region edit from a person's reference has a route but was not
  run for the six characters made on 3 November (the owner made those stills
  in Genobi Image).
- A new track or MiniMax music for this piece: the route exists, not run.
- A hosted card that takes these slots: today the drop happens in the
  Director's Make my version or in a chat with the agent.
