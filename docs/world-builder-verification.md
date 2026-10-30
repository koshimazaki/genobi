---
tags: [3d, world-builder, verification]
summary: World Builder verification from 16 and 17 October 2026, with working paths, automated checks and what is still to verify.
---

# World Builder verification — 16 October 2026

## Working paths

- Director opens World Builder; a captured Monument frame and its direction
  arrive in the existing Edit composer without submitting generation.
- Stage capture independently decodes as 1280×704, 24 fps, 97 frames,
  4.041666 seconds. SHA-256 matches its exported receipt.
- Neuro responds to loaded audio with camera orbit and shader time held at zero.
  Preview frames 0 and 6 differ with the synthetic pulse's amplitude.
- Cancellation restores controls. Scene/shader switching, camera scrubbing,
  audio upload and recipe application were exercised in the browser.
- Standalone bundle runs inside an isolated local ComfyUI 0.16.4 instance with
  frontend 1.41.20, CPU mode, only this custom node enabled, and temporary data.
- The live Capture node uploaded a 512×320, 9-frame, 24 fps take. A graph with
  Capture, SaveImage and Inputs completed and returned video/audio to the
  scene's screen. This is a real media round trip without any model nodes.
- A second take used Neuro and a synthetic soundtrack. Its WebM has 9 frames
  and duration 0.375 s. Its PCM WAV has 18,000 samples at 48 kHz, also 0.375 s.
- Native Comfy `CreateVideo` → `SaveVideo` combined these into H.264/AAC MP4:
  512×320, 24 fps, 9 video frames; both tracks last 0.375 s.

[Example model-free round-trip graph](https://github.com/koshimazaki/Genobi/blob/main/custom_nodes/director_world_builder/examples/capture-round-trip.json)
imports as API workflow JSON. Capture first to populate its file widgets.

## Automated checks

- Existing baseline: 238 tests passed before source changes.
- New tests cover preset isolation, schema limits, camera endpoints, frame-grid
  audio analysis, PCM duration/padding and bounded long-audio envelopes.
- Four Python tests use real torch tensors, Pillow, FFmpeg and FFprobe. They
  verify PNG/silence, audio-video round trip, content-hash invalidation, traversal
  and symlink rejection, memory limits and recipe/frame-count mismatch.
- Formatting, lint, TypeScript, all unit tests, Pages/Worker build and standalone
  bundle checks pass. Lint retains three existing warnings outside this change.
- Agent skill validation passes. No model weights were downloaded, no model
  inference or paid API generation was run, and no deployment was performed.

The test Comfy checkout emits an unrelated NumPy/ONNX import warning for an
optional built-in node; the World Builder nodes import and execute successfully.

## Still to verify

A fresh native Klein → LTX Layout-to-Render run using this extraction's exports;
Cloud deployment and media-upload integration; other Comfy frontend versions;
full project/job JSON persistence; and a selected open-checkpoint agent harness.
The browser API and skill are ready for orchestration but do not themselves
supply an LLM. RGB guidance and audio are supported; training is not.

## Playground, avatar and viewport editing follow-up

The original frozen Holodeck EC Playground geometry, vehicles and existing
animated ECCTRL mannequin are reused. Draco decoding and assets load locally in
both the Director page and the standalone Comfy frontend bundle.

Verified in the browser:

- World-only and avatar presets load; the character visibility toggle works.
- WASD walking moves the mannequin and third-person camera; returning to Shot
  camera preserves its changed position and heading in recipe JSON.
- Dragging an original vehicle's move handle stores the new layout override.
  Stage primitives also move and resize; new boxes can be added and selected.
  Rotation handles are available around Y. Free viewport framing saves back to
  the shot's camera parameters through Use view as shot.
- Capture controls are disabled in Build / edit and Walk modes; shot mode renders
  without the editor gizmos. The mannequin has deterministic idle animation in
  captures; live keyboard motion is not recorded.
- With-avatar and world-only WebM exports each decode as 512×320, 24 fps, 9 frames,
  0.375 seconds. The avatar take's SHA-256 matches its receipt.
- The standalone bundle served by local Comfy loads Playground and mannequin,
  with working mode controls, independently of the Director server.

The full suite now passes 249 tests in 30 files, including bounded walking,
static floor/wall collision, layout validation, old recipe compatibility and
camera target offsets. Formatting, lint, TypeScript, Pages/Worker and standalone
build checks pass; three existing lint warnings and the Three.js chunk-size
warning remain. No paid model run, deployment, push or PR was performed.

Static collisions are an exploration aid. Dynamic props, jumping, walking-path
recording, arbitrary imported worlds and editing the fixed base terrain remain
outside this slice. Save recipe JSON to retain edits across reloads.

## Interface and primitive authoring (17 October 2026)

[The interface pass](world-builder-interface.md) records the full 18-item brief.
The final checkout passes 261 tests across 32 files, four real-media Python tests,
formatting, lint and type checks, Pages/Worker build and standalone frontend build.
The three existing lint warnings and Three.js chunk warning remain.

Browser checks verified actual position, rotation and nonuniform-size gizmo drags,
active tool highlighting, independent front-image/back-video assignments, camera
panel folding/repositioning, audio-band routing/scopes, and textured fixed-frame
capture. The 512×320 / 24 fps / 9-frame WebM and matching 18,000-sample / 48 kHz WAV
match their receipt hashes. The source PNG hash also matches; decoded frame eight
shows changed video-texture pixels and audio-driven wall height.

The production standalone bundle loads its own fonts, decoder and scene assets
from a separate local static server, with no Director backend. Its camera preset
and original motion radar work without browser console errors. Phone-width layout
has no horizontal overflow; the temporary viewport override was reset. No paid
model generation, weights download, deployment or remote Git write occurred.
