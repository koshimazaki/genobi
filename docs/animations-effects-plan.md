---
tags: [director, plan, templates, research, agents]
summary: Implemented 3D preset gallery and editable effects catalogue, plus remaining temporal-media, source-authoring and reference work.
---

# Animations & Effects

**Status: first catalogue implemented, 31 October 2026.** The gallery lives in
**3D → Library → Presets**, with the same effects picker in **Editor → Add track**.
Four configurable effects are insertable through one revision-checked action;
variants can be saved, imported and exported. Thirteen scene morph/travel presets
include the merged PR #40 studies, city-to-loft camera travel, finer fruit,
spacecraft/mecha, masks and palms with measured sub-bass response. One global
**Loop** sidebar captures the current arrangement and directly manipulated Shot
camera as A–D; loading the next asset preserves the saved slots. **Play loop**
interpolates the selected views and **Save loop** records the existing RGB/depth
take format. Camera settings sit beside Expand and the asset catalogue stays
below. An optional form composer also tick-selects two to four authored assets
with draft playback. Precise total-time controls extend through 721 frames.
Separate progress and
spectral-target axes, simple band pulls toward any state, prepared character-clip
triggers, independent object rotation/camera orbit, four transition styles,
enclosed 64/128/256-block architecture and a dark-grid lightbox extend the same
saved scene model. See the
[catalogue guide](effects-catalogue.md), [Loop workflow](world-builder-loops.md)
and [scene motion guide](world-builder-motion.md)
for the implemented contracts. The wider source-authoring and temporal-media
items below remain a backlog. No new paid generation is required to try this work.

## Product structure

Use **Animations & Effects** for the section and **presets** for saved
combinations. A preset can contain several editable layers; individual layers
remain animations, overlays, filters, titles or transitions. "Combo" can be
informal language without becoming another object people must learn.

| Place                 | Purpose                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Director: Templates   | Start a complete project: product film, anime teaser or another overall technique.                    |
| 3D: Library → Presets | Discover and configure scenes, morphs and effects inside the existing 3D workspace.                   |
| Editor: Add / Effects | Open the same catalogue for the selected clip or playhead; edit its resulting layers on the timeline. |
| Taste                 | Keep references, creator credits and explicit preferences that guide selection.                       |

Keep one catalogue and one preset format behind both workspaces. Start with
filters for **Cinematic / HUD**, **Fluid & Distortion**, **Scan & Hologram**,
**Poster & Temporal**, **Kinetic**, **Pixel & Terminal**, **Titles & Loaders**
and **Transitions**.
Each card needs a short preview, editable controls, required inputs and a clear
readiness label. A research reference, a working local study and an insertable
recipe are different readiness states.

Existing foundations are the trusted graphic modules, `shared/templates/mix.ts`
compositions, the bundle format, and [project memory and Taste](taste-memory.md).
The Taste shelf and [VFX reference briefs](vfx-recipes/README.md) are not a saved
composition library. Some catalogue entries also have stale integration notes:
Space.js and Paper have existing adapters, so a "recommended" shelf label is
not an authoritative inventory of executable modules.

## What a preset must preserve

A versioned preset contains ordered layers, relative timing, exposed parameters,
media slots, composition requirements, source/module versions and hashes,
declared fonts and assets, credits, a preview, and its parent/variant identity.
Depth, edge, camera-motion and audio-envelope inputs are explicit optional slots.
The preset declares whether it treats one clip, a group or the composition below.

The implemented first version binds the selected source, remaps IDs and inserts
an ordered block of independent editable layers in one Undo action with a
project-revision check. Saving its exposed configuration creates a portable
variant without changing previous uses. A persistent linked-group object and
extracting arbitrary timeline selections into new presets remain future work.

Keep media distortion and interface overlays separately addressable. For a
helmet treatment the typical order is footage, lens/distortion, hologram or
scan layers, then readable HUD and captions. A future transition must declare
two independent source inputs; today's composite-below filter interface does
not by itself supply that contract.

Expose catalogue listing, inspection, application and save-variant operations
through the same UI/API/CLI/MCP model. Agents should inspect required inputs,
editable controls and verified status before applying a preset. Record the
chosen family and composition fingerprint so they can propose distinct options
instead of repeatedly selecting the same familiar recipe. An explicit request
to repeat a treatment takes priority over novelty.

## First visual families

The supplied poster-window stills and temporal-grid prompt have a dedicated
[creative direction and acceptance page](poster-grid-direction.md). They favor
restrained posterization, halftone, small temporal offsets and water-like
refraction while keeping the source image readable. This is an additional
family alongside the initial three shader studies.

These are proposed compositions of building blocks, not claims that an upstream
library ships the finished Genobi treatment. The source review uses the existing
catalogue pins: Alien.js `67172dde1fe260e582957ee4fecbcf5983552c8c`, Space.js
`b9bff17bc4b13ecce2b273d2f0c5f8f71760adf1`, and Three.js r180.

| Family                               | Building blocks                                                                                              | Timing and integration                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helmet / drone / field monitor       | Space.js Tracker, Reticle, Graph, RadialGraph and Meter; Alien-style chromatic lens; editable scan overlays. | Camera pose or an authored velocity curve drives lens strength. Arbitrary video motion is not automatically tracked. Keep readouts visibly simulated.                |
| Fluid RGB lens                       | Alien.js fluid distortion and RGB shift beneath a clean HUD.                                                 | The actual fluid simulation has history: fixed steps, recorded forces, reset/replay and checkpoints. A sine-wave warp is a lighter treatment with a different label. |
| Wet mirror / kaleidoscope            | Alien.js DuDv reflection with Three.js KaleidoShader and a separate grade.                                   | Animate offsets, reflection angle and strength from frame time. This is a water-like image treatment, not physical fluid simulation.                                 |
| Side hologram / scan reveal          | Alien.js Fresnel, wireframe and hologram layers; Space.js panel labels.                                      | Start with primitives or approved models. Turntable and scan plane are direct time functions; trails would require history.                                          |
| Screen-to-scene transition           | Alien.js shader-mask, fade and scene transition examples.                                                    | Adapt two sources plus explicit progress. Do not import a live page router or assume the current matte transition is a two-clip transition.                          |
| Monitor boot / content reveal        | Space.js progress canvas, existing Genobi CRT, cli-spinners frame data and a verified ASCII adapter.         | Select spinner frames from composition time. Animation inside a video uses authored progress; live generation status must stay truthful.                             |
| Luminance terrain / Rutt–Etra family | Video luminance mapped to a wire surface, with holographic edge tint.                                        | Brightness supplies displacement, not recovered depth. A depth-map variant has different input provenance.                                                           |
| Kinetic vector loop                  | Authored SVG paths and transforms, or a reconstruction informed by a generated reference.                    | Prefer stable shapes and a shared phase clock. Independently traced video frames have no automatic point correspondence.                                             |

### Primary references

- [Alien.js fluid RGB distortion](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/examples/three/shader_fluid_distortion_rgbshift.html)
  and [Fluid implementation](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/src/three/utils/Fluid.js).
- [Alien.js hologram](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/examples/three/shader_hologram.html),
  [DuDv reflection](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/examples/three/shader_reflection_dudv.html),
  and [shader transition](https://github.com/alienkitty/alien.js/blob/67172dde1fe260e582957ee4fecbcf5983552c8c/examples/three/transitions/shader/main.js).
- [Space.js HUD](https://space.js.org/examples/ui.html),
  [graph markers](https://space.js.org/examples/graph_markers.html), and
  [progress canvas](https://github.com/alienkitty/space.js/blob/b9bff17bc4b13ecce2b273d2f0c5f8f71760adf1/examples/progress_canvas.html).
- [Three.js r180 KaleidoShader](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/shaders/KaleidoShader.js)
  and [AsciiEffect](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/effects/AsciiEffect.js).
- [Pinned cli-spinners frame data](https://github.com/sindresorhus/cli-spinners/blob/c5f18f654e0f6bdbf830713927f815a42190d774/spinners.json).
- [VIDVOX: Rutt–Etra displacement techniques](https://vdmx.vidvox.net/tutorials/advanced-v002-rutt-etra-techniques)
  distinguishes luminance displacement from RGB-to-XYZ mapping.
- [VTracer](https://github.com/visioncortex/vtracer) traces raster images into
  paths; temporal correspondence is additional work.

### Further directions beyond the current HUD language

- **Character-grid scenes:** [textmode.js](https://github.com/humanbydefinition/textmode.js)
  offers WebGL2 glyph grids and primitives; [play.core](https://github.com/ertdfgcvb/play.core)
  supplies an ASCII playground. Explore a whole scene turning into a moving
  character field, then resolving back to the picture, rather than only typing
  text into a terminal. Test the exact-time/export adapter before promotion.
- **Drawn kinetic marks:** [p5.brush](https://github.com/acamposuribe/p5.brush)
  supplies pencils, charcoal, watercolor, hatching and vector fields that guide
  strokes. A restrained ink or hatch layer would broaden the catalogue beyond
  luminous interfaces. Its vector fields describe stroke direction; they do not
  establish that the final output is editable SVG. Accumulated strokes need a
  reproducible redraw or replay contract.

These are research candidates, with versions and adapters still to verify for
the proposed presets. No additional library is installed by this study.

Keep exact source notices with adapted components. The pinned Alien package
references Space.js `#dev`; do not let that floating dependency determine a
reproducible render. Example fonts, textures and models need their own records.

## Editable HTML, SVG and shaders

Yes: agents should be able to edit source for end cards, graphs, titles and
other layouts, with text, palette, duration and animation parameters exposed in
the normal inspector. Preserve the HTML/CSS, SVG or shader alongside those
parameters so a later edit does not require reconstructing a flattened image.

The current HTML end-card adapter is a useful precedent. It drives a trusted
page on a controlled clock and rasterizes it into a graphic layer. Its
same-origin iframe is not a sandbox for arbitrary imported scripts. The
[bundle module contract](director-bundle/README.md) still validates registered
module hashes and does not execute arbitrary JavaScript from project ZIPs.

A general authoring host therefore needs its own explicit source boundary,
resource manifest and frame-render adapter. Layout, fonts and media must finish
loading before capture; animations must accept an exact time. Avoid importing
live timers, network state or uncontrolled randomness into export. Direct
evaluation, a replayable simulation and prepared media are separate timing
classes, all with seek and preview/export checks.

## Local experiments

The repository's `experiments/effects-study/` contains an isolated interactive
study with Field monitor, Liquid mirror and Signal terrain modes, an explicit
frame clock, intensity controls and save/reopen of study configurations. Its
README records the existing source video, precise Alien helper reuse and
reproduction steps. The saved study configuration is not the general preset
format proposed above.

`experiments/grid-study/` adds the restrained Poster window (named Quiet window
in the study) and Water grid variants using existing Bloom take B footage.
It prepares one bounded bank of 128 frames and renders 96 output frames at
24 fps. The water treatment keeps the central 4 × 4 cells at primary time;
outer delays are bounded to four frames. Its README records the 480 × 270
prepared source, 960 × 540 output, neutral-intensity and seek checks. The
silent demonstration uses authored timing, without soundtrack analysis.

`experiments/vector-study/` compares traces of an existing documented MiniMax H3
clip with a clean geometric control and an authored continuous SVG. Its report
records the actual presets, path/command changes, output size and image error.
No new MiniMax request was made. A path-only flipbook demonstrates vector
storage; it does not establish smooth, editable motion between the frames.

All experiments run locally. WebGL uses local graphics support or software
rendering; no hosted generative-model GPU is required. This does not establish
real-time performance on every computer. LTX conditioning and model evaluation
remain a separate workflow.

## Implementation backlog

These are issue-ready work items. Acceptance is deliberately narrower than
"add more effects" so each completed item can be demonstrated end to end.

### 1. Editable preset catalogue and insertion

- [x] Add the shared versioned preset/variant model and explicit source bindings.
- [x] Add discovery in 3D Library → Presets and the same effects picker in Editor.
- [x] Support inspect, insert and create/validate variant through UI/API/CLI/MCP,
      with revision checks, fresh IDs and one Undo action. UI variants persist locally.
- [x] Verify repeat insertion, source replacement, missing-input refusal,
      independently editable layers and factory/DirectorRenderer pixel agreement.
- [x] Seed Poster window, Cinematic scan + separate HUD, Kinetic title and an
      analytic Liquid mirror. Liquid mirror does not sample other video frames.
- [ ] Add persistent linked groups and extracting arbitrary timeline selections.
- [ ] Promote temporal Water grid with bounded prepared source-frame sampling.
- [ ] Record family/fingerprint usage and keep/reject evidence; preserve explicit
      repeat requests and owner control of reusable Taste activation.

**Implemented foundation.** Continue with the bounded temporal-media input
contract and richer choreography before expanding the effect families further.

### 2. Production effect packs and timing adapters

- [x] Promote the four catalogue presets after explicit-time recipe adapters,
      source replacement, supported dimensions/fps and export checks pass.
- [ ] Adapt Space.js instrumentation and selected pinned Alien/Three components,
      keeping the actual copied code, source lineage and runtime status clear.
- [ ] Add a depth-input terrain variant with near/far and provenance; keep
      luminance, estimated depth and scene-rendered depth distinct.
- [ ] Add two-source transitions with controlled progress and endpoint tests.
- [ ] Add real fluid/flowmap or afterimage effects only with deterministic
      simulation reset/replay and input recording.
- [x] Bind scene camera paths, morph mappings and measured sub-bass to the saved
      24 fps scene clock. Scene and camera audio response remain independently tunable.
- [ ] Connect the same prepared signals to Editor effect parameters and beat/phrase
      choreography. Edge maps can drive outlines; they are not a depth substitute.
- [ ] Include HUD safe zones, reduced-motion previews and readable controls.

### 3. HTML/SVG/shader authoring workflow

- [ ] Define editable source plus exposed-parameter and declared-asset contracts.
- [ ] Build a local preview/edit/reload workflow with actionable validation.
- [ ] Preserve trusted registered-module execution while designing a genuinely
      isolated custom-source host; do not weaken ZIP/module hash validation.
- [ ] Prove seekable HTML titles/end cards, SVG graphs and a shader treatment.
- [ ] Verify fonts, transparent output, clipping, exact capture time and failed
      source recovery with the same renderer used for export.
- [ ] Show what remains editable and what has been rasterized at every handoff.

### 4. Kinetic art intake and vector motion

- [ ] Bring in the user's Drive kinetic-art shaders once the actual files or
      links are supplied. Record creator, source, version and relevant notices.
- [x] Review the local H3 trace/control comparison: tracing alone does not retain
      compatible path structures over time; persistent authored primitives do.
- [ ] For a new MiniMax reference, prepare a flat-color, high-contrast, few-shape
      kinetic-loop brief with stable camera and clear object boundaries; use
      the existing quote/approval flow for any paid generation.
- [ ] Compare per-frame tracing with tracked/reconstructed shapes and direct SVG
      authoring on that exact reference; inspect flicker, shape identity,
      smoothness, fidelity, file size and editor performance.
- [ ] Keep smooth geometric animation as stable paths/transforms/keyframes where
      feasible. Keep fluid reflections or dense shading raster/shader-based
      when vector conversion loses the intended appearance.
- [x] Add a reusable kinetic preset with original source geometry and exact-time
      rendering. Its video layer is raster output; the source remains editable.

### 5. Interactive scene composition and audio

- [x] Integrate the merged World Builder studies and add thirteen motion presets,
      including city-to-loft travel, finer fruits, spacecraft/mecha, masks, palms
      and enclosed architecture at 64/128/256 retained parts.
- [x] Tick-select two to four authored forms, reorder A–D, preview independently,
      and choose direct, scatter, twist or assembly transitions before loading.
- [x] Save the current arrangement and directly framed Shot camera in one global
      A–D sidebar; retain those slots when loading another asset, recall any
      saved view, then Play or Save the composed loop through the existing take
      library. Use the first slot's shared stage and return to it within the
      selected duration.
- [x] Reuse the existing Camera settings beside Expand for a whole-loop named
      movement, with separate object rotation, camera orbit and audio modifiers.
- [x] Keep the timeline moving while measured audio bands pull toward selected
      states; retain the advanced two-axis morph controller for branching.
- [x] Route prepared band-energy onsets to available character clips with
      threshold, cooldown, hold duration and speed controls.
- [x] Record synth/line input for continuous live object/camera response, then
      analyze the recording for deterministic replay and capture.
- [x] Add the dark floor grid, persistent-canvas lightbox and bottom Assets shelf;
      verify desktop and phone selection, draft playback and controls.
- [x] Extend the local take to 721 frames, keep exact `8k + 1` timing in the
      manifest, and verify an actual 721-frame RGB/depth export at 24 fps.
- [ ] Import a user-supplied reference image into an authored block structure,
      preserving the original image and provenance for later video styling.
- [ ] Design a separate animation editor for poses, layered clips, envelopes and
      timing. Current character routing chooses existing clips.
- [ ] Evaluate correspondence for arbitrary imported models and articulated
      vehicle/mecha transformations; authored cuboid matching is the current scope.
- [ ] Connect dynamic scene guides and retained reference images to a documented
      LTX conditioning workflow, with its own endpoint and memory limits.

The implemented workflow and reproducible capture evidence are in
[scene motion](world-builder-motion.md). A local frame-compatible guide does not
increase a hosted model's supported duration or enable dynamic room-audio
conditioning in the existing static template.

### Reference inputs still needed

- [ ] The original Kodoi grid/video post or video file. Prompt transcripts and
      two tasteful stills have now been supplied and are captured in the
      [grid direction](poster-grid-direction.md). A particular hologram
      implementation and the water version's motion remain unverified.
- [ ] The actual Folio kaleidoscope, reflection and distortion implementation or
      reference clip. The local study is an original interpretation.
- [ ] The Drive folder/files containing the kinetic-art shaders; no exact paths
      have been identified or imported.

## Connection to scene interpolation

The scene evaluator now supplies the morph catalogue, independent camera paths
and measured audio envelopes. Future effects can consume their stable frame time,
camera pose and declared RGB/depth/edge/audio inputs.
First verify the local scene and effects independently. Then compare combined
guidance with LTX when the model workflow is available; no improvement in model
response is assumed from these visual studies alone.
