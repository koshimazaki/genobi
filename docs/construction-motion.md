---
tags: [licences, director]
summary: "Signal: construction video workflows \u2014 usage, provenance and licence boundaries."
---

# Signal: construction video workflows

Signal is an opt-in Genobi theme and video composition surface. It builds upon
**UI generation / skeleton-texts** by Jakub Antalik / Transitions.dev, with
Genobi titles, typography, brief slice glitches and three original compositions.
The decorative code/log text does not claim an agent or model is working.

## Use in the app

1. Choose **Signal / Construction** in Theme.
2. Open a section and prepare the view. In Scrolls, choose Character sheet,
   then Examples, open a character reference and Add to my references.
3. Click **Build this view**. Choose UI build, Signal teaser or Character reveal.
4. Change the title and typography. Artwork / GLB replaces the captured view
   with a local PNG, JPEG, WebP or self-contained GLB under 50 MB.
5. Replay build. Escape or Back to studio returns to the unchanged workspace.

UI build lasts 6 seconds; teaser 5; character reveal 8. A GLB rotates once over
that duration and plays an idle loop (or its first non-pose animation), if present. No retargeting,
rigging, model generation or provider call takes place. GLBs must embed textures;
external dependencies are rejected. Rendering stays in the browser. A still
artwork stays a still image; no 3D movement is inferred from a character sheet.

The workspace is an inert DOM snapshot. Video and canvas previews in that
snapshot are captured stills, not a recording of their playback. Local GLB
replacement is rendered live. The live app behind the dialog is not animated or
edited. The construction overlay cancels on resize or page hiding. Reduced
motion skips the build, scrambling, slices, push-in and GLB movement.

## In the Director

The Dimensions mix's end card runs this effect as the `end-card` Director
recipe: the card's words are layer parameters that the inspector and
`set-parameters` change, and the recipe redraws the build on the
composition's clock for preview and Render MP4. The recipe loads
`ui-generation.js`, `clock.js` and the CSS from this folder unchanged; see
[the end card](dimensions-mix.md#the-end-card).

The [Genobi teaser](genobi-teaser.md) adds the effect's newer text, small-text
and image variants (`public/motion/text-generation/`, upstream commit
`e3aefb554d8f`, unchanged) and four free Transitions.dev transitions
(`public/motion/transitions-dev/`) as the `gen-title`, `gen-image` and
`gen-status` recipes, run through Genobi's stage (`public/motion/stage/`).
This folder keeps its older pin.

## Agent contract

`public/motion/presets.json` is the versioned source of preset IDs, labels,
timing, typography copy, glitch moments and construction steps. The React UI
uses that same manifest. Agents can choose `ui-build`, `teaser` or
`character-sheet`, prepare the workspace or supply a local asset, then use
labelled controls. This is a browser workflow, not a new MCP tool or paid API.

To add a composition, add a manifest entry and test its timing against the
capture range. Credit the underlying effect and describe which composition,
timing, typography and media treatment are yours. Do not relabel a modified
upstream renderer as MIT. See [licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md#motion-effect-and-hackathon-disclosure).

## Capture

Use a 1920 × 1280 viewport. The top 1920 × 1080 is the film; controls are below.
Capture the whole viewport and crop to the top 1080 pixels during encoding;
changing viewport dimensions mid-capture cancels the animation.
Choose Frame capture and save Frame 0, then Next frame through frame 179 (UI),
149 (teaser), or 239 (character). Each step is 1/30 second. Screenshots should
keep the whole viewport with no dialog scroll offset. Crop while encoding:

```sh
ffmpeg -framerate 30 -i frames/%04d.jpg -vf crop=1920:1080:0:0 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart output.mp4
```

The frame clock is module-local. Browser timers and rendering remain native;
GLB animation is explicitly sampled at the capture time. Closing the dialog
releases model geometry, materials, textures, renderer and object URLs. The
page does not itself encode MP4 or save uploaded assets between sessions.

## Attribution and upstream collaboration

The renderer is pinned to upstream commit
`7189cbaeb284bd5a7c8f2d3260f449fea1d547e2`, under its original custom licence.
`public/motion/construction/ui-generation.js` differs only by a clock import;
its drawing algorithm is unchanged. The CSS is upstream. Genobi's wrapper,
clock, compositions and GLB presentation are original integration work.

A potential upstream PR can offer the injectable clock or lifecycle fixes as
small independent changes with tests. The author has not been contacted and
no additional licence grant or acceptance of contributions is implied. The
user plans to share examples and discuss collaboration directly.

[Font choices and their terms](motion-fonts.md).

The optional **ASCII · 3D assets** control uses Three.js AsciiEffect for the local
GLB turntable. The taste page supplies a separate original ASCII torus study.
No remote model, copied demo dataset, or paid generation is needed for either.

Use **Load sample character** for the existing Ecctrl / Quaternius sample;
see the asset notices linked in the repository licence inventory. Animated poses
are centered before the turntable rotation. `/motion/credits.html` is the reel’s
creator-credit end card. Palette and typography defaults live in the preset manifest.

## Local verification

Checked on 23 October 2026. Formatting, lint (three existing warnings), source
size, TypeScript, Worker boundary, production Pages build, npm licence inventory,
wiki and registry checks passed. Twelve focused licensing/clock tests passed.
The full suite completed with 1,770 passes, one skip and two video-crossfade
failures in `ffmpeg-render.test.ts`; both failures reproduced on the unchanged
base revision with the installed FFmpeg 7.1.1. This is not a green full-suite claim.

Browser checks covered populated Scrolls capture, gallery teaser, sample GLB
and ASCII turntable, taste-page search, licence preferences, ASCII play/pause,
and the taste page at desktop and 390-pixel phone width without horizontal
overflow. The reel is 24 seconds, 1920 × 1080, 30 fps, silent; contact-sheet review
confirmed all three compositions and credits. No paid generation, deployment,
creator outreach or hosted-runtime verification took place.
