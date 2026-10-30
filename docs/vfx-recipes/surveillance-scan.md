---
tags: [director, workflows, research]
summary: Six-stage character analysis as a fictional HUD, preserving source art and distinguishing authored labels from measured analysis.
---

# Surveillance subject scan

**Lineage:** [Kōda / @aimikoda](https://x.com/aimikoda), prompt supplied by the author.
See [source status and recipe promotion](README.md). Status: adapted brief,
not implemented or render-tested in Genobi.

## Reusable brief

Animate the selected character image as a restrained surveillance-style reveal.
Retain the artwork and use masking, edge treatments, crops and overlays instead
of redrawing the character. Use monochrome interface graphics with one accent,
readable monospace labels, and place the stage panel in spare image space.
Protect the face from labels. Aim for a 15-second cycle at 15 fps, delivered as
both GIF and MP4, with a short glitch transition back into the opening.

## Stage plan

The equal intervals below are a Genobi starting proposal, not supplied source timing.

| Time      | Stage      | Treatment                                                                           |
| --------- | ---------- | ----------------------------------------------------------------------------------- |
| 0–2.5 s   | Acquire    | Desaturated feed, REC/camera ID, advancing timecode; reticle settles on the subject |
| 2.5–5 s   | Silhouette | Dim the background to a grid; scan to a flat matte, revealing head/body/limb boxes  |
| 5–7.5 s   | Structure  | Edge glow, a triangle-network treatment, then joint/skeleton graphics               |
| 7.5–10 s  | Features   | Restore source colour; face crop/zoom and four or five typed feature callouts       |
| 10–12.5 s | Palette    | Six colour swatches with hex values and measured shares; animate into a panel       |
| 12.5–15 s | Identify   | Fictional character ID/lock-on card, then a glitch into the acquire stage           |

## Analysis and authored graphics

Default to a **simulated character HUD** with editable boxes, joints and labels.
Keep any confidence, match or threat fields visibly fictional if authored.
Do not present invented percentages, manually placed boxes or a decorative
triangle network as detector output or recovered 3D geometry.

An optional measured-analysis implementation is separate: record actual masks,
landmarks and timestamped tracks, support correction, and show failures. Use
those measurements for real joint angles or confidence labels only when the
chosen tool produces them. No general recognition tool is added by this recipe.

For the palette stage, compute six clusters from a declared region, such as the
masked subject, and exclude transparent/background pixels. Record the clustering
seed, colour space and rounding so the swatches and percentages are reproducible.

## Candidate implementation and review

Prepare source/matte and any analysis once → author a frame-addressable stage
timeline → render the artwork plus separate HUD layers → make MP4 and a
palette-optimised GIF. A 15-second, 15 fps version contains 225 output frames.
Do not put the source through a new image generator merely to add the HUD.

Review face exclusion, label contrast, stage pacing, GIF colour loss, file size
and the last/first transition. Avoid a duplicated terminal frame or a timecode
reset flash outside the intended transition. Keep overlays editable in Director
where possible and preserve the untouched source.

Existing Director text/graphics and frame export are useful building blocks.
The six-stage template, segmentation, tracking, clustering and GIF delivery path
still require their own implementation and proof.
