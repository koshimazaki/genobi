---
tags: [3d, world-builder, sound]
summary: Browser CPU room sound follows the evaluated scene timeline, with retained convolution history and an explicit decay-tail policy.
---

# Room sound along the scene timeline

World Builder's motion scenes can render sound locally from the same evaluated
room that drives their guide geometry. This is a **geometry-based CPU single-room
approximation**. It runs in the browser without a provider key, ComfyUI or a
generation GPU. It is separate from the existing browser/server preset-convolution
route, the native World Builder Reverb node and AKUSPACE generation.

## Three audio roles

| Role                   | What it changes                                                               |
| ---------------------- | ----------------------------------------------------------------------------- |
| Control audio          | Its saved level/low/mid/high envelopes move the scene and its acoustic room.  |
| Dry room source        | The sound emitted inside the room; this is the input to CPU convolution.      |
| Independent soundtrack | A separate track added during editing; it does not change the room or motion. |

The dry source is a separate input. Rendering room sound never replaces the
scene's control envelopes with its wet output. Changing the dry source or wet/dry
mix therefore does not change the visual guide. Changing control audio requires
a new schedule because its mappings can change geometry.

## One explicit room

`recipe.motion.room` records one enclosure: width/height/depth in metres,
six surface-absorption values, source and listener positions, and an IR seed.
Source/listener coordinates are local to the room: x/z are centred, y starts
at the floor. They must stay inside the room. The evaluator bounds audio-driven
compression and carries both points into the valid interior.

The apartment preset uses its enclosing room for picture and sound. Its cutaway
hides the south wall and ceiling from the guide while retaining all six acoustic
surfaces. The cathedral/street study uses an explicit single-room proxy. Its
chambers and street do not imply coupled rooms or outdoor propagation. Fruit and
voxel-only presets have no default acoustic enclosure; they must not silently
become the bounding box of their decorative geometry.

## Reproducible schedule

`buildAcousticSchedule(recipe)` validates the recipe and calls the same
`evaluateScene(recipe, frame)` used by preview and capture. That evaluator applies
authored state interpolation followed by bounded audio offsets. The sound
schedule never implements a second morph or room evaluator.

The sampler evaluates **every picture frame** before selecting at most 24
acoustic snapshots. A room is classified as static only when all of those
frame evaluations agree. Regular bass pulses between the initial sampling
points therefore cannot disappear into a falsely static classification. An
explicit static treatment is different: it intentionally holds frame zero.

Authored state times have priority, followed by the default uniform samples
every 12 frames (0.5 seconds at 24 fps) when those fit the budget. The sampler
then adds the frame with the largest remaining geometry error, until the error
is at most 0.05 metres or the snapshot budget is full. Endpoints are always
retained. A caller requesting fewer snapshots than authored states can omit
interior state times; the receipt records how many were retained.

The error is the largest absolute difference in any room dimension or local
source/listener coordinate between the evaluated frame and the linearly
interpolated snapshot inputs. It is **not** an estimate of perceptual quality
or IR accuracy. The schedule's `approximation` field records the compared
frame count, tolerance, measured maximum error and its frame, retained authored
state count, and whether the budget prevented reaching the tolerance. Fast
movement can exceed this budget; the result keeps that residual visible rather
than claiming exact tracking. An explicit frame-zero hold records no full-frame
error measurement. Older explicitly constructed schedules can omit this new
evidence field; builder-created schedules always include it.

Identical room inputs use one cached response. The recorded schedule also
includes the engine/version, frame count and rate, duration, initial uniform
sample spacing, geometry and acoustic materials at each snapshot,
source/listener positions, seed, IR duration limit and interpolation method.
Copies are detached from the editor recipe before rendering. Editing the scene
after a render does not mutate its saved schedule or PCM.

## How the CPU response is made

The browser engine is `genobi-browser-shoebox-v1`:

- Sabine RT60 is calculated from room volume and the absorption-weighted area
  of its six surfaces.
- Early reflections use image sources through order three, local source and
  listener positions, 343 m/s propagation, per-surface reflection loss and
  broadband air loss. Fractional delays split across adjacent samples.
- A reproducibly seeded diffuse tail decays to the calculated RT60, with
  high frequencies damped over time. Early and late energy use a fixed mix.
- Every mono IR has unit energy. Web Audio's additional IR normalisation is
  disabled. This keeps gain predictable as geometry changes.

The IR is capped at four seconds by default (configurable from 0.1 to six).
It ends with a short fade, and metadata records when the natural decay was
limited. This is broadband absorption: it does not model diffraction, occlusion,
frequency-dependent materials, multiple enclosures or inter-room transmission.

## History, transitions and tails

Each unique IR processes the complete dry input from time zero. The renderer
linearly crossfades these continuously processed wet signals at schedule times.
It does not swap the kernel of a running convolver or restart convolution at a
state boundary. An impulse before a transition therefore still contributes
during the transition; the final response stays active after the picture ends.

For stereo, the same mono room response is applied independently to each
channel. There is no HRTF, panning model or synthetic stereo widening. The input
source is silence-padded through the tail so browser channel-count changes after
the source stops cannot collapse the stereo decay.

Choose a tail policy explicitly:

| Policy      | Output                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `extend`    | The picture-duration dry source plus the final IR's full tail. Hold the final picture when combining with video. |
| `trim-fade` | Exactly the picture duration, with the final 50 ms deliberately faded to zero.                                   |

The dry source starts at picture time zero. A short input is padded with silence;
a long input is trimmed to the picture duration before convolution. Wet/dry
gains are independent and recorded. If the mix would exceed a peak of 0.98,
one gain scales the complete result, and that gain is recorded. The output is
16-bit PCM WAV plus floating-point PCM and schedule metadata.

This is a sampled, smoothly crossfaded room response, not a physical simulation
of sound travelling through moving walls. A decay from the earlier room blends
into the response of the new room. It retains input history without claiming
that every emitted reflection follows an exact moving-wall trajectory.

## Bounds and cancellation

The scene duration is the existing 9–241 frame grid at 24 fps. Sampling checks
at most 241 frame geometries, while convolution remains limited to 24 scheduled
snapshots and at most six seconds per IR. Room audio accepts mono/stereo PCM
from 8–96 kHz. Input samples must be finite and their absolute amplitude must
not exceed 1,000,000. This is a corruption/overflow safety cap, not clipping or
loudness normalisation; ordinary unclipped float audio above ±1 remains valid.
Non-finite convolver output or accumulated mixes fail before normalisation or
WAV export, rather than publishing NaN samples.

Each offline convolution finishes before the next starts, with progress and
cancellation checks between them. Cancellation during an active browser
convolution takes effect when that convolution returns; no partial result is
published.

No browser render uploads the source or submits a paid workflow. Sound-only
WAV rendering does not yet provide a managed ProjectRun revision or an MP4
stream-copy remux. Add the resulting sound in Editor and choose the matching
picture/tail treatment. The complete capture dependency/fingerprint contract
remains separate work under issue #11.

## How to repeat and verify

1. Open World Builder, then **Scene motion**, and choose **Apartment / loft**
   or **Cathedral / street**. Inspect its three states. Load the control track
   and set its level/low/mid/high mappings before rendering room sound.
2. Open **Sound**, then **Room sound · CPU**. Choose or drop an independent dry
   audio file, press **Use test impulses**, or explicitly opt in with **Use
   control track as dry source**. The last choice copies the track; it never
   replaces the original control audio or analyses the wet result for motion.
3. In **Room materials and positions**, edit the source and listener for the
   selected state, and the room's six surface absorptions and response seed.
   These are inputs to the same evaluator that preview and capture use.
4. Choose **Follow scene timeline** or **Hold first-frame room**, set independent
   wet and dry gains, and choose **Extend and hold picture** or **Trim with
   50 ms fade**. Press **Render room sound**. Progress counts completed room
   responses; **Cancel room render** discards pending work.
5. Press **Preview room sound with scene**. The rendered audio supplies the
   playback clock through the normal scene transport. An extended tail holds
   the final picture, then stops; it does not loop. **Stop preview** or the
   normal transport ends playback, and capture uses the existing stop/settle
   guard. The control track remains separate and paused during this preview.
6. Use **Download room WAV** and **Download sound receipt**. The JSON receipt
   includes the frozen recipe, evaluator and recipe digest, full acoustic
   schedule, source and fitted-PCM hashes, engine, audio roles, gains, tail
   policy, impulse-response limits and output WAV digest. Add the WAV in
   Editor for a final video and retain the matching picture/tail policy.

Editing the scene, dry source or mix invalidates the previous result and stops
its preview. A render started with old inputs is discarded even when it finishes
after those edits. Render again to hear the new scene. The test source includes
a late impulse for checking the decay; comparing static and moving treatments
with that same source isolates the room's change.

Automated checks:

```sh
npm test -- tests/world-dynamic-room-audio.test.ts tests/world-room-sampling-safety.test.ts
npm test -- tests/world-room-sound-controls.test.tsx tests/world-room-sound-receipt.test.ts tests/world-room-sound-playback.test.tsx
node scripts/check-world-room-audio.mjs
```

The browser check needs an installed Playwright Chromium, or set
`DIRECTOR_BROWSER_PATH` to a local Chromium executable. It blocks all network
requests and compares real `OfflineAudioContext` output against exact synthetic
impulses, including a transition and the final stereo tail. The unit fixtures
also exercise a sustained tone, static equivalence, schedule validation,
translation invariance, deterministic seeds, truncation and cancellation.
The control lifecycle fixtures check explicit control-copy, source-load races,
edits and cancellation during rendering, stale revision rejection, URL cleanup,
and guarded playback. Receipt fixtures verify recipe/source/PCM/output hashes
and detached frozen inputs; playback fixtures verify the audio clock and tail
hold without changing the control track.

These are local DSP checks. They do not establish perceptual reverb quality,
physical accuracy, a native ComfyUI run or LTX conditioning fidelity.
