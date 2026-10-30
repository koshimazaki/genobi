---
tags: [director, sound, memory]
summary: How the Dimensions mix was made, version by version - from the first cut with a baked end card to the editable card with the owner's credit - and how to recreate or continue each version.
---

# Dimensions mix: how it was made

A 23-second Supernatural Creatures teaser: the owner's three MiniMax H3
creature clips cut on the bar to the owner's track "Dimensions"
(Koshimazaki Mix, Bob Macc master) at 140 BPM, with the Signal overlays and
an end card. Nothing is generated. The template itself is described in
[the Dimensions mix](../../../dimensions-mix.md); this page is its history.
The record is [`memory.json`](memory.json).

| Version | Source   | Date (UTC)    | What changed                                      | Shaped by    |
| ------- | -------- | ------------- | ------------------------------------------------- | ------------ |
| v1      | snapshot | 29 Oct, 01:46 | The first cut, with the end card baked as a video | owner, agent |
| v2      | snapshot | 29 Oct, 18:53 | The owner's credit, white slams, Retro Gaming     | owner, agent |
| v3      | snapshot | 29 Oct, 23:53 | An editable end card; Nokia Cellphone FC bundled  | owner, agent |
| v4      | snapshot | 30 Oct, 00:22 | The card credits only KOSHIMAZAKI MIX             | owner, agent |

## v1: the first cut

The brief: a finished teaser of the owner's three
creature clips cut to the owner's track, opening cold on the drop, each
creature on its beats, the title on the biggest hit and an end card that
holds while the music fades. The cut was written as data in beats and
source seconds at 24 fps; seven Signal recipes draw the screen open, build
panels, scan, wireframe, slams, HUD and glitches. The IGNITE and SHIFT
slams were lilac and the title used Explorers, a local font. The end card
was captured from the Signal construction effect into `mix-end.mp4`, so
its words were pixels. The owner's first review put the mix first in the
gallery, opening as it is, and as lanes at 140 BPM in the Editor.

## v2: the owner's notes

The owner's Regenerate note: _"change the name to Koshi Mazzaki Mix, and
music Dimensions; change the popping up stuff from pink to white; use retro
gaming on the text"_. Read as: the credit "Dimensions · Koshimazaki Mix",
the slams and the title's offset block near-white (`#f6f8f2`), and the
Retro Gaming stack for the slams and title. The end card stayed baked, so
its credit line still showed the earlier name.

## v3: the end card becomes editable

On the end card the owner first asked _"make the the title 'Koshi Mazaki
Mix' and then the music Dimensions"_, and an agent laid two overlays over
the baked card, under which the old name still showed. The owner then said
_"Yes, so it's baked. So we need to like regenerate. So basically, make the
new one. Essentially, that's the point."_ That was read as: replace the
card, not generate a clip. The update made the card the `end-card` recipe (the
construction effect, loaded unchanged, with every word a parameter) and
removed `mix-end.mp4`. On the owner's decision the mix stopped using
Explorers (proprietary) and Retro Gaming (no licence) and bundled Nokia
Cellphone FC, so every browser draws the same face.

## v4: the credit

At the owner's request the card's second credit reads only
**KOSHIMAZAKI MIX**. This is the template as the gallery opens it today.

Afterwards the owner found card 13 missing in the Editor (_"I don't see the
video, I don't see the card 13 from the storyboard"_): saved copies from
before v3 kept the baked card, hidden in the owner's copy, and Program went
blank after a workspace switch. The update adds the editable card to such copies
as they open and redraws Program.

## Recreate a version

- **Open it:** Gallery › Dimensions mix › How it was made › Open v<N> in the
  editor, or `/director?showcase=dimensions-mix&version=<N>&workspace=editor`.
- **v1 and v2** use the baked capture `media/mix-end.mp4`, which is not
  shipped: its credit line shows an earlier name the owner took off the
  card. They open with the editable card standing in over frames 453 to
  555, and a frame note on it says so. The earlier capture is intentionally
  omitted from this snapshot; its content hash remains in `memory.json`.
- **Rebuild the files:** `node --import tsx scripts/showcase-versions.mjs dimensions-mix`
  verifies the frozen `project-v<N>.json` media and refreshes
  `media`; `--check` says whether anything would change.
- **Render a version:** open it, then Render MP4 (Chrome), as in
  [the Dimensions mix](../../../dimensions-mix.md#how-it-was-made).

To continue from a version, or to add v5, follow
[the showcase steps](../README.md#for-agents-continue-from-a-version).
