---
tags: [3d, world-builder, studio]
summary: World Builder controls - capture and edits during Play, character orientation, preview and character shortcuts, and the panel dock.
---

# World Builder controls

Part of [World Builder and Scene Adapter](world-builder.md).

The main [Loop panel](world-builder-loops.md) keeps global Save A/B, Play loop,
Save loop, total time and algorithm controls beside the view. Camera opens next
to Expand; music and advanced settings stay in the sidebar. Assets and presets
remain underneath the scene.

## Capture and edits during Play

Play is a preview of the take's frame grid; no panel control is disabled while
it runs.

- **Save loop**, **Capture take**, **Save PNG**, **Send first frame** and **Send take to
  Comfy** stop the preview, wait for the frame it is drawing, then run. Capture
  renders its own deterministic grid from frame zero, so pressing it mid-preview
  captures the whole take, not the remainder. The same holds from Walk or Build.
- Loading or picking audio, a scene preset, a character, a mode change, any
  Scene, Camera or Object edit, a surface image, and scrubbing the frame slider
  also stop the preview first.
- The Sound tab's mod matrix (band, target, property, gain, gate, invert)
  applies live: the preview keeps playing and skips frames while the set
  reloads.
- Two locks remain. Everything waits while a capture or load is running
  (`busy`), since both draw the scene. Build's drag handles and direct Shot
  camera gestures stay locked while Play runs and unlock on Stop, so an unfinished drag is cancelled rather than
  committed mid-preview. `scripts/check-world-audio-editing.mjs` checks both
  rules and capture during Play against a local dev server (`DIRECTOR_URL`).
- The agent contract is unchanged except `configure()`, which now applies
  during Play as the mod matrix does. `capture()`, `snapshot()`, `setAudio()`
  and the surface calls still refuse while Play runs, as do the live session's
  controls and recording (`live.*`).

## Character orientation

`avatarPose` holds the character's feet position in metres and three angles in
radians: `yaw` (turn), and the optional `pitch` (tip forward or back) and `roll`
(lean sideways), each within ±π. Absent `pitch` or `roll` means 0, so recipes,
room presets, agent patches and the Comfy node examples saved before these
fields existed load unchanged, and an upright pose is saved without them.
`src/world-builder/avatar-pose.ts` validates the pose and applies it as Euler
order YXZ: yaw first, then pitch about the turned body's side axis, then roll
about its facing axis.

The rotation pivots on the feet (the character root's origin), not the body's
centre. At pitch ±90° the body lies along the floor rather than floating at hip
height; the half of the body below the spine line dips into the floor, so raise
`y` by a few centimetres for a clean contact. The character faces +Z at yaw 0:
pitch +90° lays it face down, −90° on its back, and roll +90° on its side with
the head to its left.

**Scene → Character placement** shows position, turn, tip and lean (degrees in
the inspector, radians in the recipe) plus quick **Upright**, **Lie face down**,
**Lie on back** and **On side** buttons, each keeping position and turn.

## Character path

`avatarPose` is where the character is at frame 0. The optional `avatarPath`
moves it over the take: up to 16 keys `{ frame, pose, ease? }`, frames rising
from 1 to 720, each `pose` validated like `avatarPose` (±40 m, ±π). Between
keys every field is interpolated linearly; `ease: "fall"` eases the height in
like gravity (slow leaving the previous key, fastest arriving), and the pose
holds after the last key. `src/world-builder/avatar-path.ts` computes the pose
from the recipe and the frame index alone, so Capture, the depth pass and
playback agree. Without `avatarPath` the character stays where `avatarPose`
puts it, as before. Build shows and edits the start pose; Walk is unaffected.

A shot whose move tracks the character (`face`, `crane`, `skydive` and the
other follow and orbit moves) moves its camera and aim with the character's
travel from the start pose; a custom or static camera stays where it was put.
`targetY` reaches 40 m so a tracking shot can start on a character high in the
air. The `skydive` move sits 3 m above and 2 m behind a face-down figure's
feet, aimed 57° down past the head at what is coming up.

## Preview and character shortcuts

Shot camera supports drag-to-orbit, right/Shift-drag-to-pan and scroll-to-zoom
without entering Build. The exact view is committed when the gesture ends, so
saved views, scrubbing and exports agree. Playback, loading and captures own
independent locks, including a pending colour/depth capture. The labelled geometry
preview supports camera gestures too, while Build/Walk and capture still need WebGL.

In Shot camera, Space plays/stops the scene take. The transport's **↻ Loop**
toggle repeats its 24 fps frame grid and restarts attached preview audio at each
scene boundary. That toggle affects preview only. The global **Loop** panel
authors the return to the first saved view into the exported take. In Walk,
focus the scene: Space jumps when
grounded, holding Shift doubles movement speed, and releasing it returns to
walking. Inputs clear on focus loss. In Build, Backspace/Delete removes the
selected added primitive. Text fields keep their normal keys. These shortcuts
act only when focus is inside World Builder or on nothing in particular. A
focused control in another panel, such as a 3D camera button or the voice
overlay, keeps Space and Delete for itself.

## Panels: two docked, one popped out

Camera beside Expand and Music controls in the Loop panel open the existing
settings. **More settings** exposes Scene and Export. Up to two settings panels
dock below the global Loop controls at once, stacked, each with
its own header: collapse, pop out and close. Opening a third replaces the
oldest; selecting an object opens Object, which counts as one of the two. Escape
closes the focused panel and returns focus to its button. The column keeps the
same height however many panels are open, so opening, stacking, collapsing or
popping out never moves the viewport or its toolbars. Which launcher panels are
docked, and which are collapsed, is remembered per surface (the studio's 3D
tab, `/world-builder` and `/scene-adapter`) in `localStorage`; Object follows
a selection and is not restored. Build's primitives chooser is not a docked
panel: it opens beside Add on the tool rail. The desktop sidebar scrolls within
the viewport's height. On a phone it follows the scene, before the full-width
catalogue. Opening Camera from the lightbox closes its native modal first, so
the settings panel can receive input.

**Pop out** moves a panel into a Document Picture-in-Picture window, so Sound
can sit on another screen while Camera and Scene stay docked. The panel is the
same React tree, only its element moves, so playback, scopes and drafts carry
on and every control stays live. Its docked slot is freed. The window copies
the page's stylesheets and follows the theme (`data-theme` on `<html>`) as it
changes. Closing the window docks the panel back. Chromium allows one such
window per page, so popping out a second panel moves the window to it and docks
the first; the inspector keeps its column, with that note, even when the
popped panel is the only one open. Select menus in a popped panel open inside
its window. World Builder's keys (Space to play, Delete to remove a primitive)
listen on the main window only, so they do nothing while focus is in the
popped-out panel; click the scene first.

Pop out appears only where `window.documentPictureInPicture` exists in a
top-level, secure window: Chromium desktop browsers, the studio and the
standalone pages. Inside an iframe (the Comfy node's embedded scene adapter) the
browser has the object but refuses to open the window, so the button is hidden
and panels dock as usual. Safari and Firefox have no pop out. The logic is in
`src/world-builder/panel-dock.ts` (tested in
`tests/world-builder-panel-dock.test.ts`), `PanelDock.tsx` and
`useDocumentPip.ts`, the last ported from Holodeck's hook under its MIT notice.

## Backdrop screen

The Stage scene has a screen plane behind the set (8 × 4.5 m, 4 m back) that
carries `screen/all` media. **Scene → Objects → Backdrop screen** removes it:
unchecked, the recipe stores `screen: false` and the plane is hidden in the
preview, every capture and the depth pass. A recipe without the field keeps
the screen, so older recipes are unchanged. The Comfy Capture node accepts
`screen` and refuses a non-boolean one. Playground and Neuro have no screen.

## Inside the Comfy node

The Capture node shows the editor inline, in a compact layout (the viewport,
its Shot/Build/Walk buttons and the take strip). **Open World Builder** lifts
the same editor into a full-size dialog and **Back to graph** (or Escape)
returns it to the node, so nothing reloads and edits carry over. The node asks
for the layout with a `director:layout` message (`host-messages.ts`) and
`src/world-builder/node-compact.css` hides the rest. After a queue the node
previews the take's first frame, then its depth (when captured) and canny.
