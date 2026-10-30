---
tags: [3d, world-builder, studio]
summary: The World Builder interface pass, with the captured brief, panels and controls, CAD follow-ups and verification.
---

# World Builder interface pass

The studio's **3D** section opens one Builder viewport. Scene presets and a
character menu (None, Neutral mannequin, Dog, Creature and Blob) sit above it; Shot, Build and Walk share
one recipe. Camera, Sound, Scene and Capture dock in the inspector column (two
at most; see [Panels](world-builder-controls.md#panels-two-docked-one-popped-out)). It
sits beside the viewport on desktop and below it at narrow widths, without
covering the shot. Escape and Close return focus to the launcher. Controls keep
their drafts and audio element when switching inspectors.

The builder uses the studio's wordmark, theme, type, colour tokens and compact
controls. The viewport tool rail keeps Move, Rotate, Size, Add and Object; Add
opens the primitives chooser as a small panel beside the rail. Scene
contains character placement, lighting, objects and **Recipe & agent controls**
for JSON inspection, save/load and the existing browser API.

Small room, Acoustic room, Club and Cathedral are editable open-front, open-top
sets. Acoustic room and Club keep Acoustic Space's display dimensions; all four
read their sizes and wall materials from the Comfy node's `acoustics.json`.
Each wall's prompt names its material for the Comfy Acoustics node; the
Builder itself does not configure AKUSPACE or connect sound generation. Playground, Playground
avatar, Studio, Monument, Projection and Neuro remain available. Choosing a scene
preset replaces the set; camera presets, inspector changes and studio navigation
preserve it. Save recipe before reloading and reattach its local media.

For the separate advanced plate renderer, choose **Ninja**, then enable **3D camera
viewer** and **3D camera controls**. These retain the existing scene JSON and agent
scene contract, combos, curves, gestures, radar, room acoustics and MP4 playblast.
They do not edit the Builder recipe. The default 3D workspace does not mount that
renderer. Richer scene examples and the mixed-cast scene document remain separate
work; Builder has one selected character at its saved avatar placement.

**Dog · Pug** reuses the Three.js/Quaternius CC0 dog and its authored idle, walk,
slow walk and jump clips. **Our creature · VRM** imports the original local model,
preserves MToon materials and retargets the bundled humanoid clips. Under Scene,
**Creature model & motion** accepts the VRM, a named FBX motion pack or one FBX
assigned to a slot. Walk, Ninja Idle, Backflip and jump files were checked locally;
no separate twist file was found. Run, fly, backflip, jump, ninja and twist require
an attached FBX. Files remain in the tab; recipe and receipt carry bounded
fingerprints, never model/motion bytes. Missing model or recorded motion blocks
capture with a reattach error. Owner files are not redistributed.

**Blob · theme colour** is an original rounded procedural stand-in, grey or blue
according to the studio theme. All four character choices use the same capsule
controller in Walk, with jump/run shortcuts. Changing back to Shot saves position.
Use **Record live** to capture walking and camera movement together; see [Live World sessions](world-live.md). For deterministic capture, choose **Character
motion** under Scene, then Play/Loop the take; the saved clip is sampled by frame.
**Frame character** under Camera fits the selected character. Blob tint is held
stable during capture and recorded in its receipt.

Capture keeps framing options in the inspector and a primary action in the bar,
with the capture length (seconds and frames, − and +) beside it. **Capture
take** works in Shot, Build and Walk. From Build or Walk the viewport you are
looking through (a Build orbit, or Walk's follow, orbit or shot camera) is
frozen into the recipe as the shot camera, a walk's position is saved, the
mode returns to Shot and the take replays that camera with the recipe's orbit,
dolly or crane; nothing of the live walk is recorded (that is **Record live**).
**Move seconds**, under Camera and under Capture, sets the move's duration and
the frames follow it; the **360** orbit shot at 10 s is one full turn in one
241-frame take. Framing, Save PNG and Send first frame stay in Shot. While a take
runs, framing settings are locked; Cancel stays available in both places. A
finished take joins the project's assets as an MP4 under Project, and the
Capture panel names it ([outputs into project assets](project-assets.md)).
PNG, silent WebM, matching WAV and receipt downloads retain the existing frame
grid and media checks. No navigation or capture submits generation.

## Layout, 29 October 2026

The owner reviewed the page at 2000 px and asked for six layout changes. None
changes what a control does.

- **The docked column runs full height.** It starts at the viewport's top and
  ends at the workspace's foot, and scrolls inside itself, so Signal scopes,
  Spectrogram, Spectrum and the whole Mod matrix are reachable without black
  space below them. The column is `clamp(320px, 22vw, 440px)` wide: 320 px at
  1440, 440 px at 2000, where the Mod matrix rows get the extra width. Size
  containment (`contain: size` in `workspace.css`) keeps the panels' content
  from growing the rows.
- **The console sits in the left column.** Panel launchers, the take-length
  stepper and **Capture take** are under the viewport, not under the docked
  column. With no panel docked, the console spans the full width as before.
- **Taller scopes.** Band meters are 120 px, the spectrogram 112 px and the
  spectrum 72 px, so the dynamics read.
- **Primitives beside Add.** Add on the tool rail opens a small Primitives
  panel next to the rail (`PrimitivePicker.tsx`) rather than a docked panel on
  the far side. It stays open while shapes are placed. Add, its close button,
  Escape (wherever focus is, including the Object panel after a placement) or a
  press outside the picker and Add closes it, and so does leaving Build. The
  `add` dock panel is gone.
- **A thinner bar.** The title, then the "Build a set / Capture scene
  guidance." line in a smaller size, then Load preset and Character, all on one
  49 px row (it was about 101 px). The viewport gains the space: in the studio
  the view height is `min(60dvh, 560px)`, up from `min(56dvh, 520px)`. Below
  900 px the bar wraps as before.
- **The Comfy node bundle matches.** `npm run build:scene-adapter` builds the
  same component; the bar sets its own flex, as the bundle carries no studio
  stylesheet. The bundle keeps what it already hides.

Panel hints (`.wb-hint`) now take their intended 11 px size; the shorthand they
used was invalid, so they fell back to the body size.

Before and after at 1440 px and 390 px, the studio, `/scene-adapter` and the
bundle served by a local ComfyUI were compared with Playwright on 29 October
2026; the screenshots stay outside the repository.

## Captured brief, 17 October 2026

1. Match the FLUX / Editor / Director interface: shared studio styles and components.
2. Correct transform switching and show the active tool: Move, Rotate and Size.
3. Provide a real Size gizmo, rather than a single uniform-size field.
4. Reuse Holodeck camera controls: original shot vocabulary and grouped shot tiles.
5. Reuse the camera motion view: original radar drawing, fed by actual capture poses.
6. Reuse compact capture presentation, with aspect/resolution and timing disclosure.
7. Bring over audio control presentation and reactivity, with signal scopes and routing.
8. Make panels movable, including camera and audio, using Holodeck's existing hook.
9. Keep advanced settings folded and panels closed initially.
10. Put the large build controls into a small viewport tool rail.
11. Provide simple primitive building blocks: cube, sphere, cylinder, cone, wall,
    ring, pyramid and polyhedron, reusing Holodeck's primitive vocabulary.
12. Keep agents able to compose the scene using the same validated recipe as the UI.
13. Support normal object resizing and independent X/Y/Z stretching.
14. Persist full rotation and dimension edits so blocks can form larger structures.
15. Continue exporting the authored scene as image/video guidance.
16. Record CAD-to-scene and a CAD skill as a candidate extension, not an implemented tool.
17. Record vector geometry as a candidate extension; retain a simple primitive-first UI.
18. Assign image/video textures to selected walls/objects and choose individual cube faces.

## Implemented behavior

- W / E / R select Move / Rotate / Size when the canvas is focused in Build mode.
  The inspector exposes position, rotation and axis sizes. Legacy uniform-scale
  recipes still load. Size controls describe axis multipliers; cube axes correspond
  to its unit geometry. Other shapes keep their original proportions at one.
- Original Playground props and newly added primitives use the same transform tools.
  The base floor and upper disk remain fixed. Cubes support six independently
  assigned faces; walls and other props use a whole-surface texture.
- Texture blobs stay local to the tab. Recipe JSON stores assignments and names,
  not local paths, remote URLs or media bytes. Missing attachments block capture
  with an explicit reattach message. Eight slots, 64 MB/file and 128 MB total bound
  the local media library. Video slots seek to each fixed capture timestamp.
- Audio offers level / low / mid / high signals, a selected primitive or all
  primitives, scale / height / light, gain, gate and inversion. Band analysis is
  offline and frame-indexed; signal scopes read the same samples. This is one
  active routing row, not Holodeck's complete multi-route engine or timeline.
  The Sound tab works in Shot, Build and Walk, takes a track dropped on the
  scene, and lists recent audio (this browser's tracks and the project's audio
  assets); see [World Builder sound](world-builder-sound.md).
- Camera includes a direct move menu, Holodeck's static/orbit/follow shot groups
  and the original radar drawing. Shots are adapted to this fixed-frame renderer.
  Push/pull and crane have deterministic paths; tracking frames the saved subject
  position. Live walking, combos, hotkey assignment and dynamic follow replay are
  not part of the capture engine. Linear and Cubic S curves are available.
  Orbit reaches ±360° per take (the **360** tile), and each move takes
  `seconds`, from which the frame count follows.
- Capture keeps 24 fps, divisible-by-64 dimensions and 8k+1 frames. The optional
  WAV accompanies the silent WebM. The standalone Comfy build includes fonts,
  assets, decoder and the same interface.
- Inside the Comfy node (29 October, the owner's review of the node): no
  **Connect agents** button, pairing code or **Send to Genobi**, since the agent
  reaches the node through the graph; the Sound tab's list is titled **Graph
  audio outputs** and tags SaveAudio, PreviewAudio and Inputs audio as Graph
  output, with no project audio; the Load preset menu leaves out the Neuro
  shader. The studio page keeps all three.
- The example track, Koshi Mosaic · Dimensions (its first minute as a 961 KB
  MP3), is shown as the
  track on open in the page and the node, and decoded and played on the first
  Play press, in any mode ([World Builder sound](world-builder-sound.md#the-example-track)).
- The Genobi footer deck (z-index 65) opens in front of the docked panels (50,
  60 while focused) and stays below the anchored popovers (120).

## CAD and vector follow-ups

A practical next boundary is an explicit mesh import/export adapter: CAD or vector
skills create an approved asset; the builder imports it for framing and guidance.
Do not label primitive stretching as CAD, advertise editable B-rep geometry, or
show inactive CAD/vector buttons. Check ownership, coordinate scale, materials,
triangulation and bounded import size before adding that route.

## Verification

Earlier browser checks cover active-tool switching, actual move/rotate/axis-size
drags, independent face assignments, audio-band scopes and a frame-indexed textured
take. The exported 512×320 take has 9 frames at 24 fps
(0.375 s); its PNG, WebM and 48 kHz / 18,000-sample WAV match their receipt hashes.
The video texture changes between captured frames; audio-driven wall height also
changes while the camera stays fixed. Unit tests cover geometry, transforms,
texture validation, camera presets/curves, audio crossover and missing media.

Run `DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-world-workspace.mjs`
against a local Vite preview for the unified workspace regression. It blocks API
mutations and external requests, checks desktop/phone layouts, menus, object and
camera state, focus, recipe round trips and studio navigation. Desktop also checks
real landscape/portrait/square PNG/WebM exports, the matching WAV, frame-zero
hashes, format locking, cancellation and missing attachments. Output and screenshots
stay in the ignored `.local/3d-workspace/` folder. This verifies local capture;
no model generation, deployment or shared acoustic-state handoff is implied.

Run `DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-world-capture.mjs` for
the take itself. It loads the cathedral room through **Load recipe**, puts the
mannequin on its walk clip, applies **Push in** at 9 frames and clicks **Capture
take**, then decodes the WebM, first frame and depth pass with ffmpeg. It asserts
that no frame is flat or an empty-set render, that each frame differs from the
last, that the mannequin is in frame, and that a walk take differs from an idle
take over the same still camera. It uses SwiftShader, so it also runs headless.
A third take loads the cathedral at 512×320 with `orbit: 360` and
`seconds: 10`, presses **Walk**, walks forward and lets the walking camera
orbit, then clicks **Capture take**. It asserts that the mode returns to Shot,
that the receipt has 241 frames, `seconds: 10`, `orbit: 360`, the walked
position and the frozen viewport's azimuth, and that the last frame matches
the first while the 180° frame does not. On 28 October 2026 all three takes
passed locally (headless Chrome, SwiftShader, against a Vite server); the
360° take's first and last frames differed by 0.17 mean grey levels against
40.1 at the half turn.
Evidence stays in `.local/world-capture/`. The mannequin samples the recipe's
clip (Scene → Character motion) in fixed-frame capture; before 28 October 2026
it always played idle whatever the recipe said.
