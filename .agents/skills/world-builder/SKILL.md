---
name: world-builder
description: Prepare the Holodeck Playground, a procedural set or Neuro shader in Director World Builder, edit camera and audio reactivity through a validated recipe, and capture PNG/video guidance for Comfy. Use for scene preparation and capture; arbitrary project import and model training are outside this adapter.
---

# World Builder

Read `docs/world-builder.md` in this repository for the current contract and
`src/world-builder/recipe.ts` for exact limits. Open `/world-builder` from the
running Director app; `/scene-adapter` uses the same standalone renderer.

1. Inspect the current recipe and preserve the user's set. Choose Stage with a
   preset, Playground (with or without its mannequin), or Neuro. Build / edit provides
   viewport handles; walking is preview-only. Return to Shot camera before capture.
   Recipes retain layout overrides, avatar pose and offset camera targets. Move,
   Rotate and Size (W/E/R) support full rotation and per-axis stretching. The
   compact tool rail adds eight primitive types. Scene/Character menus sit above
   the viewer; Camera, Sound, Scene and Capture share one initially closed dock.
   Recipe JSON save/load lives under Scene → Recipe & agent controls. Character
   offers mannequin, CC0 dog, owner-imported creature and a procedural theme Blob.
   Scene → Character motion selects a fixed-frame clip; Camera → Frame character
   fits it. Creature model/FBX inputs stay local; reattach matching fingerprints.
   Walk uses the capsule for every choice and saves placement, not live motion.
2. Configure declared parameters and inspect a first and final frame. Keep
   camera orbit/dolly distinct from Director's model camera prompting. Object
   prompts are metadata; build the actual primitives explicitly. For a clip that
   loops without a seam, set `loop: true` (e.g. `{ orbit: 360, seconds: 2, loop: true }`).
3. Assign local media through setSurface(target, blob), e.g. prop:wall/front,
   prop:wall/back or world:car-a/all. Cube faces are independent; other shapes use
   all. A recipe names attachments but does not embed files. Reattach before capture.
4. If using music, attach audio before configuring reactivity. The fixed-grid
   envelope drives scale, height or light. Neuro uses scale/light, not height.
5. Capture a take and inspect the PNG, WebM and receipt. With audio, export the
   matching WAV too; the WebM itself is silent. Reattach source media when
   loading a recipe on another machine.
6. Send the first frame to Director only when that preparation is requested.
   This loads the Edit composer and does not queue generation. Use the existing
   generation flow and its spend/authorization rules for downstream models.
7. For local Comfy, use the documented Capture/Inputs nodes. Queue Inputs to
   prepare generated media, send it to the browser, then capture the next take.
   Do not treat the node as unattended browser rendering or assume it exists in
   Comfy Cloud. Cloud uses the standard media upload path.

`window.directorScene` provides describe/getRecipe/configure/render/snapshot/
snapshotDepth/setScreen/setSurface/clearSurface/setAudio/capture/cancel. A
take carries a linear depth pass (`depth`, `depthFirst`) between the recipe's
`depthNear` and `depthFar`. For room sound, build a `room-*` set (Small room,
Acoustic room, Club, Cathedral) and let the Comfy Acoustics node name the
AKUSPACE preset. Use only scripting capabilities permitted by
current browser tools; where evaluation is read-only, use the recipe UI and
file controls instead. Never fetch credentials or execute imported project
scripts through the recipe interface.

With only the Genobi tools, pair with the tab (`genobi_world`): `presets`
lists every move-library recipe with its `file` name, `load-preset` takes a
name or that file name and returns the recipe, `recipe` reads the current one
back, `capture` takes it, and `send-to-project` sends a library take to the
open project as the card's Send to Director does (first frame and MP4, named
after the take). See `docs/world-live.md`.

Keep receipts linked to the exported media. Report which scene, dimensions,
frame count, audio path and downstream stages were actually verified. A capture
or an open model name alone does not establish a complete generation, training
run or Open Weights Only eligibility.
