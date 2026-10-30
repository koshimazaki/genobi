---
name: genobi-3d
description: Build and combine editable primitive scene examples—cathedral, house/interior, exploded house, mountains, forest or neon street—with neutral mannequins and an optional pug for character blocking, camera capture and an LTX plus AKUSPACE ComfyUI handoff. Use for simple sets, two-character interactions, characters in an environment and room-acoustics estimates.
license: MIT
metadata:
  version: "0.3.0"
  tags: "3d, agents, sound, mcp"
  docs: "docs/scene-examples.md, docs/scene-builder.md, docs/3d-tab.md, docs/world-live.md, docs/world-builder.md, docs/falling-room.md"
---

# Genobi 3D: examples first

The default 3D tab opens World Builder. The advanced camera plates live in
**Ninja**: enable **3D camera viewer** and **3D camera controls** to load scene
documents and render playblasts into Director. Builder recipe JSON is a separate
contract; do not load this tool's scene document into Builder.

Start from a working example before constructing a scene from scratch.
`genobi_scene` transforms validated data; it neither stores a scene nor runs a
model. Keep the returned document and use its current revision for every edit.

## Choose a starting point

Call `genobi_scene` with `{ "action": "examples" }` to list the examples and
combination controls. Use `example` to obtain the editable scene:

```json
{ "action": "example", "example": "forest-meeting" }
```

| Request                      | Starting point                                                   |
| ---------------------------- | ---------------------------------------------------------------- |
| Simple cathedral             | `cathedral`: enclosed nave, columns, pews, altar                 |
| Interior design              | `house-interior`: furnished room with material roles             |
| Exploded architectural view  | `exploded-house`: separate floors, walls, furniture and roof     |
| Neo Tokyo / neon city street | `neo-tokyo-street`: blocks, windows, sidewalks and glowing signs |
| Mountain landscape           | `mountains`: layered cone peaks                                  |
| Forest / in a forest         | `forest`: trees around an open clearing                          |
| Two people interacting       | `forest-meeting` or `city-meeting`                               |

Optional `surroundings` is `none`, `forest`, `mountains` or `city`; `cast` is
`none`, `solo` or `pair`. For a house in the forest, start with:

```json
{
  "action": "example",
  "example": "exploded-house",
  "surroundings": "forest",
  "cast": "pair"
}
```

These are combinations of editable primitives, not imported opaque models.
The companion environment's object ids start with `extra-`. An enclosed room
still has walls: inspect the view from inside, or use the exploded house for
an outside architectural overview. Exploded walls are props, not an enclosed
acoustic room.

## Edit what the shot needs

Units are metres; north is −z. Scene ids are at most 40 lowercase characters.
A box uses full width/height/depth; a cone, cylinder or sphere uses the first
size value as radius. Material choices are tile, concrete, plaster, wood,
carpet, curtain, glass and metal, using the studio's theme colours.

- `edit` with `set-primitive` changes a named object's position, size, rotation,
  colour, material or room role; `add-primitive` and `remove-primitive` add or
  remove parts.
- `edit` with `set-characters` replaces the actor list. Each actor has an `id`,
  bundled `asset`, compatible `pose`, position, rotationY in radians and scale.
  The cast catalogue below lists actual assets and supported authored clips.
  Arbitrary URLs and mesh filenames are refused.
- The two-character examples face the actors toward one another. Place a solo
  actor in a forest or city with `cast: "solo"`. Walking is an in-place loop;
  it does not translate the actor through the environment.
- `set-subject` moves the camera's look point. `set-camera` changes `scale`
  and vertical `fov`; use the example's scale first so an interior camera stays
  inside its room. `room` builds or replaces an enclosed room with materials.

Example edit (pass the actual latest document, not the placeholder):

```json
{
  "action": "edit",
  "document": { "…": "latest scene" },
  "revision": 0,
  "command": { "op": "set-primitive", "id": "roof", "position": [0, 11, 0] }
}
```

## Use and test it

Save the returned document as `<id>.scene.json`. In **Ninja**, enable
**3D camera viewer** and **3D camera controls**, then choose its starter from
Scene or press **Load scene** for an edited file. The studio waits for the
bundled characters before capture. Inspect first, middle and final poses for
occlusion, ground contact and framing. Choose a camera plate and **Render
playblast** for an MP4 in Director; the clip retains its camera-path receipt.
Actor animation is sampled by frame time, independently for preview and capture.

## LTX video with AKUSPACE inside

Use **Export LTX + AKUSPACE kit** after the scene is ready. The ZIP contains a
first-frame PNG, scene JSON, camera-path JSON, a prepared API-format workflow
and instructions. It does not contain a dry reference recording: supply a real
recording under the filename the kit lists, along with its PNG in ComfyUI input.
The kit uses the pinned AKUSPACE Docker image from `docs/akuspace-docker.md`.
It retains the AKUSPACE LoRA and both image-conditioning passes. No generation
has been submitted by exporting it.

For an agent-only handoff, call `video-plan` with `document`, optional `camera`
wording, `duration`, `firstFrame` and `referenceAudio` filenames. It returns
`graph`, required inputs and treatment, but does not rasterize the scene.
Capture the real first frame in the studio; do not fabricate a PNG path as proof
that a frame exists. `acoustics` gives an advisory nearest room preset; outdoor
examples use day/night ambience rather than indoor reverb.

This is **image-conditioned LTX video with an AKUSPACE LoRA**. The camera path
and playblast remain references; this graph does not consume either as exact
motion control. The existing studio text-to-video Acoustic Space route does not
consume this first frame automatically. Check the Docker nodes/models/inputs,
follow the generation approval boundary, and report real job evidence before
claiming a completed model run.

See [Scene examples](../../../../docs/scene-examples.md) for combinations and
verification, [Scene builder](../../../../docs/scene-builder.md) for commands,
and [3D camera](../../../../docs/3d-tab.md) for capture.

## Neutral subjects and future asset sources

Keep mannequin and blob as default abstract subjects; the optional neutral pug
provides one animal stand-in. `forest-companion` stages a mannequin and dog. The existing mannequin has
a neutral matte grey material; its authored poses are idle/talk/walk/interact/
punch/spell/dance plus jog, sprint, jump, roll, fall, sit, crouch and the
other clips listed under "Move library" in `docs/world-builder.md`. Each actor has independent position, rotation and scale.
`asset` is `mannequin`, `pug` or owner-supplied `creature`. The pug has `idle`, `walk`, `walk-slow` and
`jump`; humanoid talk/spell poses are not valid for it. Use `set-characters` to
stage a mixed cast and choose authored clips. The dog is Quaternius CC0 from
the Three.js game tutorial, rendered with neutral grey materials. Locomotion clips play in-place.

The studio Subject picker replaces the abstract hero with a mannequin, neutral dog or one
blob and preserves the saved scene. Use the blob for camera/composition and the
mannequin when pose, scale or interaction matters. First-frame i2v can carry
source appearance into the result; this kit is not depth/pose-only conditioning.

Read docs/scene-examples.md for researched Three.js, R3F, Kenney and Quaternius
sources. These links are not imported asset libraries. Universal Animation
Library 2 is a CC0 humanoid retargeting source; it does not automatically animate
arbitrary or animal rigs. Current Dungeon Monsters is QAL, so keep it
operator-acquired rather than bundling a public asset/template pack. Kenney's
Nature, City, Modular Dungeon and Mini Characters packs are verified CC0 sources
for future expansion. A demo's open engine licence does not clear its models.

## Owned recurring creature

For a consistent authored lead, use `asset: "creature"` alongside mannequins
in `set-characters`. Ask the operator to load the original VRM using **Creature
model & motion** in Builder or the advanced camera viewer; never copy it into public assets or promise it is CC0.
The exact original file is fingerprint-pinned. It preserves original colours
and materials. Its metadata prohibits redistribution; the MIT repo licence
does not grant creature rights. Keep the model and FBX files local.

Bundled CC0 motion retargets idle/talk/walk/interact/punch/spell/dance. The
operator can load an FBX motion pack or assign a local Mixamo FBX to a motion
slot; run/fly/backflip/jump/ninja/twist need an assignment. Builder also supports
live capsule walking; fixed-frame preview and capture sample the selected clip. Missing files/motions block capture. Save asset/pose/transforms
in the scene and preserve the kit's `creature.json` fingerprints. Reloading
requires reattaching local files. Secondary physics and facial animation stay
still; generative identity preservation still needs a real output check.

## Control and record the live World

Use `genobi_world` for the open Builder tab. Ask the person to click Connect
agents; redeem its one-use code with action `link`. Keep the returned session
id and the same CLI profile. Send action `command` with `control` to set
character, camera, movement, running and animation together. Movement expires
after at most ten seconds; camera mode persists until stopped.

Poll action `result` with the command id before dependent work. Never resubmit
a command with an unknown outcome. `record-start`, coordinated controls, then
`record-stop` produce the viewport clip. Action `download` saves the latest
WebM, PNG and receipt in a new directory. Use `stop` to clear movement.

Command `presets` lists the scene library's presets and `load-preset` with a
`name` (for example `Fall · big room`, `Move · jog`, or a move-library file
name such as `fall-cathedral`) loads one and returns its recipe; it stops Play
and is refused in Walk. Command `recipe` reads the current recipe back.
Command `takes` lists the tab's library takes. Every capture and live
recording is kept there.

Command `send-to-project` with `take` (a take's id or name) runs the take
card's Send to Director in the tab: the first frame under Inspirations and the
take as MP4 (with its WAV) under Project of the open project, named after the
take, so `genobi_project` lists them with that `label`. Its result gives each
`assetId`. It needs no project link, is refused outside the studio, past
150 MB and while another take is being added, and is never resent.

Command `capture` with a `name` (letters, digits, `-`, `_`) runs the Capture
button's fixed-frame take on the current recipe: colour, depth, first frame,
receipt and the loaded sound. It is refused in Walk, while recording live and
while another take is being made. Its result gives the frames, dimensions and
local file paths; action `download` saves them. Read `result` until done; a
long take takes a while, and is never resubmitted.

The creature VRM and original FBX pack must already be attached locally.
Space/jump uses Backflip; Ninja Idle and Fireball are available as actions.
Live recording requests 30 fps and runs for at most 30 seconds, without audio.
Keep the tab foregrounded. No paid generation occurs. See
[Live World sessions](../../../../docs/world-live.md) for HTTP and CLI examples.

## Hand a recipe to the person's World Builder

To set the person's Builder up rather than steer it live, use
`genobi_world_recipe` on a linked project (`genobi_link_project` first). Send
`{ "action": "send", "copyId": "…", "take": "falling-room" }` for a named take
(the Cathedral, an orbit60 shot, idle then hit then fall, 145 frames, with its
dry impact sound), or `recipe` with a full Builder recipe as
`window.directorScene.getRecipe()` returns it. The server checks it with the
Builder's own rules; the open World Builder applies it within a few seconds,
records it as the project's recipe and reports `applied`, or `refused` with its
reason. Read `{ "action": "status" }` until then; never resend a waiting recipe.
Then pair with `genobi_world` and send `capture` to take it. This is the Builder's recipe, not
`genobi_scene`'s document. See [World Builder](../../../../docs/world-builder.md#agent-hand-off).
