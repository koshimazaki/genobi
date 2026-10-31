---
tags: [director, design, plan, templates, research]
summary: Restrained poster-window and temporal water-grid direction from the supplied stills and Kodoi prompt transcript, with implementation acceptance.
---

# Poster grid and water grid

**Creative direction, 31 October 2026.** This extends the
[Animations & Effects plan](animations-effects-plan.md). The supplied stills
and prompt transcript establish an aesthetic direction; they do not establish
the timing of the original video. The original video and soundtrack have not
been supplied.

## Reading the references

The two stills keep a full, readable character image behind a contained 3 × 3
treatment window. Thin pale lines divide that window. One treatment uses bold
posterized shapes and halftone; the other has a limited purple/orange palette.
The picture remains the main subject, with the grid acting as an accent.

The request explicitly favors restraint: "I wouldn't do too much visual chaos"
and "posterize mixed with jittering. And black and white maybe and some red."
That preference guides the adaptation of the longer high-energy prompt.
Its catalogue of glitches, flashes, typography and temporal tricks is a menu
of possible ingredients, not a requirement to apply them all at once.

The transcript names Poster Grid, Style Infection and Temporal Mosaic, followed
by a dense water-related temporal grid direction. The proposed first family is
**Poster & Temporal**, with two usable presets: **Poster window** and **Water
grid**. A spreading-style variant can follow once the restrained pair works.

The references were attributed in the conversation to Kodoi and headed
"Claude Opus 5.5 – Grid Effect." The original post permalink and video remain
unverified. The local study uses existing bundled footage and original code;
the uploaded reference stills are not redistributed with it.

## Two related presets

|                   | Poster window                                                                  | Water grid                                                                                |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Picture           | Full source remains readable behind the treatment.                             | One continuous source image across the whole grid.                                        |
| Grid              | A contained 3 × 3 window with thin neutral lines.                              | Optional dense 20 × 12 matrix; near-square cells at 16:9.                                 |
| Treatment         | Posterization, restrained halftone, paper/ink with a small red or cyan accent. | Gentle image refraction, small neighboring-cell time offsets and a subtle traveling wave. |
| Motion            | Small deterministic jitter and short held treatments with clean releases.      | A quiet ripple or delayed cascade that returns to the unified picture.                    |
| Continuity        | Preserve the source's spatial crop across cell boundaries.                     | Central 4 × 4 cells keep the primary source time; outer cells use bounded offsets.        |
| Default intensity | Low enough for the subject to remain recognizable.                             | Low enough that temporal displacement adds texture without losing the action.             |

Start with one main treatment and one supporting motion. Keep a clear view of
the original picture throughout the effect. A black/white/red preset and a
separate duotone preset are easier to direct than arbitrary palette changes in
every cell. Avoid persistent RGB separation, stroboscopic flashes or multiple
simultaneous glitch systems in these defaults.

The 20 × 12 layout is an option for the temporal treatment. It should not replace
the small window that makes the supplied stills effective. The original 1:1 and
later 16:9 prompts also need separate layout presets; stretching one into the
other would change cell shape and subject framing.

## Controls worth exposing

Keep basic controls practical: layout, window position/size, grid density,
palette, posterization, halftone amount, jitter, temporal spread, ripple amount
and overall mix. Offer a clean source comparison. Save timing and the source
crop with the preset.

Advanced temporal controls can select radial or diagonal propagation, anchor
size, maximum delay and reset points. Use explicit frame units for offsets,
even if the UI also displays milliseconds. A "water" control here describes
image refraction; a physical fluid simulation is a separate implementation.

## Timing and source rules

Every cell samples its matching spatial region of the source. A grid is not
240 copies of the full frame. When a cell uses another time, its spatial region
stays consistent with its place in the complete image.

Build temporal fragments from actual decoded source frames. For an exact output
frame, derive every source time, effect amount and cell offset from saved
parameters. A bounded frame bank or atlas can avoid a separate video decoder
for every cell. Declare the supported temporal range and boundary behavior;
do not hide source wrapping or an out-of-range request inside random effects.

Preserve the central anchor both temporally and visually. Surrounding fragments
can move through a bounded delay wave while the subject remains readable. A
small spatial jitter is independent of a temporal offset and must be labelled
accordingly. Repeated calls and forward/backward seeking must produce the same
result in the same rendering environment.

The local experiment uses an authored demonstration pattern and is silent.
There is no claim of soundtrack analysis or beat synchronization. Once the
actual track is supplied, use the project's audio analysis, review its beat and
accent markers, and save an explicit event/envelope track. A quiet passage can
reduce intensity; a major accent can trigger a short wave and clean reset.

For the transcript's 15-second source / 40-second music example, first author
the 40-second source edit: choose the cuts, loops, holds or retimes explicitly.
Then apply the grid choreography across that edit. Extending a source by
unannounced modulo looping would conceal an important creative decision. Export
duration should match the supplied track's duration at the chosen frame rate.

## Use the existing Taste references

The current Taste shelf already points to Alien.js fluid RGB distortion, Paper
Shaders dithering and Pixi CRT examples. These are useful building blocks and
visual references; none establishes a finished temporal poster-grid preset.

Use the shelf to select the narrow ingredient needed for a treatment. A direct
posterization/halftone shader is enough for the first window. Save a full Alien
fluid adaptation for the version that benefits from recorded flow forces and
simulation replay. The original local ripple is an analytic image distortion.

Keep source and licence records with any adapted shader. The new prompt
transcript does not identify the exact implementation used in the reference
video, so do not credit a particular library as its renderer without evidence.

## Implementation acceptance

- [ ] Provide Poster window and Water grid as separately named variants, with
      subdued defaults and a direct comparison to the source.
- [ ] Keep the picture continuous across cells and document any intentional
      crop/zoom inside a treatment window.
- [ ] Hold the dense grid's central 4 × 4 region at primary time; bound all
      surrounding offsets and disclose the source boundary rule.
- [ ] Prove real temporal differences using source-frame identities, not only
      different filters on the same frame.
- [ ] Make intensity zero a clean neutral treatment and keep play, pause and
      direct seeking reliable at desktop and phone sizes.
- [ ] Validate source and preset identity before applying saved configurations.
- [ ] Verify identical direct and reverse-seek frames in the same browser, and
      capture through the same explicit-time renderer used by preview.
- [ ] Bind actual audio only after the soundtrack is available and analyzed;
      keep authored demonstration timing clearly identified.
- [ ] Promote into the shared editable preset catalogue after source replacement,
      supported layout/fps, Undo and preview/export checks pass.

The isolated implementation is in `experiments/grid-study/`, with Quiet window
and Water grid modes, explicit-time playback/scrubbing and silent four-second
exports. It uses existing Bloom take B footage prepared as 128 JPEG-atlas frames
at 480 × 270, displayed at 960 × 540. Output starts at bank frame 16 and lasts
96 frames at 24 fps; outer-cell delay is limited to four frames, with frame-bank
clamping defined explicitly. The source and atlas hashes are recorded.

Local checks reproduced direct/reverse-seek pixels, neutral intensity and the
complete central 4 × 4 source region with grid lines disabled. The source and
comparison in those checks are the same prepared frame bank, not a claim of
lossless original-video pixels. Desktop and phone layouts, controls and invalid
programmatic inputs were also checked. Passing these local checks does not
complete the production catalogue acceptance above.

## Inputs still to bring in

- Original Kodoi post or reference-video file, especially the water version's
  temporal movement and resets.
- The actual soundtrack to establish duration, beat accents and energy changes.
- The Folio reflection/distortion source and the user's Drive kinetic-art
  shaders, as recorded in the parent plan.
