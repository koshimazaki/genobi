---
tags: [director, world-builder, agents, mcp, bundle]
summary: Configurable effect presets in the 3D gallery and Editor, portable variants, trusted modules and the shared agent contract.
---

# Configurable effects catalogue

The **3D → Presets** gallery contains scene presets and **Animations & Effects**.
Effects also open from **Editor → Add → Effects**. Choose a card, preview it,
adjust its controls and choose **Insert in Editor**. Scene presets configure the
World Builder; effect presets insert layers into the currently open Editor
project. Browsing and rendering these effects make no provider request.

The four initial effects are authored, deterministic modules. They expose the
same definitions, controls, defaults and module identities to the gallery,
Editor, HTTP API, MCP and CLI. All are version 1 and marked `editable`.

## Presets and controls

All mixes, normalized positions, halftone, jitter, line, distortion and ripple
amounts range from 0 to 1. Speed ranges from 0 to 2. A mix of zero is neutral.
Colours use six-digit hex values. Every card defaults to four seconds; insertion
uses composition frames and fits the remaining composition.

| Preset ID        | Result and layers                                         | Controls and defaults                                                                                                                                                             |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `poster-window`  | Posterized spatial window over the picture, one filter    | `mix: 0.64`, `windowX: 0.5`, `windowY: 0.5`, `windowSize: 0.54` (0.1–0.9), `levels: 4` (integer 2–8), `halftone: 0.75`, `jitter: 0.2`, `accent: #b64c50`                          |
| `cinematic-scan` | Scan filter followed by a separate HUD overlay            | `scanMix: 0.3`, `hudMix: 0.75`, `speed: 0.5`, `lines: 0.25`, `distortion: 0.2`, `accent: #9ce2bc`, `label: FIELD MONITOR` (up to 48 characters)                                   |
| `kinetic-title`  | Authored geometric marks, title and subtitle, one overlay | `mix: 1`, `speed: 0.35`, `accent: #d2f56a`, `color: #f0f1e9`, `text: MAKE IT MOVE` (80 characters), `subtitle: EDITABLE MOTION` (120 characters), `shapeCount: 12` (integer 3–24) |
| `liquid-mirror`  | Reflective folds and image ripple, one filter             | `mix: 0.45`, `ripple: 0.3`, `folds: 6` (integer 2–12), `speed: 0.35`                                                                                                              |

**Poster window** samples the current picture; it does not sample earlier or
later source frames. **Liquid mirror** is analytic distortion of a single input
frame. It does not implement fluid simulation, temporal water tiles, physical
reflections or soundtrack analysis. The HUD numbers are authored graphics,
not measured telemetry. Kinetic title uses persistent authored geometry rendered
into the composition; its text and controls remain editable, but it does not
reconstruct editable SVG paths from generated footage.

The scan and HUD are separate layers so their timing, opacity and parameters
can be changed independently after insertion. The scan runs below the HUD,
keeping the graphics legible. Font defaults are IBM Plex Mono.

## Applying an effect

The insertion starts at the current Editor playhead. Filter presets require a
visible image or video covering the complete requested interval, including
across cuts; a gap or muted picture is refused. Kinetic title needs no picture.
Filters process the **composition below** their layer. Selecting a source clip
checks that clip's coverage; it does not isolate the effect to that clip.

Each insertion gets fresh layer and lane identifiers, keeps the preset layer
order, copies the exact registered module bytes and advances the project
revision once. All added layers are independently editable. One Editor Undo
restores the entire previous bundle, including its modules. There is no new
persistent group object or hidden merged render.

The command refuses a stale revision, reused identifiers, timeline overflow,
missing picture, invalid parameters or an existing module whose metadata or
bytes differ from its registered identity. It prepares and validates the whole
result before the studio commits it. A failed insertion leaves the project
unchanged.

## Save, export and reuse a variant

**Save a variant** stores a named configuration in this browser (up to 24
variants). If browser storage is unavailable, the gallery says it is retained
for this tab only. **Export JSON** produces a portable `.effect.json` file;
**Import variant** validates it before adding it to the gallery.

The portable format is `genobi.effect-variant.v1`, with exactly these fields:

| Field           | Meaning                                                   |
| --------------- | --------------------------------------------------------- |
| `schemaVersion` | Literal `genobi.effect-variant.v1`                        |
| `presetId`      | A registered catalogue ID                                 |
| `presetVersion` | The preset's integer version                              |
| `name`          | 1–80 characters, without control characters               |
| `parameters`    | Every exposed control, including values equal to defaults |
| `moduleHashes`  | Exact module IDs and their registered SHA-256 hashes      |

Variants contain no media, source code, paths, project identifiers or layer
identifiers. Import is limited to 16 KB and rejects unknown fields, incomplete
controls, invalid ranges, changed versions and changed module identities. Use
the create operation to obtain the complete current configuration and hashes;
do not invent them. Applying the same variant in another project generates
fresh layer identifiers. Explicit command `parameters` override the variant's
values for that insertion without altering the saved variant.

## HTTP, MCP and CLI

Catalogue inspection and variant construction work locally and on the hosted
API without a provider key. They use the normal session/origin protections and
read-rate limits. These operations return data and do not persist anything on
the server. The caller saves the returned variant.

| Operation        | HTTP                                      | MCP                                           | CLI                                                     |
| ---------------- | ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| List             | `GET /api/effects`                        | `genobi_effects {}`                           | `genobi effects`                                        |
| Inspect          | `GET /api/effects?presetId=poster-window` | `genobi_effects {"presetId":"poster-window"}` | `genobi effects --input '{"presetId":"poster-window"}'` |
| Create variant   | `POST /api/effects/variants`              | `genobi_effect_variant`                       | `genobi effect-variant --input @variant-request.json`   |
| Validate variant | Same POST, `action: "validate"`           | Same tool                                     | Same command                                            |
| Apply            | Existing project command endpoint         | `genobi_director_command`                     | `genobi director-command --input @apply-effect.json`    |

For example, a variant request body is:

```json
{
  "action": "create",
  "presetId": "kinetic-title",
  "name": "Lime end card",
  "parameters": {
    "text": "SEE YOU SOON",
    "subtitle": "A GENOBI STUDY",
    "speed": 0.25
  }
}
```

The response is `{ "variant": ... }`. Validation takes
`{ "action": "validate", "variant": ... }` and returns the checked variant.
List returns `{ "presets": [...] }`; inspection returns `{ "preset": ... }`.
Each definition includes exposed control bounds, defaults, ordered relative
layer timings, source requirements, credits and pinned hashes.

Read the current project first with `genobi_project`. Then send the revision
you read as both `baseRevision` and `command.expectedRevision`. For a project
at revision 12, this inserts a two-second title at frame 48 of a 24 fps cut:

```json
{
  "copyId": "the-project-copy-id",
  "baseRevision": 12,
  "command": {
    "op": "apply-effect-preset",
    "presetId": "kinetic-title",
    "instanceId": "end-card-01",
    "expectedRevision": 12,
    "startFrame": 48,
    "durationFrames": 48,
    "parameters": {
      "text": "SEE YOU SOON"
    }
  }
}
```

`instanceId` must be a fresh lowercase prefix of at most 44 characters.
`variant` and `sourceLayerId` are optional command fields. Browser code calls
`executeStudioCommand` with the inner command; it reserves the edit operation,
checks the revision again after loading module bytes and commits once.
Project mutation follows the existing [Director agent contract](director-agent-tools.md);
stateless catalogue endpoints do not add hosted filesystem project editing.

## Implementation and verification

Portable definitions, validation, variants and application live in
`shared/effects/`. The authoritative module manifest is
`docs/director-bundle/effects-catalogue/modules.json`, with source beside it.
The shared trusted recipe registry supplies metadata and source paths. Browser
and server insertion both verify SHA-256 before admitting the module bytes;
imported variants cannot supply executable code.

Focused tests cover immutable definitions, control bounds, variant round trips,
revision conflicts, media coverage, layer order, one Undo, verified source
insertion and local/hosted API parity. Renderer checks cover fixed-time output
and neutral mixes. These are local implementation checks, not a claim that
the change has been deployed. The next families and source-reference work stay
in the [Animations & Effects plan](animations-effects-plan.md).
