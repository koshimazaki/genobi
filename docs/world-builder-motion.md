---
tags: [3d, world-builder, sound, agents]
summary: Editable scene states, four voxel and room morph presets, deterministic audio mappings, and aligned browser guide capture.
---

# Scene motion: editable shapes on one timeline

World Builder has an optional scene animation engine inside its existing Three.js
viewer. It runs on the website and in the standalone Comfy scene adapter. Loading,
editing, playing and capturing a scene needs no provider key or inference GPU.
The viewport still uses browser WebGL.

## Four starting studies

![Four motion studies with their three authored endpoint states](media/world-scene-motion.png)

| Load preset                | Three authored states           | Geometry                                                              | Acoustic meaning                                        |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| Morph · Pyramid / cube     | Pyramid → Cube → Open structure | 64 retained cubes; interior cubes become a canopy                     | No enclosure inferred                                   |
| Morph · Cathedral / street | Cathedral → Chambers → Street   | 64 retained cuboids; nave, four chambers, eight buildings             | Explicit single-room proxy, separate from the buildings |
| Morph · Apartment / loft   | Compact → Expanded → Open loft  | 12 furniture and partition objects inside a changing rectangular room | The enclosing room supplies the acoustic dimensions     |
| Morph · Banana / apple     | Banana → Papaya → Apple         | 96 retained voxels, with fixed material identity                      | No enclosure inferred                                   |

Each starts with a fixed camera and state keys at frames **0, 72 and 144**. Movement
lasts six seconds; the 145-frame video at 24 fps includes the last frame's display
time and lasts **6.0417 seconds**. This follows the existing 8k + 1 capture grid.
The main Load preset menu and Library → Presets expose the same recipes as agents.

## How to repeat it

1. Open **3D / World Builder**, then choose an animation in **Load preset**.
2. Select one of the state thumbnails below the viewport. Build opens that
   authored state. Select a block and use the move/rotate/size gizmo or the object
   inspector. Only that state's transform changes.
3. Open **Scene → Scene motion** to name a state, adjust its frame and outgoing
   easing, or edit voxel twist X/Y, spread, lift and scale. Apartment dimensions
   change its derived walls. Source/listener positions stay inside the room when
   dimensions shrink.
4. Return to **Shot camera** and press Play, or scrub the frame slider. Build
   deliberately hides procedural and audio offsets so they are not baked into
   an authored transform.
5. Load a control track in **Sound**. Under **Scene → Audio → scene**, change which
   low, mid, high or level envelope drives each parameter, its signed amount and
   the overall intensity. No loaded track means authored movement only.
6. Save the recipe, or **Library → Presets → Save current as preset**, to retain
   the states, mappings and camera. Local media must be reattached when loading a
   saved preset, as in existing World Builder scenes.
7. Capture a fixed-frame take. Export RGB, the matching depth video, first frames,
   control-audio WAV when loaded, and the receipt. Changing a scene later cannot
   change the captured recipe.

For another set, **Create three states from this scene** keeps its current
primitives and starts three identical editable positions. Additional states can
be inserted at a scrubbed frame, with the evaluated authored transforms, room and
movement controls retained. The first state stays at frame zero. Changing take
length retimes an otherwise unchanged sequence and retains the selected state.
The stored schema supports **1–16 keys**; the initial UI offers three.

## What responds to audio

| Mapping                     | Result                                               |
| --------------------------- | ---------------------------------------------------- |
| Morph progress              | A bounded offset along the authored state timeline   |
| Twist X / Twist Y           | Horizontal/vertical lattice-layer rotation; X then Y |
| Spread                      | Changes distances from the group's pivot             |
| Lift / Scale                | Raises or scales the retained voxel group            |
| Room width / height / depth | Changes one explicit acoustic enclosure              |

The presets use low/mid/high for independent movement and a small level-to-morph
offset. Twists are Rubik-like layered motion, not a legal Rubik's Cube solver.
Existing per-object audio routes can still address an individual generated
`voxel-000` ID for height, scale, spin or glow. Media textures can be attached to
individual voxel faces through the existing inspector.

These are the existing level and crossover envelopes, not beat detection,
arbitrary FFT-bin routing or separated snare/hi-hat/bass instruments. Wet room
audio is a separate output and is never analysed back into motion. An independent
soundtrack can be placed in the Editor without changing these controls.

## Determinism and bounds

`Recipe.motion` is optional and versioned. Old recipes keep their existing
primitive, camera and audio behavior. A pure `evaluateScene(recipe, frame)`
function returns fresh geometry, room, controls and the remaining light/avatar
modulation at any frame. The runtime uses its transforms directly for Shot and
RGB/depth capture. There is no frame-history accumulator.

State interpolation runs before bounded procedural and audio offsets. State
transforms retain the same IDs and topology; material identity remains on each
object. The seeded voxel generator has its own **128-instance cap**, separate
from the existing **24 authored primitives**, plus up to six derived room faces.
The recipe remains limited to 64 KB. There are no arbitrary generators, scripts,
instance birth/death, mesh deformation or imported city maps.

A room records metric dimensions, floor-center position, source/listener local
coordinates, six surface-absorption values, wall thickness and an IR seed. The
apartment's cutaway hides its south wall and ceiling in the guide, while its
acoustic enclosure remains closed. Cathedral chambers and street geometry do not
claim multi-room coupling or outdoor acoustic simulation.

The camera retains World Builder's existing deterministic controls; the presets
start fixed. New per-state camera keys are not part of this format. Repeating a
sequence restarts its states; it is smooth only when its final and initial
geometry, room, controls and audio agree.

## Capture and workflow boundary

Motion receipts add `sceneEvaluation`: evaluator/analysis versions, canonical
recipe and control-envelope hashes, exact first-frame geometry/camera identity,
state IDs and the acoustic room identity. Existing RGB/depth/first-frame hashes
remain. A loaded WAV companion is explicitly labeled `motion-control` and its
hash is bound to that receipt.

This records local guide evidence; it does not complete the broader project-wide
asset-swap invalidation contract. Depth is an aligned exported guide. It is not
automatically wired as LTX conditioning. Canny export is outside this change.

The current combined Layout-to-video deployment graph uses native **static**
acoustic nodes. Animated recipes are refused before deployment submission and by
those native nodes, so they cannot silently become a static room or open sky.
Use the exported guides for a custom motion experiment, with a separately
rendered sound track. LTX motion adherence, image-conditioned fruit transitions,
native dynamic acoustic-node support and generated-video quality still require
their own workflow implementation/qualification.

## Agent entry points

Use `genobi_world` to list `presets`, then `load-preset` with one of these IDs:
`voxel-architecture`, `cathedral-street`, `apartment-morph`, `fruit-morph`.
The returned recipe includes the motion schema. Read `recipe` for its current
revision, edit state transforms/mappings, and use the existing guarded
`genobi_world_recipe` handoff. The CLI exposes the same tools. Capture uses the
existing `capture` command and returns the same artifact set as the UI.

In a mounted browser, `window.directorScene` offers `loadPreset`, `getRecipe`,
`configure`, `render` and `capture`. A direct recipe import must carry valid,
ordered frame keys; automatic retiming only applies when changing the duration
of an otherwise unchanged sequence.

## Local verification

Focused tests cover old-scene parity, one/two/three/five-state forward and reverse
seeking, fixed instance identities, transform order, bounded audio, room geometry,
state-local edits, duration changes and capture fingerprints. Browser checks
cover the actual viewport, instance editing, textures, saved recipes, narrow
layouts and RGB/depth evidence. `scripts/check-world-scene-motion.mjs` runs against
a local Vite server and blocks provider/network writes. The standalone adapter
must also be rebuilt and checked with the existing scene-adapter commands.

Related: [World Builder](world-builder.md), [sound controls](world-builder-sound.md),
[changing room sound](world-builder-dynamic-sound.md),
[capture](world-builder-capture.md), [GPU evaluation](audiovisual-gpu-evaluation.md).
