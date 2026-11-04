---
name: dimensions-mix
description: Make a version of the Dimensions mix, the first mix template - a swap-only edit where the person drops a clip and says which creature it replaces ("this instead of the forest one"), and the agent swaps it into that creature's slices while the cut keeps its beats. Nothing is generated; the optional SeedVR2 upscale of the render is quoted and waits for a yes. For a generated teaser it points at the anime-teaser skill.
license: MIT
compatibility: Needs this checkout with npm ci, Node 22 or later and Chrome or Edge for the Director's Render MP4; the optional upscale needs the Genobi studio with a Comfy key.
metadata:
  version: "0.1.0"
  template: "dimensions-mix"
  tier: "Open"
  tags: "agents, director, templates, sound"
  docs: "docs/dimensions-mix.md, docs/director-generate.md, docs/anime-teaser-template.md, docs/seedvr2-upscale.md"
---

# Dimensions mix (swap only)

"Supernatural Creatures": a finished 23-second teaser cut from three of the
owner's MiniMax H3 (open weights) clips to the owner's track "Dimensions"
(Koshimazaki Mix) at 140 BPM, with the Signal look on top (screen open, build
panels naming each creature, a wireframe scan, impact slams, slice glitches,
a beat HUD) and an editable end card. It is a **mix** template
(`run: "mix"`): nothing is generated, quoted or paid when it opens. The beat,
the slices and the recipes are in
[the template page](../../../../docs/dimensions-mix.md); read it first.

**This template is swap only. The cut keeps its beats.** A swap changes what
plays in a slot, never when: the 54 beats, the 12 creature slices, the title
slam on bar 9 and the end card stay where they are. For a new teaser made from
the person's own character (a sheet, a storyboard, two H3 shots and a track),
load the `anime-teaser` skill instead and say so.

## What the person hands in

| Slot     | They drop                | "With what" sentence             | What it replaces                        |
| -------- | ------------------------ | -------------------------------- | --------------------------------------- |
| creature | a clip of 13.5 s or more | "this instead of the forest one" | one creature's clip, in all its slices  |
| track    | a track                  | "cut it to this song"            | `mix-track.wav`, measured first         |
| words    | a line of text           | "call it …", "rename Duneward"   | the end card's words, a creature's name |

The creatures and their clips: **Nocthorn** (forest, horned) is `mix-03`,
**Mirebloom** (lake, flower) is `mix-01`, **Duneward** (desert plinth) is
`mix-02`. If the sentence does not say which creature, ask.

## What the agent does with each slot

**A creature.** Swap the clip into that creature's asset in the Director
(Make my version, or the Editor). It then plays in every slice that creature
had, at the same beats, from the same source seconds, cropped to the 16:9
frame at each slice's `cropY`. So:

- check the clip is at least as long as the furthest source window the
  creature's slices read (`checkMix` refuses a slice that runs past its clip);
- look at a frame of each slice: a square clip crops like the originals, any
  other shape may frame differently, so say what moved;
- the build panel and the slam words still name the old creature until the
  person renames them.

**A track.** Measured, never assumed: tempo, the in-point downbeat and the
excerpt's loudness from the audio, the way the page's "The beat" did it.
The slices stay in beats, so they move with the new tempo; check every
source window still fits and every hit still lands, and say what changed.

**Words.** The end card is a recipe layer, so its words are parameters; the
creatures' names are in the cut. Both are free edits.

After any swap, render with the Director's Render MP4 and show a contact
sheet before saying anything about the result.

## The paid gates

Swapping, `checkMix` and Render MP4 are free and local. The one paid step is
optional: upscaling the rendered MP4 2x with SeedVR2, the open upscaler
(`mix.upscale` in `shared/templates/dimensions-mix.ts`). It runs only when
the person asks, and like every paid run it is quoted and confirmed first
([Quote, approve, then spend](../../../../docs/capabilities.md#quote-approve-then-spend)):
`genobi_quote`, the price shown, a yes, then `genobi_submit` with that quote.
Never retry an uncertain submission automatically.

## Where the deep procedure lives

- [The template page](../../../../docs/dimensions-mix.md): the beat, the
  slice table, the recipes, the end card and how it was made.
- [Make your version](../../../../docs/director-generate.md): swapping media
  into a finished template's slots.
- The `anime-teaser` skill and its
  [specification](../../../../docs/anime-teaser-template.md): a generated
  teaser.
- [SeedVR2](../../../../docs/seedvr2-upscale.md): the optional upscale.

Record each brief and correction with `genobi_decision`, quoting the person.

## Not built yet

- Re-timing the cut to a new clip's action: the slices keep their beats and
  source seconds; moving them is a hand edit in the Editor.
- A drop zone for clips in the gallery card: swaps happen in the Director.
- The upscale is described, not wired to a button: the person renders the MP4
  and takes it to Camera, Upscale (or asks the agent). No upscale of the mix
  has run.
- Nobody listened to the cut here: cut points are beat arithmetic. Say "give
  it a listen" and leave the verdict to the person.
