---
tags: [3d, camera, studio]
summary: The 3D section's camera panel, with ten camera plates, the curve and combo layers, starter gestures, the radar and a playblast saved to the Director with its camera path.
---

# 3D camera: plates, radar and playblast

The first part of #18's **Holodeck camera panel** and **Scenes built by the
agent**, under the owner's decisions of 21 October: ship ten camera plates and
a few gestures, add the radar, render the playblast. There is no Three.js
timeline, and no recording yet. Adding a plate or a gesture later is a data
entry that an agent command will write.

The default **3D** section opens the single [Builder workspace](world-builder-interface.md).
For these advanced plates, choose **Ninja** and enable **3D camera viewer** plus
**3D camera controls**. Their scene is separate from the Builder recipe. Once opened, it stays mounted, as World
Builder does: removing it from a Ninja layout hides it and keeps its scene,
plate, gestures, rig and download links. If WebGL is unavailable or its
context is lost, a message takes the canvas's place in the frame. Code lives in `src/scene3d/`. The
portable playblast rules are in `shared/camera-path-playblast.ts`.

## How it works

1. **Scene.** Pick **Set** (ground, a hero object on a plinth, pillars for
   parallax, and lights) or **Acoustic room** (the AKUSPACE medium room from
   Acoustic Space, built with its own `buildRoom`). Scenes are data
   (`scenes.ts`): a subject point, a scale for Holodeck's offsets, and a list
   of primitives. **Load scene** opens an agent-built or saved scene file
   (refused with its reason if it does not parse) and **Save scene**
   downloads the current one; see [Scene builder](scene-builder.md).
2. **Plate.** Pick one of ten plates. Without reduced motion it plays once;
   **Play** and the time slider replay or scrub it. Picking a plate during
   playback starts a new playback from the beginning (`plate-clock.ts`).
3. **Curve and combo.** Pick one of Holodeck's six curves. On a combo plate,
   **Amount** and **Morph** shape how the layers add up. A preset plays its
   move at full strength, as Holodeck's single move does.
4. **Gestures.** Toggle any of the starter gestures over the plate.
5. **Room acoustics.** A collapsed readout of the scene's estimated decay
   per band, critical distance, pre-delay and nearest AKUSPACE preset. Text
   only; it changes no audio. A scene without walls has none.
6. **Playblast.** Choose a length and size, then **Render playblast**. The
   clip is added to the Director on its own track at frame 0, and download
   links appear for the MP4 and its camera path JSON.

## The ten plates

Presets play one Holodeck move from an opening framing. Combos stack moves as
additive layers, each starting from the framing at the moment it begins,
which is where Holodeck took its snapshot when a combo key was pressed.

| #   | Plate             | Kind   | Opens on | Layers (start–end of the clip)   |
| --- | ----------------- | ------ | -------- | -------------------------------- |
| 1   | Push in           | preset | Pull     | Push                             |
| 2   | Pull out          | preset | Face     | Pull                             |
| 3   | Quarter orbit     | preset | Face     | Orbit 90°                        |
| 4   | Half orbit        | preset | Face     | Orbit 180°                       |
| 5   | Wide orbit        | preset | Pull     | Wide orbit (−180°, radius 23)    |
| 6   | Crane up          | preset | Low      | Crane                            |
| 7   | Over the shoulder | preset | Side FX  | Shoulder                         |
| 8   | Push and orbit    | combo  | Face     | Orbit 60° (0–1), Push (0.25–1)   |
| 9   | Spiral rise       | combo  | Face     | Orbit 120° (0–1), Crane (0.35–1) |
| 10  | Orbit reveal      | combo  | Push     | Pull (0–0.7), Orbit 90° (0.3–1)  |

The tests check every plate on both scenes, with and without every camera
gesture: each is a valid shared camera path, stays above the floor and stays
clear of the hero object.

## Gestures

| Gesture     | Moves  | What it does                      |
| ----------- | ------ | --------------------------------- |
| Tilt up     | camera | Look point rises 1.4 units        |
| Rise        | camera | Camera rises 2.5 units            |
| Dutch angle | camera | Rolls 8°                          |
| Slow zoom   | camera | Field of view narrows by a fifth  |
| Turntable   | object | Hero turns 120°                   |
| Float       | object | Hero lifts 0.35 units and settles |

Distances are in Holodeck units, multiplied by the scene's scale. "A push in
with a tilt" is Push in with Tilt up; "an orbit with a rise" is Quarter orbit
with Rise. Camera gestures change the camera path. Object gestures move the
hero and are named in the receipt.

## The radar

The radar is redrawn from Holodeck's `CameraMotionView`. It has the same two
panes (top path and side altitude) and the same grid, swept wedge, markers and
NOW / END labels. It differs from Holodeck in three ways:

- It plots the plate's whole sampled path, solid up to now and dashed after.
- It fits its range to the path.
- It takes its colours from the theme: `--intel` for the path, `--camera-shot`
  for the end, `--accent` for the subject, and each combo layer's end point in
  a layer colour that fades with its weight.

Its background is painted into the canvas, so the pane does not change while
nothing moves. A pane narrower or shorter than 48 px draws only that
background until it has room.

The panel collapses to one column based on its own width (a container query
at 880 px), not the viewport's. A narrow Ninja column at a desktop width
therefore stacks the view above the controls, instead of squeezing the view
beside them.

## Playblast

- **Frame grid:** the World Builder's grid, 8k+1 frames at 24 fps. The 5 s
  default is 121 frames. Lengths are LTX's offered durations up to 10 s (241
  frames): 2, 3, 4, 5, 6, 8 and 10 s.
- **Sizes:** 1280 × 704 (draft) or 1920 × 1088 (the guide size noted on #18).
- **Rendering:** frame `i` comes from the plate's pure pose at
  `i / (frames − 1)`, drawn by a separate capture renderer, so the preview
  keeps its size and no wall clock enters the clip. The capture renders its
  own snapshot of the scene (a loaded one too), with theme colours resolved when the render
  starts (`snapshotScene`). Changing the scene or theme mid-render does not
  reach the clip, which keeps matching its receipt.
- **Cancel:** the signal is checked after every frame, after the MP4 is
  finalised, before the clip is handed to the Director, and inside the import
  just before it commits. A cancel at any of those points adds nothing.
- **Encoding:** mediabunny over WebCodecs, as the Director's MP4 export. It
  uses H.264, falling back to VP9 or AV1 in MP4 where H.264 is missing. The
  Director imports MP4 only, so a WebM would not reach the timeline.
- **Receipt:** written into the MP4's comment tag as `genobi.playblast` v1.
  It holds the scene, plate, gestures, curve, fps, frames, size, and the
  camera path in the shared format with one key per frame. It is validated
  and bounded by `shared/camera-path-playblast.ts`, so it travels with the
  asset into the project ZIP.
- **Into the Director:** through the Director's own `addMedia` and the studio
  store's commit guard, as production media named "Playblast · _plate_".

Nothing sends the playblast to a model yet. Layout to Render is the next step
of #18.

## Ported from Holodeck

All of it is the owner's own MIT code (Glitch Candies Studio). The notice is
kept in `src/world-builder/Holodeck-LICENSE.txt`.

| Holodeck file                                                    | Here                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `components/ui/camera-moves.ts`                                  | Reused as is, through the World Builder's existing copy                      |
| `camera/camera-combo.ts` (curves)                                | Reused through `shared/camera-ease.ts`                                       |
| `components/ui/CameraControls.tsx` (move, combo)                 | `combo.ts`: the single-move and combo-layer maths, as pure functions of time |
| `components/ui/CameraCurvePicker.tsx`                            | `CurvePicker.tsx`: same curves and preview; buttons instead of a drop-down   |
| `components/ui/CameraComboLayerStack.tsx`, panel                 | `LayerStack.tsx`: same rows, empty slots, amount and morph                   |
| `components/ui/camera-motion-drawing.ts`, `CameraMotionView.tsx` | `radar-drawing.ts`, `Radar.tsx`: themed and fitted to the path               |

These were not ported: `CameraComboTimeline.tsx` (the timeline, by decision),
hotkeys and their assignment, `camera-progress.ts` (a per-frame bus that pure
sampling does not need), and `CameraOpsPanel.tsx`'s window chrome.

## Left for later

- **Recording a move.** The door is open: a recorded move is
  `cameraPathFromSamples` over captured poses, the same shape a plate
  produces.
- **Layout to Render** from the playblast, the first-frame still, Alpha Gen,
  and the HDR export.
- **Agent commands** that add plates and gestures. Scenes have theirs:
  `genobi_scene` ([Scene builder](scene-builder.md)).
- **Audio-reactive builds.**
- **A portrait (9:16) playblast.**

## Checking it

`npm test` covers:

- the ten plates, combo offsets, curves and gestures
  (`tests/scene3d-plates.test.ts`);
- the receipt round trip (`tests/camera-path-playblast.test.ts`);
- scene parsing, Load scene's refusal and the acoustics readout
  (`tests/scene.test.ts`, `tests/scene-acoustics.test.ts`,
  `tests/scene-mcp.test.tsx`);
- the capture snapshot's isolation, the playback clock and cancellation
  (`tests/scene3d-review.test.ts`);
- the hand-off into the Director with a real MP4, including a cancel during
  the import (`tests/scene3d-director.test.ts`). The browser check needs a local Vite
  server and Chrome:

```sh
STUDIO_URL=http://127.0.0.1:4317 node scripts/check-3d-tab.mjs
```

It runs these steps:

1. Opens the section and picks plates.
2. Checks that both radar panes draw and redraw.
3. Picks a plate during playback and checks that it restarts from zero.
4. Renders a 2 s playblast.
5. Reads the MP4 back: its frame count, size and receipt.
6. Renders the same clip again, switching scene and theme from frame 5. The
   encoded frames and the receipt must match the first clip.
7. Cancels a render, then finds exactly the two saved tracks in the Editor.
8. Checks that the shell toolbar, the World Builder panel, the asset shelves
   and Camera's toolbar and gallery did not move.
9. In Ninja, removes 3D camera from the layout and adds it back; its scene,
   plate and gestures are kept.
10. At 1150 px in Ninja, with 3D camera four columns wide, checks the panel
    is one column with drawable radar panes and no page errors.
11. Forces a WebGL context loss; the message replaces the canvas and the frame
    keeps its size.
12. With World Builder ready in Shot mode, presses Space on a focused plate
    and on Play. Each activates, and World Builder does not start playing.
    With nothing focused, Space still plays the World Builder take.
13. At 390 px with reduced motion, checks a still frame, a drawn radar, no
    canvas moving and no overflow.
14. At 1280, 768 and 320 px, picks all ten plates and checks that the shell
    does not move and nothing overflows.

Every API route is a fixture, and no request leaves the browser.
