---
name: genobi-director
description: Finish a cut in the Genobi Director, the studio's main surface - link or read the person's project, plan the job, then use any studio tool or all of them (camera generation behind a quote, takes handed into the project, audio analysis for the beat grid, Director commands, provenance) and hand the result back to the person.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director), the genobi MCP server and Node 22 or later.
metadata:
  version: "0.1.0"
  phase: "1 - quoted generation"
  tags: "agents, director, bundle, mcp"
  docs: "docs/director-agent-tools.md, docs/director-bundle/README.md"
---

# Genobi director

The Director is the timeline where the person's piece lives. This skill is
the global approach: start from their project, decide what the cut needs, use
whichever studio tools get it there, and finish with the person reviewing it.
The other skills are the tools this one reaches for:

| Skill                                              | Reach for it to                                                |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `genobi-studio`                                    | Check the studio, see every tool, and follow the paying rules  |
| `genobi-camera`                                    | Generate a shot: one workflow card per model, with its wording |
| `product-video`, `character-piece`, `audio-visual` | Make a house template end to end                               |
| `genobi-hermes`                                    | Run on the open route, the Klein box edit or the two-pass run  |

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.

## The job, start to finish

1. **Studio.** `genobi_status {}`. If it is not running, ask the person to run
   `npm run dev`; do not start servers yourself unless they ask.
2. **Project.** Ask the person to open **JSON editor & agent tools** in the
   Director and press **Link an agent**, then call `genobi_link_project` with
   the code (one use, ten minutes). It returns the project's `copyId`; use
   that, not the bare project id, since two people's projects can share an
   id. `genobi_projects {}` lists the projects this session already sees.
3. **Read.** If the studio started you, read **The studio's context** at the
   end of your brief first (`genobi-studio`, "The studio's context"): the
   person's picks, newest first, and the composer's settings. "Use my last
   two picks" means `picks[0]` and `picks[1]`; an `asset` pick names its
   `projectId` and asset id, a `take` pick a gallery job to bring in with
   `genobi_take_to_project`. Then `genobi_project` with the `copyId`: note its `revision`,
   `composition` (size, `fps`, and `bpm` when it has a grid), tracks, clips,
   assets, `recipes`, `shots`, the `globalPrompt` (the primary direction for
   the piece), each clip's own `prompt` and `directions`, the earlier project
   `prompt` brief and open `notes`. Frames
   are composition frames at the project's `fps`.
4. **Plan.** Say in a few lines what you will change and which tools that
   takes. A house template has its own skill; follow it. For anything paid,
   add up the runs and dollars, call `genobi_budget`, and stop before the first
   quote if they do not fit.
5. **Do the work** with the sections below, one tool at a time, rereading the
   project after anyone else edits it.
6. **Record.** When takes made the cut, `genobi_provenance` with their job ids
   in the order they ran, the skill you followed and who you are.
7. **Hand back.** Tell the person in two or three sentences what changed,
   what is waiting for them (a price to approve, a take to review, a note to
   answer), and what you did not do. Then call `genobi_project_feedback`
   before you edit again.

## Generate a shot

Read the complete `genobi_project.brief`, including `references`, before using
an image mentioned as `[Image 1]` or similar. Each reference binds the label to
an `assetId`; the asset list includes its kind, relative file path and hash.
Pass ordered `projectImageReferences: [{copyId, assetId}]` in quote and submit
instead of copying media into the conversation. The adapter reads only files
this session owns or linked, validates the bytes, and preserves input order.
Do not combine this field with inline `imageReferences`. If an asset changes,
quote again and obtain approval for the new inputs. Source-conditioned open
Klein must use `imageAspectRatio: "auto"` because it derives shape from the source.

Use the `genobi-camera` card for the model. The loop is the paying rule from
`genobi-studio`: `genobi_quote`, show the price and wait for the person's yes,
`genobi_submit` with that `quoteId`, the same arguments and a new
`idempotencyKey`, then poll `genobi_job` until `Ready` and read `genobi_take`.
Pass `projectRevision` in the quote when the take is for this project.

A template project lists its `shots` with each shot's `camera`; reuse those
ids in the quote, so the take matches what the person set.

## Bring a take into the project

`genobi_job` and `genobi_take.outputs` include separate deployment audio such
as the wet track or impulse response. To import one, add `outputId` equal to
that output's `assetId` to `genobi_take_to_project`. Omitting it selects the
primary output. The server checks the output belongs to the job and the source
belongs to its authorized owner; imported audio is placed with `add-clip` on
an audio track. Reading or copying a companion never submits another run.

Your takes live in your own studio session, so the person cannot see them
until you hand them in:

1. `genobi_take_to_project` with the Ready job's `id`, the `copyId` and the
   `baseRevision` you read. It returns an `assetId` and the new revision.
2. Place it: `replace-plate {layerId, assetId}` on a template shot's layer
   (`shot-<shotId>`), or `add-clip` for a new clip.

The same take twice answers with the same asset.

Your own cut from the media tools (`genobi-swords`: a trim, concat, crossfade
or space, video or audio) goes in the same way with `sourceId` in place of
`id`. Hand in the takes it was made from first: its record then names them as
its inputs (`derivation`), and the render report lists their models. A sound
cut goes on an audio track with `add-clip`.

## Audio and the beat grid

To recreate the Genobi teaser (a mix cut written as data, nothing generated)
or repeat a run of it from its saved memory, load `genobi-teaser-run`: it is
the whole procedure with a decision table, worked examples and a verifier
(docs/genobi-teaser-run/README.md).

1. A file on this machine: `genobi_audio_upload` with its absolute path
   returns a `sourceId`. An audio asset already in the project needs no upload.
2. `genobi_audio_analysis` with the `sourceId`, or with `copyId` and
   `assetId`. It returns tempo, a fitted beat grid, onsets per band, an
   intensity curve and key moments (build-ups, crescendos, drops), and
   `composition`: `bpm`, `beatOffsetSeconds` and `beatsPerBar`. `beatFound`
   false means no grid was found; do not invent one. The downbeat is an
   estimate: ask the person to confirm it.
3. Cut to the grid: beat `n` falls at `beatOffsetSeconds + n × 60 / bpm`
   seconds into the audio file, so its frame is that times `fps`, rounded.
   If the audio clip does not start at frame 0, or has an in-point, shift by
   the same amount. Use those frames in `add-clip`, `move-clip` and
   `trim-clip`.
4. Write the grid with `set-beat-grid`: apply the report as
   `{op: "set-beat-grid", ...composition}` once the person has confirmed the
   downbeat. Any of the three fields may be given; one left out keeps its
   value. It moves the grid only; a template project's layout is not rebuilt.

## Director commands

`set-preferences {preferences}` replaces the project's explicit `selection`
(family, weights, execution, preferred agent) and/or `usage` (purpose, policy).
Use it only to remember requested project choices; null clears them to global
defaults. Read `genobi_project.preferences` first and preserve choices the user
did not change. Today's prompt can override these for one session without a write.
See `genobi-licensing` for the allowed values and precedence.

The studio mirrors the open Director project to the local server; the person
stays its owner and sees every change live. Commands are free and undoable in
the studio. Send one per call:
`genobi_director_command` with the `copyId`, the `baseRevision` you read and
one `command`.

| Command               | Fields beyond `op`                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `add-clip`            | `layerId` (new), `assetId`, `track`, `startFrame`, `durationFrames`, `name?`, `sourceStartFrame?` |
| `add-graphic`         | `layerId` (new), `moduleId`, `track`, `startFrame`, `durationFrames`, `name?`, `parameters?`      |
| `move-clip`           | `layerId`, `startFrame`, `track?`                                                                 |
| `trim-clip`           | `layerId`, `startFrame`, `durationFrames`                                                         |
| `set-placement`       | `layerId`, `position?`, `scale?`, `opacity?`, `rotationDegrees?`, `motion?`                       |
| `set-parameters`      | `layerId`, `parameters`                                                                           |
| `set-resolution`      | `width`, `height` (whole pixels; at most 1920 × 1080 pixels in total)                             |
| `set-beat-grid`       | `bpm?`, `beatOffsetSeconds?`, `beatsPerBar?` (at least one)                                       |
| `set-prompt`          | `text` (the earlier prompt brief)                                                                 |
| `set-global-prompt`   | `text` (up to 12,000 characters; empty clears it)                                                 |
| `set-clip-prompt`     | `layerId`, `text` (up to 1,200 characters; empty clears it)                                       |
| `set-clip-directions` | `layerId`, `directions` (`shot?`, `lens?`, `camera?`, `action?`; null clears one)                 |
| `set-preferences`     | `preferences` (`selection?`, `usage?`), or null to clear project defaults                         |
| `set-camera`          | `shotId`, `camera` (template projects)                                                            |
| `set-template-inputs` | `inputs` (`subject?`, `title?`, `acoustic?`)                                                      |
| `replace-plate`       | `layerId`, `assetId`                                                                              |
| `add-note`            | `noteId` (new), `frame`, `text` (up to 500 characters), `layerId?`                                |
| `resolve-note`        | `noteId`, `resolved?` (default true; false reopens it)                                            |
| `delete-note`         | `noteId`                                                                                          |

New clips need a new lowercase `layerId`; ids that must exist come from
`genobi_project`.

- `add-clip` takes `sourceStartFrame`, the in-point in source frames (audio
  and video only), so a shot is one command.
- `set-placement` sets framing: `position` (composition pixels from the
  centre, y down), `scale`, `opacity`, `rotationDegrees`, and `motion`, the
  end it moves to linearly over the clip (`scaleTo`, `xTo`, `yTo`,
  `opacityTo`), or `null`. A punch-in is `{scale: 1, motion: {scaleTo: 1.3}}`.
- `add-graphic` copies the settings of a layer already using the recipe,
  words included, with any `parameters` you give over them, for example
  `{parameters: {text: "MORPHING TWINS"}}`. A recipe no layer uses yet,
  including one from `registryRecipes` that the project does not hold, needs
  every name in its `required` list. `genobi_project` lists each recipe's
  parameter names, types and limits.
- Words drawn by a recipe are its parameters, so `set-parameters` changes them
  and the layer re-renders with everything else the same. The Dimensions
  mix's end card is the `end-card` layer (recipe `end-card`): `eyebrow`,
  `title`, `subtitle`, `credit1`, `credit2`, the construction `steps`
  (a slash with a space either side between them) and `done`, plus `font`, `color`, `accent` and the
  build's `duration` in seconds. To rename the credit:
  `set-parameters {layerId: "end-card", parameters: {credit2: "KOSHIMAZAKI MIX"}}`.
- `set-resolution` sets the composition size with Undo and revision checks.
  Use 960 × 540, 1280 × 720 or 1920 × 1080; for Match assets, measure the
  largest video and fit the composition's aspect ratio inside it and the
  pixel cap, using even dimensions. Positions and motion offsets scale;
  fitted zoom ratios stay the same. See [resolution](../../../../docs/director-resolution.md).
- `set-beat-grid` writes the composition's `bpm`, `beatOffsetSeconds` and
  `beatsPerBar`; see [Audio and the beat grid](#audio-and-the-beat-grid).
- `set-global-prompt`, `set-clip-prompt` and `set-clip-directions` write the
  direction, not media. A clip's words and its typed directions are separate
  fields: change the one the person asked about, and never rewrite their
  words because a menu changed. When the words and the directions disagree,
  say so and ask. `shot` is `wide`, `aerial`, `medium`, `close-up`, `insert`,
  `low-angle`, `crane-wide`, `pass-by` or `heroic-medium`; `lens` (a creative
  feel, not a model parameter) `14mm` to `200mm`; `camera` the
  `{shot-sizes, angles, movements}` terms `set-camera` takes; `action`
  `forward`, `arc`, `zigzag`, `rise`, `accel`, `decel`, `converge`, `hold`,
  `drop`, `impact`, `infinity` or `release`. Editing a prompt spends nothing
  and regenerates nothing: a new take still goes through the quote.

A parallel change is adding motion-effect modules (shake, transitions, grade,
speed lines, styled titles). Until it merges, use only the recipes
`genobi_project` lists.

### Revisions and conflicts

A `revision_conflict` means the person or another agent edited first. Read the
project again and decide afresh; never resend the same command blindly.

### Notes and the person's feedback

- `genobi_project` returns `notes`: the person's review pinned to a frame and
  maybe a layer ("move the HUD lower"). Act on each open note with the
  commands above, then `resolve-note {noteId}` so the person sees it done.
  Reply with `add-note {noteId, frame, text, layerId?}` when a note needs an
  answer rather than an edit; it is marked as yours.
- When the person has reviewed your edit, call `genobi_project_feedback`
  before your next command. It returns their changes since your last command
  as Director commands with labels in frames and beats ("title starts 12
  frames (0.82 beats) later"), the open notes, and `unmapped`: changes no
  command can express, with the reason. The changes are already in the
  project; do not send them again. Apply them to your own record of the edit
  (your source edit or plan) so the next pass keeps them, then act on the
  notes and resolve them. Each command you send starts a new round.

## Showcase projects: continue a recorded version

Some finished cuts are kept version by version in
`docs/director-bundle/showcase/<project>/`: `project-v<N>.json` per version,
`memory.json` (the versions, the owner's quoted corrections, checkpoints)
and a README timeline. To continue one, read its README and `memory.json`
first (the last checkpoint's `nextSteps`), have the person open the version
from the gallery card's **How it was made** list or
`/director?showcase=<project>&version=<N>&workspace=editor`, then link that
project (id `<project>-v<N>`) and edit it with the commands above. Record
each brief or correction with `decision` as an interpretation quoting the
person, and checkpoint each step. A finished change becomes the next
version as the
[showcase steps](https://github.com/koshimazaki/Genobi/blob/main/docs/director-bundle/showcase/README.md#for-agents-continue-from-a-version)
describe.

## In the browser

The Director's own command panel (**Agent command → Run command → Agent
receipt**) has browser-only commands such as `inspect`, `replace`, `frame`,
`cut` and `plate`; see the
[Director agent tools](https://github.com/koshimazaki/Genobi/blob/main/docs/director-agent-tools.md).
Over MCP, use the commands above.

## Rules

- Generation costs the person real money. Never call `genobi_submit` without a
  quote whose price the person accepted in this conversation, and never retry
  a submission with a new key. If the studio started you, you cannot submit at
  all: quote with `genobi_quote`; the quote appears in their studio with its
  plan and price, and they approve or decline it there.
- Never ask for, print or store a provider key.
- The person owns the project. Do not delete their work to make room; ask.
- Say what you actually ran. A quoted shot is not a made one, and a planned
  command is not an applied one.

## Before the project: Scrolls

To plan a character sheet or storyboard before any video exists, load the
`genobi-scrolls` skill. It covers `genobi_scrolls`: creating and editing the
scroll, timing it to a song, a quoted Klein request for the sheet, and the
hand-off of the chosen panels, which the person imports into this Director
project from Scrolls.
