---
tags: [director, sound, memory]
summary: How Bloom, the anime teaser, was made - v1, the first cut to the owner's track - and how to recreate or continue it.
---

# Bloom: how it was made

A 19-second anime teaser of the owner's character Bloom: two MiniMax H3
(open weights) takes of one character sheet, cut to the owner's track
"Anime-Genobi" (music by Koshimazaki, owner-made) at 140 BPM, under a character-scan and
surveillance look. Nothing is generated. The template is described in
[Bloom](../../../bloom-teaser.md); this page is its history. The record is
[`memory.json`](memory.json).

| Version | Source | Date (UTC)    | What changed                        | Shaped by    |
| ------- | ------ | ------------- | ----------------------------------- | ------------ |
| v1      | #252   | 30 Oct, 14:12 | The first cut, to the owner's track | owner, agent |

## v1: the first cut

The owner's brief (30 October 2026): a new anime teaser for the "bloom"
character, _"proof of the open path: MiniMax H3 (open weights) video + the
owner's own music"_, the best moments of both clips cut on beats ("you may
skip a beat cut to let a strong shot flow"), in a character scan and camera
surveillance look: scanlines and HUD readouts, target boxes on the
character, REC / CAM labels, a character-sheet scan that maps the sheet's
callouts onto the moving figure, Space.js overlays, and an editable end card
reading BLOOM, ANIME TEASER, MUSIC · KOSHIMAZAKI.

The prompt that made both takes, with the character sheet as `img1`, is
recorded verbatim in the record and as `BLOOM_PROMPT` in the template.

The cut was first built on a placeholder 120 BPM beat while the track was on
its way. The owner then sent "Anime-Genobi", 19.152 s: _"so the teaser is ~19
s, not 30 — fit the cut to the track (end card inside it, no silence after
the track ends, no looping)"_. Analysed at 139.86 BPM with its first
downbeat on beat 3, it runs at 140 BPM: the sheet scan is the pickup, the
first shot lands on the downbeat, the wireframe sweep on the drop, the title
on bar 8 and the end card holds while the track plays out, 30 ms before it
ends.

The construction end card's still was fixed to a Dimensions creature, so
v1 added `end-card-still`, a copy with the still as a parameter; the
Dimensions mix's recipe is unchanged.

## How to repeat it

Open v1 from the Bloom card's "How it was made" list ("Open v1 in the
editor"); it opens as `bloom-teaser-v1`, an editable project of its own.
To make the next piece like it, follow
[How to repeat it](../../../bloom-teaser.md#how-to-repeat-it): memory first,
copy and rename the inputs, contact-sheet the takes, encode once, write the
cut as beats, render with the in-page renderer, then add a version here and
run `node --import tsx scripts/showcase-versions.mjs bloom-teaser`.
