---
tags: [3d, world-builder, studio, sound]
summary: Human-scale connected sets, continuous descent and street templates, scene sizing and explicit room-sound previews.
---

# Stories at human scale

The **3D → Library → Presets** catalogue includes two connected scene templates.
Their geometry is authored in metres and the neutral mannequin is **1.8 m tall**.
These are editable geometric guides, not reconstructions of a particular city.

## Two starting points

| Preset                      | Picture and movement                                                                                                                                                    | Timing                                                                                        | Sound response                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Story · Endless descent** | A first-person camera falls between towers, through an open-shaft cathedral and club, then arrives in a DJ studio. Follow view shows the mannequin on the same journey. | 385 frames at 24 fps; last sample at 16 s. A single pass, without a return cut.               | Low energy pulls the tower squeeze; high energy pulls the taxi shuffle. The listener follows the camera through outdoor and indoor zones. |
| **Story · Bass avenue**     | One mannequin dances while grounded towers breathe and two taxis change lane positions. The camera sways and returns to its starting view.                              | 193 frames at 24 fps; last sample at 8 s. Camera and geometry return to their starting state. | Low and high bands target different retained poses. The outdoor street adds no enclosed-room reverb.                                      |

Both contain a slow authored progression without audio. Loaded sound adds
influence through the state-pull controls. A pull blends the whole target pose,
so a taxi pull can also relax a tower squeeze; these are not independent per-part envelopes. These are measured frequency bands,
not automatic kick/snare classification. Camera response can be enabled under
**Camera → Camera path & audio**; it starts off so the route is easy to inspect.

The descent keeps **93 retained parts** and the avenue **44**. Floors, interior
structure, room dimensions and character travel do not take the tower/taxi
deformation. Towers change width and height with their feet on the street deck;
taxi parts move together. This is authored deformation, not a physics simulation.

## Choose the view and FOV

The preset preview and **Camera** panel share a **Descent view** menu.
**First person · looking down** starts at 75° and looks down the central shaft,
with the character hidden from RGB and depth. At the end it gently looks toward
the DJ desk while the camera continues descending. **Follow the mannequin**
restores the character and following view. The FOV fader edits the whole camera
move; the existing per-key lens and movement tools remain under **More camera
settings**. Switching views preserves edited timing, FOV and camera offsets.

## A connected vertical set

Y is height; each room's centre is the centre of its floor. Openings in floors
and ceilings give the camera and mannequin a clear route.

| Space             | Floor height | Authored enclosure, width × height × depth          |
| ----------------- | ------------ | --------------------------------------------------- |
| Street and towers | 40 m         | Outdoor detection region; no enclosing acoustic box |
| Cathedral         | 12 m         | 24 × 28 × 36 m                                      |
| Basement club     | 4 m          | 16 × 8 × 20 m                                       |
| DJ studio         | 0 m          | 8 × 4 × 10 m                                        |

The camera slows at the lower floors without stopping at intermediate keys.
The mannequin uses the existing jump-air, landing and dance clips. The set
contains one character; a crowd, singer and traffic simulation are future work.

## Resize the surroundings

Use **Scene size** in the global Loop sidebar. Type a multiplier, drag the fader,
or choose **Small 0.5×**, **Original 1×** or **Large 2×** from the compact preset menu when available. The fader
commits on release, key release or blur, without rebuilding on every pointer move.

- Geometry, camera positions/targets, character placement/travel and explicit
  acoustic dimensions resize together.
- The mannequin mesh stays 1.8 m tall. Body animation and camera response
  amounts remain physical metre values.
- The readout shows active-room dimensions, or evaluated set bounds outdoors.
- Factors are absolute: 2× then 1× restores original size instead of compounding.
- The changed dimensions are baked into the saved recipe and RGB/depth guides.

The broad range is 0.25–4×, narrowed by each scene's position, primitive, room
and source-clearance limits. Very small architecture can become smaller than
a person: the fixed reference does not promise clearance or unchanged framing
at every size. Sizing applies to authored **Stage** scenes; Playground and Neuro
keep their existing environment controls.

## Hear the spaces

Open **Loop → Audio → Music controls → Room sound · CPU**. Scrubbing shows the
active space, metre dimensions, volume and **estimated RT60**.

1. Use test impulses, load a dry sound file, or explicitly copy the control track.
2. Keep **Follow scene timeline** to change the response with the camera.
   **Hold first-frame room** is a comparison; the descent starts outdoors, so
   that comparison stays dry.
3. Set wet/dry gains and choose an extended decay tail or trimmed ending.
4. Choose **Prepare room sound**, then **Preview room sound with scene**.
5. Download the WAV and receipt. Add the WAV in Editor for the final video;
   guide capture keeps its existing dry control-audio companion.

The acoustic source is independent of the music driving motion. Wet audio never
feeds back into the control envelopes. A scene, source or mix change invalidates
the prepared result. Extended-tail preview holds the final picture for the decay.

This is a CPU **shoebox estimate** from explicit dimensions and absorption.
Open shafts and doors use a leakage/absorption proxy. It does not measure a real
room, model vault scattering or solve sound exchange between rooms. Decorative
blocks never silently become acoustic walls. See the [zone contract, sampling
and limits](world-builder-acoustic-zones.md).

## Save and continue

**Save scene** keeps the complete journey, camera, character path, size and
zones. A–D slots freeze individual views. Compatible fixed-zone views can use
Direct movement; incompatible zone layouts need a separate scene variant.
See [loop compatibility](world-builder-loops.md#what-a-slot-can-contain).

Changing duration retimes unchanged scene, camera and character events together.
Takes keep the [24 fps, 8k + 1 grid](world-builder-motion.md#thirty-second-local-takes-and-the-ltx-frame-grid)
through 721 frames. RGB/depth share the same samples. Rendering with
Layout-to-Render IC-LoRA or experimental AKUSPACE conditioning remains a separate
workflow; local guides do not establish generated-video motion adherence or
native dynamic acoustic-node support.

## Verification

Story tests check every original descent frame for downward camera continuity,
Follow-view subject visibility, camera/body clearance, stable IDs and isolated audio response.
Scaling tests cover geometry, camera/path positions, room/opening-area scaling,
revision guards and fixed human height. Retiming keeps landing events aligned.

The [zone verification](world-builder-acoustic-zones.md#verification) runs the
browser's actual offline audio engine against a known convolution fixture and
both stories. It checks outdoor dry output, exact boundaries, finite PCM, stereo
isolation and retained tails. No model request is part of these checks.

The [WebGL capture report](media/world-stories-report.json) records all 385
frames of both descent views and all 193 avenue frames, with matching RGB/depth
samples when re-sought in reverse. It uses the actual mannequin rig and clips;
the schematic geometry fallback is a separate preview. The captured soundtrack
is an original dry test beat analysed into frequency bands. Room convolution
is verified separately and is not applied to these MP4s.

- [First-person descent](media/world-story-descent.mp4) and
  [contact sheet](media/world-story-descent-contact.png).
- [Follow the mannequin](media/world-story-descent-follow.mp4) and
  [contact sheet](media/world-story-descent-follow-contact.png).
- [Bass avenue](media/world-story-avenue.mp4) and
  [contact sheet](media/world-story-avenue-contact.png).

To repeat the local evidence, run `node scripts/check-world-stories.mjs` with
Chrome and FFmpeg installed. `DIRECTOR_BROWSER_PATH` can select a local Chrome
executable. `node scripts/check-world-room-audio.mjs` repeats the separate CPU
audio oracle. Neither script submits a model generation.
