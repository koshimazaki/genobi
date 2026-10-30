---
tags: [director, studio]
summary: Composition resolution, asset matching, framing and responsive Program/output monitors.
---

# Composition resolution and monitors

The Editor's composition settings offer **960 × 540**, **1280 × 720**,
**1920 × 1080** and **Match assets**. Match assets measures every video in the
bundle, chooses the largest by pixel area, and fits the current composition's
aspect ratio inside that video. Both dimensions are even for H.264; exact aspect
ratios round down to whole multiples. It refuses projects without a readable
video. The renderer cap remains **1920 × 1080 pixels** (portrait and square
frames use the same area budget), with schema dimensions from 16 to 4096.
Choosing a preset changes the aspect ratio to 16:9.

Resolution changes use the same Director command as agents and live co-editing:

```json
{
  "copyId": "project.abcdefghjk",
  "baseRevision": 12,
  "command": { "op": "set-resolution", "width": 1920, "height": 1080 }
}
```

The command API refuses a stale revision. The studio records one Undo step.
Timing, audio and source media remain the same. Positions and motion offsets,
measured in composition pixels from the centre, scale with each frame dimension,
including locked layers. Scale and motion.scaleTo are dimensionless zoom ratios
**after contain fitting**: their rendered pixel sizes already grow with the
frame. Multiplying those ratios again would crop the picture.

`composition.designSize` retains the original coordinate space for the trusted
recipes that take literal pixel font sizes (title, caption and kinetic type).
The renderer scales those font values at draw time, keeping editable parameters
and historical recipe schemas intact. Glyphs draw directly at the new canvas
resolution. Recipes that size themselves relative to the frame keep doing so.
Old manifests without designSize draw as recorded.

Program and Render MP4 use the composition's width and height as their backing
store and encoder dimensions. Export retains 8 Mbps at 540p and scales with
pixel count, bounded to 2–32 Mbps. A page opened with `?exportMbps=` (2 to 40,
rounded; the teaser render script passes it for a submission master) uses that
rate instead. Export still requires a browser with H.264
and AAC WebCodecs support; resolution selection makes no provider call.

Dimensions mix opens at 1920 × 1080. Its bundled creature clips remain 720 px
squares; a larger composition does not invent detail in those files. Genobi
teaser already opens at 1920 × 1080 and uses 4K studio recordings. House templates
with placeholder plates keep their existing defaults until real media is placed;
use Resolution to choose their output size. Recorded showcase manifests and the
existing 540p Dimensions gallery preview remain at their recorded sizes.

In the Editor, the global prompt sits above Program and Finished video. The two
monitors share one grid and one movable panel. A divider changes their desktop
widths; narrow viewports and panels stack them. An empty output placeholder
reserves the second pane before rendering. Short panels scroll their contents,
so the finished card cannot paint over a neighbouring panel. Camera, Image,
Edit and Upscale keep their existing studio footprint.

## Verification

- `tests/director-resolution.test.ts`: coordinate and typography scaling, motion,
  Undo, limits, asset matching, feedback replay and input immutability.
- `tests/director-resolution-copy.test.ts`: revision refusal and live replay
  against the local server.
- `tests/director-export.test.ts`, `tests/dimensions-mix.test.ts`,
  `tests/showcase.test.ts`: encoder dimensions/rate, current template defaults,
  and recorded projects at their original sizes.
- With Vite running in this checkout, run
  `DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-editor-monitors.mjs`.
  It checks empty and rendered output at 1440 and 390 px, divider dragging,
  panel resizing and panel reordering. All API reads are fixtures and writes
  are blocked; its three-frame render is local. Also run the studio footprint
  checks in `scripts/check-phone-a11y.mjs`.
