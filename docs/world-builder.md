---
tags: [3d, world-builder, agents, comfy]
summary: World Builder and Scene Adapter, the set-preparation tool beside Director, its agent contract and Comfy integration.
---

# World Builder and Scene Adapter

World Builder is an optional set-preparation tool beside Director. Open it from
Director's header or at `/world-builder`. `/scene-adapter` opens the same UI and
runtime independently. The studio 3D preset opens this single Builder viewer,
with a **Load preset** menu (it replaces the whole set) and a character menu, and one Camera / Sound / Scene / Capture inspector.
The original Holodeck EC Playground is available with or without its animated
mannequin, alongside Studio, Monument, Projection, editable Acoustic room and
Club sets and the Neuro shader. Only the Playground assets are carried across; the old generation panels and full Holodeck app stay separate.

The four room presets (Small room, Acoustic room, Club, Cathedral) each add two
reactive test objects beside the character, a low-band sphere and a mid-band
cube that circle it, and the Small room names the owner's creature, falling back
to the mannequin when its file is not attached
([reactive room presets](world-builder-sound.md#reactive-room-presets)). The
Comfy node's menu leaves out the **Neuro shader**: it is a full-frame sky with
no set, character or depth to carry into a graph. It stays in the studio; its
code is MIT, from Holodeck, so nothing in its licence restricts it.

For the current interface and detailed controls, see [the interface pass](world-builder-interface.md).

## Build and explore

- **Build / edit**: click a prop or choose it in the object selector. Drag coloured
  Move, Rotate or Size handles (W / E / R), or edit all three axes in the inspector. Original ramps, vehicles,
  stairs and platforms are editable; the base floor and upper disk stay fixed.
  Add/remove box, sphere and cylinder primitives in the sidebar.
- Drag empty space to orbit, right-drag to pan and scroll to zoom. **Use view as
  shot** saves that framing, including its target, to the deterministic camera path.
- **Character** selects the mannequin, dog, local creature or theme-coloured Blob. **Walk with avatar**:
  click the canvas, use WASD/arrows, drag to look, scroll to zoom. Keyboard control
  stops when focus leaves the canvas. Static capsule collision covers the current
  scene and primitives; there is no jumping, dynamic physics or game-state replay.
- Return to **Shot camera** to save the avatar position. **Capture take** works
  from Shot, Build and Walk: from Build or Walk it first freezes the current
  viewport (after a Build orbit, or a live follow, orbit or walk) into the
  recipe as the shot camera (target, azimuth, elevation, radius; the shot is
  marked `custom`), saves a walk's position, returns to Shot and replays that
  camera with the recipe's move. The walk itself is not recorded; use **Record
  live** for that ([Live World sessions](world-live.md)). Exports replay the saved avatar placement with its selected fixed-time animation
  (the mannequin plays its recipe moves, such as jog, fall or a timed list of them, rather than always idling; see [the move library](#move-library)),
  camera path, shader and audio envelope. Editing hides audio offsets to avoid
  accidentally baking them into object transforms. Framing, Save PNG and the
  first-frame hand-off stay in Shot.
- Recipe JSON retains avatar visibility/pose, original-scene transform overrides,
  primitive transforms and shot framing. Existing recipes default to no avatar and
  an unchanged layout. Save the recipe before closing; it is not auto-persisted.

Assets and Draco decoding are bundled locally for both Director and standalone
Comfy. [Asset notices](https://github.com/koshimazaki/Genobi/blob/main/public/world-assets/NOTICE.md).

## Move library

The mannequin's moves are the clips of `public/world-assets/AnimationLibrary.glb`,
named plainly in `shared/scene/character-catalog.ts`. The mannequin is the
Holodeck/ECCTRL mannequin (MIT); its animations are Quaternius's Universal
Animation Library (CC0), as the catalogue's credit and the
[asset notices](https://github.com/koshimazaki/Genobi/blob/main/public/world-assets/NOTICE.md) say.
`tests/world-builder-moves.test.ts` reads the GLB and fails if a name points
at a clip it does not hold. The GLB also holds pistol, torch, swim, driving and
root-motion clips that are not exposed.

| Move          | Clip in `AnimationLibrary.glb` | Length (s) | Plays |
| ------------- | ------------------------------ | ---------- | ----- |
| `idle`        | `Idle_Loop`                    | 2.50       | loop  |
| `talk`        | `Idle_Talking_Loop`            | 2.93       | loop  |
| `walk`        | `Walk_Loop`                    | 1.33       | loop  |
| `interact`    | `Interact`                     | 2.00       | once  |
| `punch`       | `Punch_Jab`                    | 0.87       | once  |
| `spell`       | `Spell_Simple_Shoot`           | 0.50       | once  |
| `dance`       | `Dance_Loop`                   | 1.00       | loop  |
| `jog`         | `Jog_Fwd_Loop`                 | 0.93       | loop  |
| `sprint`      | `Sprint_Loop`                  | 0.67       | loop  |
| `jump`        | `Jump_Start`                   | 1.33       | once  |
| `jump-air`    | `Jump_Loop`                    | 2.50       | loop  |
| `land`        | `Jump_Land`                    | 1.27       | once  |
| `roll`        | `Roll`                         | 1.47       | once  |
| `fall`        | `Death01`                      | 2.40       | once  |
| `sit-down`    | `Sitting_Enter`                | 1.30       | once  |
| `sit`         | `Sitting_Idle_Loop`            | 1.67       | loop  |
| `sit-talk`    | `Sitting_Talking_Loop`         | 2.93       | loop  |
| `stand-up`    | `Sitting_Exit`                 | 1.03       | once  |
| `crouch`      | `Crouch_Idle_Loop`             | 2.93       | loop  |
| `crouch-walk` | `Crouch_Fwd_Loop`              | 2.00       | loop  |
| `walk-formal` | `Walk_Formal_Loop`             | 1.33       | loop  |
| `push`        | `Push_Loop`                    | 2.67       | loop  |
| `kneel`       | `Fixing_Kneeling`              | 5.20       | once  |
| `pick-up`     | `PickUp_Table`                 | 0.83       | once  |
| `hit`         | `Hit_Chest`                    | 0.33       | once  |
| `sword`       | `Sword_Attack`                 | 1.53       | once  |

A recipe's `avatarMotion` is one move for the whole take (the original form,
still valid, which loops) or a list of up to eight `{ clip, seconds }`
moves, each starting on the nearest whole frame of the take; the last runs to
the end. Inside a list, a move that plays once holds its last frame until the
next. The Scene panel's **Character moves** list edits it, `configure()`
accepts either form, and `shotPatch(key, recipe, subject, seconds, moves)` sets
a named shot and its moves together (use `undefined` for seconds to keep the
take's length). The pug, creature and blob keep their own clips.

Stopped in Shot camera or Build, the preview keeps playing the recipe's moves
(idle by default) in a loop over the take, so a live recording can start
straight away; only the characters' pose is redrawn. Captures still render the
fixed frame grid, and the preview pauses for Play and any capture
(`src/world-builder/useIdlePreview.ts`, `previewPose` in `runtime.ts`). Walk
keeps its own loop.

Twelve ready takes, 5 to 7 s each in a room with a named shot, are under
`custom_nodes/director_world_builder/examples/moves/`
([the move library](https://github.com/koshimazaki/Genobi/blob/main/custom_nodes/director_world_builder/examples/moves/README.md));
`scripts/capture-move-library.mjs` captures them all headless. Three fall takes
(Cathedral, Small room, Acoustic room) use the `highWide` shot, a wide lens
close above the figure looking down; the fall is `Death01` in place, with no
descent from height yet. `dance-balls` drives two spheres from the audio bands
(low → left ball scale, high → right ball height, mid → glow on both); the
recipe holds no track, so attach one before capture (`AUDIO=<file>` for the
capture script).

## Author, capture, direct, return

- Add cube, sphere, cylinder, cone, wall, ring, pyramid and polyhedron props; edit position, axis scale, colour,
  spin and per-object direction. Scene direction and object directions are
  editable intent metadata. They do not automatically invoke a model or
  transform meshes through natural language.
- Set FOV, target, azimuth, elevation, radius, orbit and dolly. These controls
  move the actual scene camera. Orbit goes to ±360° in one take, so the **360**
  shot with **Move seconds** at 10 is one full turn over 241 frames, linear in
  time by default. **Move seconds** (Camera → Lens & movement, and Capture →
  Rate & time) sets the move's duration; the take's frames follow it on
  the 8k + 1 grid, and the take length beside Capture take shows both. Director's existing camera prompt controls
  continue to describe downstream model behaviour separately.
  `recipeCameraPath` exports that move, or a preset shot, as a shared
  [camera path](camera-wording.md#camera-paths); it does not reach a
  generation request yet.
- Load audio to derive a reproducible per-frame RMS envelope and low, mid and
  high bands. The Sound tab's **Mod matrix** routes them to props, set pieces,
  the character, the Neuro shader and the lights ([audio mod matrix](world-builder-sound.md#audio-mod-matrix)).
  Preview playback starts at frame zero.
- Sound is live in Shot, Build and Walk: the Sound tab's loader, Play/Stop and
  band routing work in every mode. In Walk and Build, Play plays the track and
  moves the signal scopes; the set reacts to it in the Shot preview and the
  take. Play locks no control; see [Capture and edits during Play](world-builder-controls.md#capture-and-edits-during-play).
  Leaving the 3D tab stops playback before saving a walked position. Capture
  still freezes the track at the take, as the WAV companion.
- Drop an audio file on the scene to load it. The Sound panel's **Recent**
  menu and **Audio assets** list the last six tracks (96 MB at most) loaded
  here (picked, dropped, sent by Comfy's Inputs node or an agent's `setAudio`)
  and, in the studio, the project's own audio assets. See
  [the Sound panel](world-builder-sound.md#the-sound-panel).
- Load an image or video onto the stage's screen. Video texture capture seeks to
  each frame's timestamp, rather than recording whatever frame happens to play.
- Capture a bounded 24 fps take from the [Capture panel](world-builder-capture.md);
  its length shows in seconds and frames beside **Capture take**. In the studio the take is re-encoded to MP4 and added to
  the project's assets under Project, with its matching WAV when there is one
  ([outputs into project assets](project-assets.md)). Export first-frame PNG,
  VP8 WebM and a JSON receipt containing recipe, frame count, timestamps and
  content hashes. The optional PCM WAV companion is cropped/padded to the same
  take duration. **WebM is visual only**; mux WAV downstream for an
  audiovisual deliverable.
- In the studio, **Send first frame to Director** adds the PNG to the
  project's Inspirations, where the Director and Camera's reference tray can
  use it. Review before generating; nothing is submitted. Embedded as a scene
  adapter, it posts the PNG and scene direction to the opener instead. The
  window checks the exact opener and same origin. Keys are never
  transferred. There is no Send result to set action in the consolidated 3D
  view; load a downloaded result onto the screen as above.
- Save/load recipe JSON to reproduce settings and the audio envelope. Files on
  the screen and the soundtrack are separate inputs and must be reattached.
  Recipes do not run arbitrary code or fetch URLs.

## Seamless loops

**Seamless loop** (Camera → Lens & movement, and Capture → Rate & time)
sets the recipe's optional `loop` flag (default `false`; a recipe
without it is unchanged). With it on, the take is one period of a cycle,
T = frames / 24: the camera's progress is `frame / frames` rather than
`frame / (frames - 1)`, so the last frame stops one step short of the first
and a player looping the clip never shows the same frame twice. The orbit is
linear whatever the curve says, so its speed carries across the seam; dolly
and elevation change go out and come back. Orbit has to be a whole turn
(±360°) to meet itself; the hint says so when it is not.

Everything else that moves runs on the same T. A single character clip is
retimed to the nearest whole number of its own cycles, at least one; a move
list restarts at the seam. Retiming only meets itself for a clip that ends in
its first pose. `jump`, `land`, `roll`, `fall`, `sit-down`, `stand-up` and
`hit` do not (`fall` moves the hips 0.94 across the seam), so the hint says the
pose snaps back; `NON_CYCLIC_CLIPS` in `shared/scene/character-catalog.ts`
lists them, and a test samples the GLBs' first and last keyframes to keep it
exact. The other one-off gestures (`interact`, `punch`, `spell`, `sword`,
`pick-up`, `kneel`) return to their start pose and loop cleanly. Primitive spin rounds to whole turns, at least one.
The Neuro sky is periodic (every term of its pattern repeats when its time
advances by 4π), so its speed rounds to whole cycles, at least one; at speed 1
and 2 s that is about six times faster. Audio-driven motion and video
textures play as they are and may not meet, and the Creature's spring bones
(hair, tail, cloth) start at rest on frame 0, so they jump at the seam. Play always loops a loop recipe.

**360° loop · 2 s** sets orbit 360, Move seconds 2 and the loop: 49 frames
(2.04 s, the 8k + 1 grid's nearest), one full turn, seamless. `describe()`
reports `seamless-loop`; the Comfy Capture node accepts `loop` and refuses a
non-boolean one.

## Scene library

A **Library** strip sits under the take strip, below the viewport; opening or
closing it never resizes the scene. Its **Takes** tab holds every fixed take
and live recording of this browser, newest first, whether made with the
button, an agent's `capture()` or **Record live**: first frame, length, size
and mode, with Preview (plays the WebM in place), Load recipe, Add to assets,
Send to Director, Download and Remove. Takes are kept in IndexedDB, up to 20
takes and 500 MB, the oldest removed first; without site storage they last
for the tab. Nothing is uploaded until **Add to assets** (the take as MP4,
with its WAV, under Project) or **Send to Director** (the first frame under
Inspirations as a reference, and the take under Project, as Scrolls'
`directorUse` splits them; a paired agent's `send-to-project` runs the same
path, `send-take.ts`). Both name the files after the take, which the project
listing shows as each asset's label. Only those media files reach the project: the
receipt, with its recipe and any attached media's name, stays in the browser.
Add and Send appear in the studio only. A take enters the library the moment
its capture or recording resolves (`take-channel.ts`), not when the view next
renders, so an agent's `configure()` straight after `await capture()` cannot
drop it; each take is added once.

The **Presets** tab lists all thirteen [move library](#move-library) recipes,
bundled into the build from `examples/moves/` (an agent's `load-preset` also
takes each by its file name, `fall-cathedral`), plus **Fall · big room** (the
fall in the Cathedral, wide, a slow 50° orbit over 10 s), **Skydive · through
the rooms** (`skydive-cathedral`: a face-down descent between towers into the
Cathedral, on a [character path](world-builder-controls.md#character-path)),
and the presets
saved here with **Save current as preset** (up to 24, in this browser's local
storage, without attached media or the audio envelope). A click stops Play,
returns Build to Shot and loads the recipe, keeping the current sound; Walk
must be left first. `world-presets.ts` and `take-library.ts` hold the rules;
`tests/world-builder-library.test.ts` covers them.

## Sound

The Sound panel, the example track, the audio mod matrix and the reactive
room presets are described in [World Builder sound](world-builder-sound.md).

## Agent contract

`window.directorScene` is available once the renderer is ready:

| Method              | Effect                                                                |
| ------------------- | --------------------------------------------------------------------- |
| `describe()`        | Version, renderers, parameter ranges and supported capabilities       |
| `getRecipe()`       | Independent copy of the current recipe                                |
| `configure(recipe)` | Validate and apply scene/camera/intent/envelope data; reset preview   |
|                     | Accepts `seconds` (frames follow) or `frames` (seconds follow if set) |
| `render(frame)`     | Preview an exact frame on the take's time grid                        |
| `snapshot()`        | Capture frame zero as a PNG Blob                                      |
| `snapshotDepth()`   | Capture frame zero of the linear depth pass as a PNG Blob             |
| `setScreen(blob)`   | Attach a bounded image/video texture                                  |
| `setAudio(blob)`    | Decode audio and replace the frame-indexed envelope                   |
| `capture()`         | Return `{first, video, depth, depthFirst, manifest, name}`; no upload |
|                     | From Walk or Build, freezes the viewport as the shot camera first     |
|                     | `capture({ name })` names the take and its receipt's files            |
| `cancel()`          | Abort an active export and restore controls                           |
| `listPresets()`     | Built-in and saved preset names, with a one-line summary              |
| `loadPreset(name)`  | Load a preset (stops Play; refused in Walk); returns the recipe       |
| `listTakes()`       | This browser's library takes, newest first; names and lengths only    |
| `captureTake(name)` | The paired agent's `capture` command; refused in Walk                 |
| `sendTake(take)`    | The paired agent's `send-to-project`: the card's Send to Director     |

A primitive in `objects` takes `x`, `y`, `z`, `scale`, `spin` (rad/s, ±3),
`rotation`, `rotationX`, `rotationZ`, `scaleX`, `scaleY`, `scaleZ`, `color` and
`prompt`, and optionally a constant orbit:

| Field    | Range            | Effect                                                            |
| -------- | ---------------- | ----------------------------------------------------------------- |
| `orbit`  | -1 to 1 rad/s    | Circles a vertical axis; positive is counter-clockwise from above |
| `orbitX` | -40 to 40 metres | The axis's x, 0 (the scene centre) when left out                  |
| `orbitZ` | -40 to 40 metres | The axis's z, 0 when left out                                     |

The orbit angle is `orbit × seconds` on the take's frame grid
(`prop-orbit.ts`), so a capture replays it exactly; in a seamless loop it rounds
to whole turns, as spin does. Build edits the prop at its recipe position, and
Walk's collision uses that position too. Audio routes add to an orbiting prop
as to any other.

`setSurface(target, blob)` and `clearSurface(target)` assign image/video media to
validated targets such as `prop:wall/front`, `prop:wall/back`, `world:car-a/all`
and `screen/all`. Media must be reattached after loading a recipe.

An agent with browser scripting capability can operate this API;
an agent with only the Genobi tools uses the hand-off below to set the scene
and `genobi_world`'s `capture` command to take it; a browser
connector restricted to read-only evaluation should use the visible controls
and recipe editor. This does not install an LLM harness or expose a public RPC
endpoint. [Agent skill](https://github.com/koshimazaki/Genobi/blob/main/.agents/skills/world-builder/SKILL.md).

Dimensions are divisible by 64; frames follow `8k+1` from 9 through 241. A
recipe's `seconds` (0.375 to 241 / 24 ≈ 10.04, `null` by default) is the
move's duration: when set, `frames` is the nearest `8k+1` count to
`seconds × 24`, so `{ "orbit": 360, "seconds": 10 }` is 241 frames. Recipes
without `seconds` keep their frames. Changing `frames` alone moves a set
`seconds` with it. `describe()` reports the `seconds` range and the
`capture-any-mode`, `move-seconds` and `orbit-360` capabilities; `orbit` is
±360°. The live World commands (`genobi_world`) do not configure the recipe,
except `load-preset`; `presets` and `takes` read the scene library, `recipe`
reads the current recipe back, `capture` takes it ([Agent capture](#agent-capture))
and `send-to-project` sends a library take to the open project. PNG
still capture works without WebCodecs. Video export requires a browser with VP8
WebCodecs support and rejects encoder/frame-grid mismatches. Framebuffer pixel
ratio is one. Recipes contain at most 24 primitives and 64 KB of JSON.

A worked example: eight recipes under
`custom_nodes/director_world_builder/examples/storyboard/ninja/` become the Scrolls
**Four Rooms** board, each panel drawn from its own first frame
([3D storyboard from World Builder](scrolls.md#3d-storyboard-from-world-builder)).

## Agent hand-off

An agent can send a recipe or named take to the open World Builder with
`genobi_world_recipe`. Read the target tab's current recipe and live `revision`
through `genobi_world` first, then send it as `expectedRevision` together with the
linked project's `copyId`. Both the World pairing and project link are required.

The target tab applies the recipe and any named-take sound only while its live
revision still matches. Concurrent human scene edits refuse the handoff without
changing the scene. Re-read the recipe and preserve those edits before sending
again. Another tab leaves the handoff waiting; a reload needs a new live revision.
The guard is separate from the saved Recipe and Director's project revision.

[The handoff contract](world-recipe-handoff.md) covers HTTP/MCP/CLI, guarded
polling, acknowledgement, older clients and the asynchronous commit boundary.
Handoffs remain local and in memory; they never capture or submit generation.

### Agent capture

An agent paired with the open tab sends `genobi_world`'s `capture` command with
a name; the tab runs what Capture take runs on the current recipe, keeps the
take in the Takes library under that name and returns its frames, dimensions
and local file paths. It is refused in Walk, while recording live and while
another take is being made. See
[Capture a take](world-live.md#capture-a-take). `send-to-project` then puts a
library take into the open project as the card's Send to Director does, the
take's name as each asset's label, without a project link
([Send a take to the project](world-live.md#send-a-take-to-the-project)).

The person starts it from the scene direction (Scene → **Scene direction**,
the recipe's `prompt`), typed or dictated: with World Builder open, voice
writes there ([voice mode](voice-mode.md#to-world-builder)). **Send to
Genobi**, beside the field, hands the agent the studio runs (Hermes or Claude)
one message through the same path as the voice panel's Send to agent
(`sendToGenobi`, `src/world-builder/world-send.ts`): the running session takes
it as its next message, a session that takes no messages gets it on the
clipboard, and with none running the spawn dialog starts one. The message is
the direction (2,400 characters), a one-line summary of the set (preset or
named take last loaded, room, character and motion, camera shot, frames and
size, up to 12 object ids; 600 characters, `sceneSummary` in
`src/world-builder/world-agent.ts`) and which tools change the scene, within
the 4,000-character message limit, control characters stripped. Never the
recipe itself. **Copy** puts the same message on the clipboard. A session
started anywhere in the studio while World Builder is on screen also carries
`world` in its [context](agent-context.md): that the page is open, the
project beside it, its last preset and the same summary. The server keeps it
only for a session linked to that project, and the preset is forgotten when
World Builder closes or the project changes. Nothing here captures or spends; the agent's
paid steps wait for approval as always.

## Named takes

A named take is a move-library recipe with an id the Scene menu and an
agent can pick (`src/world-builder/named-takes.ts`). **Falling room**
(`falling-room`) is `examples/moves/fall.json` as it is: the Cathedral, an
`orbit60` shot, idle 1.5 s, hit 0.5 s, fall 4 s, 145 frames, with the audio
gain at zero. Choosing it also loads a **dry sound made from the recipe**
(`take-sound.ts`): a quiet seeded room tone, a thump where `hit` starts and a
heavier thud where `fall` lands (the hips 1.0 s into Death01 and the back
0.17 s later, read off a captured take's frames),
48 kHz mono, the take's exact length. It is synthesised in code, so the same
recipe gives the same bytes and nothing is bundled or downloaded. The take's
WAV then carries it, as the dry source for a room.

**Apply room** (Capture panel, studio only, after a take with sound) is the
free in-studio route to that room: the WAV is uploaded to this session, Space
([media space](media-space.md)) puts the recipe's room preset on all of it
with local ffmpeg, and the result is added to project assets. The room is the
preset whose size matches the recipe's `room-` set, else the nearest by
volume; open sky has none. The Comfy route builds the room from the geometry
instead (Reverb, below; `workflows/world-builder-acoustics.api.json`). See
[the Falling room template](falling-room.md).

## The project's recipe and scene

A studio project carries its 3D sources as free files, like the prompt
brief: `world/recipe.json`, the recipe a hand-off applied or a take was
captured with, and `world/scene.json`, the 3D camera scene last loaded
(`src/director/world-files.ts`). Download bundle writes them into the ZIP;
Open bundle checks them with `validateRecipe` and `parseScene` and refuses a
bundle whose recipe breaks the rules. **Load project recipe** (Recipe panel)
applies the project's recipe, and the 3D camera lists the project's scene
among its loaded scenes. The server's project copy does not hold them; the
studio keeps them across a copy reload. Sharing stays the offline ZIP.

## Comfy integration

[Local node package](https://github.com/koshimazaki/Genobi/blob/main/custom_nodes/director_world_builder/README.md):
`npm run build:scene-adapter` builds the same renderer into a standalone Comfy
frontend bundle. CSS assets referenced from the studio's public root are
bundled with relative URLs, including the Director's Nokia font, so the node
does not need a Genobi server to serve them. **World Builder · Capture** loads prepared guidance as IMAGE
frames, AUDIO, FPS, recipe STRING, depth and canny IMAGE batches.
Its optional `audio` input takes any Comfy AUDIO (LoadAudio, a generator) as
the take's sound in place of the `audio_file` WAV, trimmed or padded to the
take's length at its own sample rate. In Comfy's World Builder panel the Sound
tab also lists the session's recent audio outputs (SaveAudio, PreviewAudio,
Inputs), fetched from that Comfy's `/view` only, under **Graph audio
outputs** ([inside the Comfy node](world-builder-sound.md#inside-the-comfy-node)).
The bundle is built with `globalThis.__genobiWorldHost` set to `"comfy"`
(`host.ts`): inside Comfy an agent reaches the node through the graph, so
**Connect agents**, its pairing code and **Send to Genobi** are left out, and
the preset menu drops the Neuro shader. The example track is copied into the
bundle (`web/media/`). Its scene library says that
takes stay with that ComfyUI in this browser, since the bundle stores them in
the browser's IndexedDB for the ComfyUI address. After any change in `src/world-builder`,
rebuild the bundle (`npm run build:scene-adapter`); `npm run check:scene-adapter`
builds it twice and fails on a build error, a non-reproducible bundle or a
local node bundle older than the sources.
**World Builder · Acoustics** and **World Builder · Storyboard** sit beside it. **World Builder · Inputs** prepares a
Comfy image/video-frame batch and/or generated audio for the scene. Browser
capture is an explicit step between the input and output sides; this avoids
claiming an executable cyclic graph or a headless renderer.

Comfy Cloud uses the external app plus its supported media/workflow nodes. The
custom node cannot be assumed available in Cloud. The new World Builder takes
have not been submitted to a fresh Klein/Layout-to-Render run. Native Klein
styling and the existing LTX Layout graph are the intended next connection;
Director's current image handoff uses its existing FLUX Edit route.

## Depth pass

Every take also renders the same frames as linear depth: camera distance is
mapped from 1 (white) at the recipe's `depthNear` to 0 (black) at `depthFar`,
in metres (defaults 0.1 and 50; empty background is black). It uses Three.js's
`MeshDepthMaterial` as an override, so skinned characters and instanced props
keep their pose, and the grid and Neuro sky are hidden. The depth WebM shares
the colour take's VP8 encoder settings and frame grid; the receipt lists
`passes: ["colour", "depth"]`, the range and both hashes. Live recordings stay
colour-only. In Comfy, Capture returns `depth` and a Python `canny` pass
beside the frames.

## Acoustics and reverb

Room acoustics and the Reverb node are in
[World Builder acoustics](world-builder-acoustics.md).

## Boundaries and next work

- One stage and one known shader, with validated recipes. Arbitrary GitHub,
  HTML/site imports and arbitrary shader source compilation remain deferred.
- Reuse scene recipes as editable source after generation. Full Director project
  persistence linking every job, asset, prompt and scene revision is a follow-on;
  current generation history and scene recipes are separate.
- The renderer exports RGB guidance and a linear depth pass. Normal passes, EXR/HDR, R2 transport,
  fine-tuning datasets and actual training are not implemented here.
- Audio and per-object prompts can guide an agent's later plan; this version
  does not automatically generate songs or execute Director plans.
- Cloud workflow execution and an open-checkpoint agent harness need separate
  integration verification. The local node ran in an isolated CPU-only Comfy
  instance; see [verification evidence](world-builder-verification.md).

## Reuse and verification

The capture encoder/WebM writer, Neuro shader and camera ease curves
(`shared/camera-ease.ts`) were extracted from Holodeck.
Its MIT notice is retained in `src/world-builder/Holodeck-LICENSE.txt`. Audio
modulation retains its imperative, frame-indexed approach with a small offline
RMS analyser suitable for deterministic export. Director already depends on
Three.js; this extraction adds no runtime package dependency.

Tests: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build:pages`;
node media tests: `python3 tests/world_builder_node_test.py` and `python3 custom_nodes/director_world_builder/test_nodes.py` in an environment
with torch, numpy, Pillow and FFmpeg. The latter uses real tensors and media in
temporary directories, without a Comfy server, model generation or paid calls.

Official interfaces: [Comfy JS extensions](https://docs.comfy.org/custom-nodes/js/javascript_overview)
and [IMAGE tensor shape](https://docs.comfy.org/custom-nodes/backend/images_and_masks).

## Play, characters, shortcuts and panels

Capture and edits during Play, character orientation, the preview shortcuts
and the panel dock are in [World Builder controls](world-builder-controls.md).
