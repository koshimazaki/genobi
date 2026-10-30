---
tags: [3d, agents, sound, mcp]
summary: Agent-built 3D scenes as data - the scene document, its commands and the roomBox helper, Load and Save in the 3D tab, and the room acoustics estimated from the geometry (Sabine/Eyring RT60 per band, critical distance, pre-delay, early reflections).
---

# Scene builder

Part of #18 (**Scenes built by the agent**, **Objects referenced to
subjects**) and #14 (the `genobi-3d` skill). An agent writes a 3D scene as
data, the person loads it in the [3D tab](3d-tab.md), and the scene reports
its room acoustics from its geometry. Nothing generated runs as code.

The acoustics are a readout and a portable data object. Applying them to a
shot's audio is a separate step: the intended consumer is the existing
`genobi_media_space` tool (Acoustic Space for a shot). Nothing here changes
a prompt, a caption or a sound.

## The document

Code lives in `shared/scene/` (portable: no Node or DOM API). A scene is
`SceneSpec` from `shared/scene/types.ts`, the same type the built-in scenes
in `src/scene3d/scenes.ts` use:

| Field        | Holds                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `version`    | `1`                                                                                                |
| `revision`   | Counts accepted edits; a command must name the current one                                         |
| `id`         | `^[a-z][a-z0-9-]{0,39}$`                                                                           |
| `label`      | Up to 80 characters; control characters become spaces                                              |
| `summary`    | Up to 300 characters, cleaned the same way                                                         |
| `subject`    | Where plates aim; inside the walls when there are walls                                            |
| `listener`   | Optional; where acoustics listens (default 3 m in front, +z)                                       |
| `scale`      | 0.1 to 20, multiplying Holodeck's offsets (built for a 1.8 m figure)                               |
| `fov`        | 10 to 120°, vertical                                                                               |
| `content`    | `primitives` with a ground size (1–500 m), or an AKUSPACE acoustic room                            |
| `characters` | Optional, up to eight bundled actors; see [scene examples](scene-examples.md) for assets and poses |
| `objects`    | Up to 200 primitives                                                                               |

A primitive has a `shape` (box, sphere, cylinder, cone, torusKnot,
icosahedron), a `position` (±500 m), a `size` (0.01–200 m each), an optional
`rotationY`, a theme `colour` token, and optionally an `id`, a `material`
(tile, concrete, plaster, wood, carpet, curtain, glass, metal) and a `role`
(wall, floor, ceiling, prop). A wall, floor or ceiling must be a box; a
primitive with no role is a prop. The compact document is at most 64 KB.

`parseScene` (`shared/scene/parse.ts`) validates an untrusted scene and
returns a canonical copy. An unknown field, shape, colour, material or role
is refused with a reason that names it.

## Commands

`applyCommand(doc, command, revision)` (`shared/scene/commands.ts`) refuses a
stale revision, then applies one command and parses the result again.

| Command            | Fields                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `add-primitive`    | `primitive`, with a new `id`                                                                    |
| `remove-primitive` | `id`                                                                                            |
| `set-primitive`    | `id`, and any of `position`, `size`, `rotationY`, `colour`, `material`, `role`                  |
| `set-subject`      | `subject` and/or `listener`                                                                     |
| `set-characters`   | `characters` replaces the cast; assets/poses are validated, positions must be inside room walls |
| `set-content`      | `content`                                                                                       |
| `set-camera`       | `fov` and/or `scale`                                                                            |
| `room`             | The `roomBox` options; replaces any earlier walls, floor and ceiling                            |

`roomBox` (`shared/scene/room.ts`) builds a rectangular room: the interior
spans x ±width/2, z ±length/2 and y 0 to height, with 0.1 m boxes outside it.
That is six boxes, or five with `openTop`. A `door` on the north (−z),
south, east or west wall splits that wall into the pieces either side and a
lintel; the gap is the door.

## In the 3D tab

The default 3D workspace uses the [Builder recipe](world-builder.md). For the
scene document described here, choose **Ninja** and enable **3D camera viewer**
and **3D camera controls**. These contracts stay separate; load scene JSON here,
and Builder recipe JSON under Builder → Scene → Recipe & agent controls.

**Load scene** takes a `.json` file (up to 256 KB) and parses it. A refusal
reads "Not loaded: _reason_" under the buttons and nothing else changes. A
loaded scene appears in the picker as "_Label_ (loaded)" for this visit only;
it is not stored. **Save scene** downloads the current scene as
`<id>.scene.json`. Materials change the theme colour's look: tile is glossy,
carpet rough and darker, glass see-through, metal metallic. A room with a
floor box draws no ground plane under it. **Room acoustics** (collapsed) is
the text readout below.

## Acoustics

`roomAcoustics(spec)` (`shared/scene/acoustics.ts`) returns `null` for a
scene without walls: an open set has no reverb to report. Otherwise:

1. **Interior.** Floor and ceiling slabs stay horizontal. Wall orientation
   follows the nearest outer room edge, including thin door lintels and piers;
   the interior runs between inner faces (`shared/scene/faces.ts`).
   Volume V is its width × height × length.
2. **Surfaces.** Each of the six interior faces takes the materials of the
   slabs that cover it. What no slab covers (a door, an open top) is an
   opening with α = 1. Props inside the room add their rough outer area with
   their material, or plaster without one.
3. **Absorption** per octave band, 125 Hz to 4 kHz, from one small table
   (`shared/scene/absorption.ts`, with its sources).
4. **RT60** per band: Sabine, 0.161·V/A. When the mean absorption ᾱ = A/S
   passes 0.2, Eyring, 0.161·V/(−S·ln(1 − ᾱ)). Above 500 m³, air absorption
   adds 4·m·V at 2 and 4 kHz (20 °C, 50 % RH). Each band reports its formula;
   the scene's is `sabine`, `eyring` or `mixed`.
5. **Readouts.** `rt60Mid` is the mean of 500 Hz and 1 kHz; `brightness` is
   RT60(4 kHz)/RT60(500 Hz), clamped 0–1.5; `criticalDistanceM` is
   0.057·√(V/rt60Mid); `preDelayMs` is the nearest closed surface's distance
   from the subject × 2 / 343 m/s; `earlyReflections` are the first-order
   image sources of the subject in each closed surface, heard at the
   listener, with delay after the direct sound and gain (1 − α mid) ×
   direct/reflected distance.
6. **Nearest preset.** Which AKUSPACE room (small room, empty club, medium
   room, cathedral) is closest in `rt60Mid`, read from
   `shared/akuspace-presets.json` `estimated_rt60`. Advisory text only.

### Limits

Sabine and Eyring assume a diffuse field: sound evenly spread, every surface
lit equally. A long, narrow or very absorbent room breaks that, and a box is
not a nave: no vaults, aisles or columns. Props are rough (a torus knot's
area is a guess), sit in the room without shadowing a surface, and their
volume is not subtracted. Coefficients are published table values that vary
by mounting. Treat the numbers as a starting point for a preset, not a
measurement.

## The agent's side

`genobi_scene` (`mcp/scene-tools.ts`) is stateless and read-only, like
`genobi_scrolls`, and in the tools a studio-started session receives
(`server/agent-runner.ts`). Actions: `create`, `inspect`, `edit` (command and
revision), `room` (the helper, with revision), `acoustics` (optionally at a
`listener`), `examples` (catalogue), `example` (starter/hybrid), `video-plan` (prepare-only LTX + AKUSPACE graph) and `handoff` (a one-paragraph description from
`shared/scene/prompts.ts`). It never spends and never stores. The
`genobi-3d` skill teaches it: build a room and props around the subject,
save the JSON for the person to load, read the acoustics and pass the rt60
and brightness to the sound step without claiming any tool applies them.
Image-to-scene (depth, segmentation) is not in this tool.

## What was run

Local only, on 24 October 2026. `tests/scene.test.ts` covers parsing,
refusals, commands, revisions and `roomBox`; `tests/scene-acoustics.test.ts`
builds four reference rooms (fixtures in `tests/scene-fixtures.ts`) and
checks each within 25 % of its AKUSPACE preset and in order:

| Room                                            | RT60 mid | Formula | Preset (estimated)  |
| ----------------------------------------------- | -------- | ------- | ------------------- |
| Tiled bathroom 2.0 × 2.5 × 2.4 m, door, curtain | 0.64 s   | Sabine  | small room (0.67 s) |
| Club 12 × 18 × 5 m, plaster/concrete, curtains  | 1.15 s   | Sabine  | empty club (1.2 s)  |
| Plaster room 7 × 9 × 3.2 m, wood floor          | 1.89 s   | Sabine  | medium room (1.9 s) |
| Nave 20 × 60 × 25 m, carpet, timber roof        | 4.65 s   | Sabine  | cathedral (4.8 s)   |

It also checks the Eyring switch in a curtained room, air absorption at
4 kHz in the nave, critical distance growing with volume, pre-delay and the
open set. `tests/scene-mcp.test.tsx` covers the MCP tool and the Load scene
refusal. A one-off Playwright run against the local Vite server (Chromium,
API routes stubbed, not committed) loaded a refused file and then a valid
one at 320, 390 and 1280 px: the reason showed in place, the scene was
picked as "(loaded)", the readout opened, and nothing overflowed. With the
scene's scale left at 1, the plate camera sits outside a 7 × 9 m room and
sees its walls: lower `scale` for an interior. `scripts/check-3d-tab.mjs`
was not rerun.

Scene ids are capped at 40 lowercase characters so every accepted scene can
travel in a playblast receipt. Door lintels and narrow wall pieces retain
their wall orientation when estimating the room interior.
