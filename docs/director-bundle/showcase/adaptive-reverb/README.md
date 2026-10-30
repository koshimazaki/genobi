---
tags: [director, sound, memory, world-builder]
summary: How Adaptive reverb, the 3D + LTX template, was made - v1, the whole LTX-2.5 + AKUSPACE take over its own sound - and how to recreate it or regenerate a room.
---

# Adaptive reverb: how it was made

A 30-second piece and the gallery's 3D + LTX template: one take made with
LTX-2.5 (open weights) and the AKUSPACE acoustic-space LoRA, dropping between
skyscrapers into a cathedral, then a crowded hall, then a small wooden studio,
its own sound changing with each room. Nothing is generated. The template and
Acoustic Space end to end are described in
[Adaptive reverb](../../../adaptive-reverb.md); this page is its history. The
record is [`memory.json`](memory.json).

| Version | Source | Date (UTC)    | What changed                      | Shaped by    |
| ------- | ------ | ------------- | --------------------------------- | ------------ |
| v1      | #254   | 30 Oct, 15:30 | The first cut, the whole take     | owner, agent |
| v2      | #255   | 30 Oct, 15:45 | One cathedral readout, on the cut | owner, agent |

## v1: the first cut

The owner's brief (30 October 2026): an "Adaptive reverb" template, _"proof
that this is made with LTX-2.5 (open weights) + our AKUSPACE acoustic-space
LoRA, open source"_, keeping the video's own audio as the track and its full
length; a camera-surveillance ROOM SCAN look in the cathedral with readouts of
the real RT60 and preset from the repository; smoother transitions with
wireframe, scan and slice-glitch effects at the room changes; the built room
in the workflow between the bigger room and the small one; and an editable end
card, ADAPTIVE REVERB, LTX-2.5 · OPEN WEIGHTS, AKUSPACE ROOMS. Later that day:
_"this should go as the new template for 3D and LTX"_, so the card reads
3D · LTX template.

The take plays whole on one track slot. Each room's preset and trained RT60
come from `shared/akuspace-presets.json` (cathedral ~4.8 s, medium room
~1.9 s, small room ~0.67 s), the mapping is the owner's, and the template's
`REVERB_ROUTE` records the workflow and World Builder example set for each
room so an agent can regenerate one after a quote and the owner's approval.
The workflow appears as a node diagram drawn from its JSON.

## v2: one cathedral readout, on the cut

The owner's review of v1: around 0:11 two of the same room panels overlapped
in the cathedral and one looked ghosted, and the cathedral's label and
readouts came in late. v2 keeps one crisp readout (the scan, RT60 ~4.8 S),
starts the scanlines and HUD on the cut into the cathedral (7.9 s) and the
hall's glitch on its cut (15.9 s), and labels the workflow card WORKFLOW GRAPH
· FROM THE JSON with `world-builder-akuspace-ltx.json` as its credit. The
owner will record the actual workflow and World Builder scene himself; the
card is a one-file swap, see
[Swap in your own recordings](../../../adaptive-reverb.md#swap-in-your-own-recordings).
The hall and studio are unchanged.

## How to repeat it

Open v1 or v2 from the Adaptive reverb card's "How it was made" list ("Open v2 in
the editor"); it opens as `adaptive-reverb-v2`, an editable project of its
own. To make the next piece like it, follow
[How to repeat it](../../../adaptive-reverb.md#how-to-repeat-it), and to make
a room again, [How to regenerate a room](../../../adaptive-reverb.md#how-to-regenerate-a-room).
