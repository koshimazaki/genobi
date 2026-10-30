---
tags: [director, sound, memory]
summary: How the Genobi teaser was made - v1, the first cut, v2, the owner's two rounds of corrections, and v3, creatures instead of realism - and how to recreate or continue each version.
---

# Genobi teaser: how it was made

Two minutes of the studio in use cut to the owner's track "Trailer-Genobi"
at 135 BPM: studio footage driven in a browser, the owner's generations on
the drops, Transitions.dev titles and reveals run unchanged, and Genobi
recipes for the pointer, focus boxes, camera moves and wipes. Nothing is
generated. The template is described in [the Genobi
teaser](../../../genobi-teaser.md), with its own "Changing it" steps; this
page is its history. The record is [`memory.json`](memory.json).

| Version | Source   | Date (UTC)    | What changed                              | Shaped by    |
| ------- | -------- | ------------- | ----------------------------------------- | ------------ |
| v1      | snapshot | 30 Oct, 02:31 | The first cut                             | owner, agent |
| v2      | snapshot | 30 Oct, 04:34 | Sharper, on the lyric, with a taste layer | owner, agent |
| v3      | snapshot | 30 Oct, 11:00 | Creatures, not realism                    | owner, agent |

## v1: the first cut

The brief: a teaser of the studio in use, built the way
the Dimensions mix is, cut to the owner's own track, with real footage of
each part of the studio and the owner's generations on the drops. Nine
silent recordings were made by `scripts/capture-genobi-teaser.mjs` with
nothing spent; seven new recipes carry the titles, the pointer, focus
boxes, camera moves, reveals and wipes. Review notes applied before merge:
the HUD says what the studio did ("CUT IN GENOBI") rather than where clips
came from; Scrolls, a light page, is kept to four beats on its dark cells;
every interface beat zooms onto a readable detail. The owner asked for this
showcase _"the same as the other one: taking the original video to edit"_.

## v2: sharper, on the lyric, with a taste layer

Two rounds of the owner's corrections (the implementation update; every one is a memory event in
`memory.json`, imported from `docs/genobi-teaser-memory.json`):

- **Round 2.** _"a bit blurry, too low res"_: rendered at 1920 × 1080, the
  studio re-recorded at 3840 × 2160 by replaying the same takes (_"Record as
  before, those were great actual takes"_), no AI upscale. _"we don't say
  about camera control"_: CAMERA CONTROLS at 0:27. The vocal sings
  "Three.js": ★ THREE.JS at 0:36 into the ComfyUI workflow at 0:38. A
  TASTE LAYER on black lists the libraries Genobi really ships, and the cut
  repeats less.
- **Round 3.** The shaders arrive when the vocal sings _"shaders,
  transitions"_ (about 1:16 to 1:18): Paper's dithering shader, lighter and in
  the teaser palette, then a Space.js effect; the beats after it follow the
  words. No text over the ComfyUI shot. ANDREW ZELLINGER first in the TASTE
  LAYER. The owner's own upscaled FLUX and MiniMax clips are swapped in as
  files.

Four reusable rules from these rounds wait as Taste proposals in
`docs/genobi-teaser-memory.json`; only the owner activates them.

Opening v1 after v2: v2 re-recorded the footage at the same paths, so v1's
recordings are kept in `public/media/showcase/genobi-teaser/v1/` (about
16 MB), and v2 changed `gen-title`, `ui-cursor` and `ui-focus`, so v1 is
built on today's recipes with `plate: 0` and `view: ""` (no plate, no
move), which draw as v1's did (`rebased` in `memory.json`).

**Limit.** v2's media is about 105 MB, over the local project copy's
then 100 MB limit (raised to 150 MB on 30 October 2026, so it now fits), so v2 opens and plays in the
Editor but its edits are not saved to the server's copy ("Project copy not
updated: Project media exceeds 100 MB"). Download bundle keeps them.

## v3: creatures, not realism

The owner, 30 October: _"remove the bicycle… or the bike and the trees, and
use more creatures and anime stuff across the board"_, so the teaser and the
Dimensions mix share one look, with his new upscaled footage, and everything
done in and visible in the Genobi Editor. Every beat, overlay and
lyric-synced card stays where v2 put it; twelve shots change their footage:
the motorbike, the forest trees, the neon bloom and the toy creatures give way to the owner's
upscaled MiniMax H3 (open weights) creature clips, and the rendered
Dimensions mix beat plays his upscaled render. The quote's focus box
(`focus-66`, the implementation update) holds 1.43 s. The gallery, Camera and Dual Swords takes are recorded again so the
interface shows the upscaled media. The teaser bundles only
the seconds it plays of each creature clip, so v3's media is 146.5 MiB (under the 150 MiB limit) and
its edits save to the project copy. The steps are in [the teaser's version
3 notes](../../../genobi-teaser.md#version-3-creatures).

**Quality pass** (the owner on the v3 render: _"the recordings should be
made in higher quality initially, and use the new cards … exactly the same,
but recorded in higher resolution"_): every UI take but licences and save
recorded again at 3840 × 2160, near-lossless, from this branch; 0:19–0:24
shows the Editor timeline (move, trim, cut, Regenerate); one creature runs
through the shader beat into the TASTE LAYER, which carries the owner's
credit line; the submission master is a 24 Mb/s render kept outside the
repository. Details in [the teaser's notes](../../../genobi-teaser.md#version-3-quality-pass-owners-review-of-the-v3-render).

Opening v1 and v2 after v3: the Dimensions mix gallery video and the
gallery, Camera and Dual Swords takes were replaced at their paths, so the
older bytes are kept in `public/media/showcase/genobi-teaser/v1/` and
`v2/`.

## Recreate a version

- **Open it:** Gallery › Genobi teaser › How it was made › Open v<N> in the
  editor, or `/director?showcase=genobi-teaser&version=<N>&workspace=editor`.
- **Rebuild the file:** `node --import tsx scripts/showcase-versions.mjs genobi-teaser`.
- **Render it:** open it and press Render MP4, or follow the teaser's
  [re-render steps](../../../genobi-teaser.md#re-render).

To continue from a version, follow
[the showcase steps](../README.md#for-agents-continue-from-a-version).
