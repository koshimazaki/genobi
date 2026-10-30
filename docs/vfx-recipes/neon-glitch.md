---
tags: [director, workflows, research]
summary: A dark neon subject treatment with palette mapping, displaced trails, block echoes and a loop-seam plan.
---

# Dark neon glitch

**Lineage:** [Kōda / @aimikoda](https://x.com/aimikoda), prompt supplied by the author.
See [source status and recipe promotion](README.md). Status: adapted brief,
not implemented or render-tested in Genobi.

## Reusable brief

Transform the selected clip into a dark, isolated neon performance. Preserve the
subject's identity, proportions and movement against a black field. Keep most
pixels black or navy; reserve cyan, violet and magenta for sparse lit planes and
edges. Let patch boundaries shimmer subtly. Build melting echoes, displaced
blocks and mixed-width vertical streaks around the subject. Add restrained grain
and falloff. Keep the source dimensions and frame rate, and deliver an H.264 MP4.
When looping is requested, hide the boundary with a staggered column transition.

## Starting controls

| Control        | Starting point from the supplied reference                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mask           | Anime/illustration: `isnet-anime`; live footage: `isnet-general-use`; inspect and correct unstable edges          |
| Tonal bands    | Five brightness levels before palette mapping                                                                     |
| Palette        | Cyan `#14b8f0` for cool/neutral highlights, violet `#6438c4` for middle tones, magenta `#ff2ad4` for warm accents |
| Edge light     | Magenta along the subject's left image edge                                                                       |
| Trails         | Fill current empty areas with a dimmed prior frame shifted slightly downward                                      |
| Block echoes   | Approximately 3% of 24 px blocks, sampled from the previous frame with small offsets                              |
| Drips          | Approximately 30% of columns; bright streaks up to 300 px upward and 150 px downward                              |
| Stroke mix     | 2–8 px drips plus thin palette-coloured scratches, weighted toward the subject                                    |
| Finish         | Light grain and vignette; highlights should not flood the black field                                             |
| Optional loop  | Stagger the last/first one-second transition by column; maintain output duration and frame count                  |
| Optional music | Original vaporwave/glitch cue, target around −12 LUFS; inspect peaks and the audio seam separately                |

The pixel distances are source starting points, not resolution-independent
defaults. Record the reference canvas and scale the settings when rendering a
different size. Preserve input timing; variable-rate footage needs an explicit,
recorded conversion decision before a fixed-frame processing pass.

## Candidate processing plan

Decode frames → subject matte → tonal/palette treatment and edge light → temporal
echoes → vertical streaks → grain/vignette → loop finishing → encode and inspect.
Record a seed and process frames in order. Define how the first frame gets its
history; test a warm-up or circular history so trails do not pop at the seam.
Measure the exported duration, dimensions and frame cadence rather than relying
on an encoder setting alone. Preserve or replace source audio explicitly.

The reference calls its block/trail treatment “datamosh”. This recipe describes
a pixel-domain simulation; it does not require corrupting codec motion vectors.

[rembg's upstream documentation](https://github.com/danielgatis/rembg) lists the
two mask models. It is a candidate dependency, not installed by this recipe;
check the selected weights and code terms before adoption. Python/FFmpeg are
one possible offline implementation. Inspect CPU/GPU availability and preview
a short range before processing the entire clip.

Current Director grade, transitions and graphics can contribute to finishing.
They do not implement this segmentation and temporal-feedback pipeline.
The soundtrack is optional and separate; this reference does not authorize a
paid music generation or a provider call.
