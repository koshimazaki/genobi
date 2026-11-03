---
tags: [director, sound, memory, world-builder]
summary: How Audio Reactive Drop, the 3D + LTX template v2, was made - v1, five World Builder rooms in LTX-2.5 on one track, every room, the track and every overlay a swappable layer - and how to recreate it.
---

# Audio Reactive Drop: how it was made

A 32-second piece and version two of the gallery's 3D + LTX template: five
World Builder rooms rendered by LTX-2.5 Layout-to-Render (open weights) on the
owner's track "Adaptive Reverb v2", each with its own CPU room sound. The
template and its room sound are described in
[Audio Reactive Drop](../../../audio-reactive-drop.md); this page is its
history. The record is [`memory.json`](memory.json).

| Version | Date (UTC)   | What changed                    | Shaped by    |
| ------- | ------------ | ------------------------------- | ------------ |
| v1      | 3 Nov, 19:00 | Five rooms, every layer its own | owner, agent |
| v2      | 3 Nov, 21:30 | The singer's ending, the credit | owner, agent |

## v1: five rooms, every layer its own

The owner's brief (3 November 2026): _"a proper director template with all the
layers included. They should be visible as layers, swappable. Every detail
should be there to swap. Basically, whatever it was used."_ So each room is
its own file and its own shot at `sourceSeconds` 0, the track is one audio
file, the end card's still is one image, and each overlay is its own layer.
The pyramid rooms come twice, with and without the baked hologram, so the
hologram is a swap too.

The cut keeps the interface pass the owner reviewed that afternoon (variant
b): a gentle CRT visor, a REC HUD per room, a wireframe sweep and a slice
glitch into every room, the cathedral's room scan, the dancer box with its
depth heatmap, the pyramid's wireframe reveal and traced title, the studio
readout and the end card. The DROP title runs longer, 4 s over 14 track beats,
because the owner said the opening _"almost looks like a title drop, maybe it
could be longer"_. The grid is double time (273.6 BPM) so the picture cuts on
the phrases while the overlays still snap.

## v2: the singer's ending, the credit as a layer

On the cut that ends on the singer, the owner said (3 November 2026, about
20:45): _"great, use it as official template with all the layers"_. Read as:
that cut becomes the template, and every overlay stays its own visible,
swappable layer. The studio shot is now the last 97 frames of the original
Adaptive reverb take, the singer turning to the camera and smiling, upscaled
once to 1920 × 1080. The end-card still is gone: a `gen-title` layer traces
REACTIVE SPACES and its credit in beside her for the last 5.2 track beats, at
x 0.31, because gen-title's x is the text's centre and at 0.2 the title
clipped at the left edge. The studio readout runs four track beats instead of
six. The track is unchanged, so the studio's decay is still the booth
capture's. The booth render stays in the template as
`drop-studio-booth.mp4`, and v1's own studio file is kept under
`public/media/showcase/audio-reactive-drop/v1/` so v1 still opens as it was.

## How to repeat it

Open a version from the Audio Reactive Drop card's "How it was made" list
("Open v2 in the editor"); it opens as `audio-reactive-drop-v2`, an editable
project of its own. To make the next piece like it, follow
[How to repeat it](../../../audio-reactive-drop.md#how-to-repeat-it).
