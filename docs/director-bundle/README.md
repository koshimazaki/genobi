---
tags: [director, bundle, agents]
summary: The director.bundle.v1 interchange format, a JSON manifest with media files, graphics modules and their schemas.
---

# Director bundle v1

Selected first interchange format: **JSON + media files + graphics modules**.
The manifest is the timeline and asset index; the host evaluates modules and
composites their output. The first application importer, composer, preview and frame-exact MP4 renderer
now run at `/director`; see the [working-version guide](../director-working-version.md).

- [Project schema](schema/project.schema.json), [resources](schema/resources.schema.json), [layers](schema/layers.schema.json): JSON Schema draft-07; local `$id` references are identifiers, never network fetches.
- [Initial example](example/project.json): six-second, 320×180, 30 fps bundle.
- [Studio example](example/studio.json): 640×360 with image cuts, animated text, beat audio and CRT effects.
- [p5 rings](example/graphics/p5-rings.mjs), [Anime bars](example/graphics/anime-bars.mjs), [Three dither](example/graphics/three-dither.mjs): proposed host interface implementations.
- [Motion effects](motion-effects.md): shake, transition, grade, speed lines and a styled title, registered from [their worked example](effects/project.json).

```text
example/
  project.json
  media/test-pattern.mp4
  media/tone.wav
  references/palette.svg
  graphics/p5-rings.mjs
  graphics/anime-bars.mjs
  graphics/three-dither.mjs
```

The small synthetic media and palette are original test fixtures. No generation
service was invoked. The moodboard is a reference for the explicitly `not-run`
replacement plan, not the provenance of the synthetic video. `generations` is
empty; real generated assets must point to a generation record whose output IDs
point back to them. Media inputs and style references have separate ID lists.
A record may carry an optional `derivation` for a file the local media tools
cut, joined, crossfaded or spaced: the operation and its inputs in order, each
with its kind, origin (`take`, `upload`, `library`, `derived`) and, when the
project holds the same bytes, that asset, which must also be an input. It
carries no studio job or source ids.
Paths are bundle-relative; SHA-256 hashes identify exact bytes. Dependencies are
pinned by engine/version and must be provisioned by the host; this bundle does
not vendor p5, Anime or Three. Offline portability requires those runtimes too.

## Timeline and composition

| Layer             | Active frames | Seconds | Behavior                                                 |
| ----------------- | ------------- | ------- | -------------------------------------------------------- |
| Audio             | [0, 180)      | 0–6     | Separate mono tone, gain 1                               |
| Video             | [0, 180)      | 0–6     | Test pattern, contained in composition                   |
| p5 graphics       | [0, 180)      | 0–6     | Transparent rings, opacity 0.65                          |
| Anime.js graphics | [30, 150)     | 1–5     | Transparent revealing bars, opacity 0.85; locked         |
| Three.js filter   | [90, 180)     | 3–6     | Dither the current composite, amount 0.6; preserve alpha |

Intervals are half-open. Composition frame `f` has time `f / fps`; active layers
receive local time `(f - startFrame) / fps`. Source offsets also use composition
frames, so media seek time is `(sourceStartFrame + f - startFrame) / fps`, even
when the source frame rate differs. The host decodes media at that timestamp;
no implicit loop, speed change or video sound is permitted. Only audio layers
feed the audio mix. Mix at 48 kHz; v1 integer fps values divide 48,000, or sample
boundaries use nearest-integer rounding. Sum gains and fail export if clipping
occurs; limiting is a future explicit operation.

Array order is bottom to top, ignoring audio for visual stacking. An optional
`track` groups clips onto one lane: members share a family (audio; video and
image; graphics; filter), must not overlap in time and must be adjacent in the
array. A layer without `track` owns a lane named by its id. Start with
transparent black. Every graphics surface has full composition dimensions.
Video is aspect-fit centered on such a transparent surface. Scale and rotation
act around that surface's center; `position` translates it in composition pixels
(right/down positive; positive rotation clockwise). Opacity multiplies source
alpha. Composite with normal source-over in sRGB-encoded space. Use straight
alpha at module boundaries and normalize premultiplied Canvas/WebGL transfers
in the host. This explicit v1 convention is SDR, not a linear-light/HDR pipeline.

An overlay supplies new transparent pixels. A `filter` reads `composite-below`
and **replaces** that composite, so it cannot double-blend the image. This shader
mixes original and dithered RGB by `amount`, preserves alpha, and uses its local
time for pattern movement. Further layers can overlay its result. Apply the
manifest background only when flattening to opaque output such as MP4; retain
RGBA for an alpha-capable export. Validate alpha edges and pixel orientation
when the host adapter is built.

## Graphics module interface

```js
const layer = await module.createLayer({
  canvas,
  width,
  height,
  parameters,
  libraries,
  renderer,
});
await layer.render({ timeSeconds, inputTexture });
// Consume layer.output (Canvas or Three Texture) before the next render.
layer.dispose();
```

Host responsibilities:

- Instantiate one module per layer. Inject the exact engine version declared in
  JSON; validate `parameters` against its `parameterSchema` before invocation.
  Recreate on parameter/module changes, retaining layer IDs and placement.
- Supply a dedicated Canvas for p5/Anime overlays and a shared Three renderer
  for the shader. Filter input must be a texture in the same context, distinct
  from its output target. Raw shader textures use `NoColorSpace`; values at
  this boundary are already sRGB-encoded, without a second conversion.
- Control the clock, await rendering and decode readiness, and dispose resources.
  Seeking must reconstruct output without accumulated frame history. Do not
  let free-running loops, wall clocks or unseeded randomness determine export.
- Execute agent-authored code in an isolated render host with declared resources,
  time/memory bounds and no provider credentials. JSON/hash validation is not
  code sandboxing. The fixture checker is an offline developer tool, not an
  untrusted archive importer; upload limits, extraction and execution policies
  are separate implementation work.

p5 uses [an existing canvas](https://p5js.org/reference/p5/createCanvas/) and
[explicit redraw](https://p5js.org/reference/p5/redraw/). Anime animates numbers
painted into Canvas and uses [seek](https://animejs.com/documentation/animation/animation-methods/seek/)
with muted callbacks. Three uses a [ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
render target. The registered adapters now run together in the browser preview and MP4 export. Arbitrary DOM animation is not automatically a video
layer. The one registered exception is the Dimensions mix's `end-card`
recipe ([the end card](../dimensions-mix.md#the-end-card)): it runs the
construction effect in a private same-origin frame on an injected clock and
rasterises that frame into its canvas through an SVG image, so it needs
Chrome and the app's `/motion/construction/` files. Arbitrary font assets, keyframe tracks, masks, clip-to-clip transitions and native
Holo scene modules remain outside this first schema; the registered
[motion effects](motion-effects.md) cover transitions to and from a matte. Image placement can interpolate via
optional `motion` end values; `composition.bpm` supplies the snap grid.
Optional `composition.beatOffsetSeconds` (0 to 3600, default 0) puts a downbeat
on the composition, so the grid follows a song that does not start on a beat at
frame 0, and optional `composition.beatsPerBar` (1 to 16, default 4) sets the bar
lines. The offset is in seconds because it belongs to the song, not the frame
rate: a fitted downbeat falls between frames (1.30 s is frame 31.2 at 24 fps),
and a changed frame rate keeps it on the same moment. Bundles without either
field keep the grid from frame 0.

## Validation and next build

After the repository's normal dependency setup, run:

```sh
node scripts/check-director-bundle.mjs
```

The checker uses Ajv from the locked ESLint developer toolchain. It checks schema,
parameter schemas, IDs, source and composition bounds, generation backlinks,
reference roles, path containment and hashes, plus 16 invalid-bundle cases. It
never executes modules. Metadata such as duration still needs independent media
probing at import. Changing a module or media file requires updating its hash.

The working importer validates files before loading and checks registered recipe
capabilities. The composer supports save/reopen, locks, source replacement and
frame-exact export. Revision-precondition checks exist in the editing boundary;
there is no multi-user collaboration service. Next steps are broader renderer
parity testing, an isolated custom-module host and an optional Comfy node adapter.
Breaking format changes need a new schema version and explicit migration.

An optional `template` field records the house-style template and the inputs
that built the project (`id`, and `inputs` with `subject`, `title`, `aspect`,
and `bpm` and `acoustic` where the template reads them), so a reopened bundle
still knows its subject, tempo and room. It is additive; bundles without it are
unchanged. See [house-style templates](../templates.md).

## Frame notes

An optional `notes` array holds comments pinned to a composition frame and,
optionally, to one layer: the person's review of an agent's edit ("move the
HUD lower", "extend this title by a beat") or an agent's reply. Each note is
`{id, frame, layerId?, text, author?, createdAt?, resolved?}`. The schema
holds `id` to the bundle's id pattern, `frame` to a whole number from 0,
`text` to 1–500 characters with no control characters, `author` to `person`
or `agent`, `createdAt` to a UTC time as `toISOString` writes it, and the
list to 200 notes. `checkReferences` adds what the schema cannot see: ids are
unique, every frame is before the composition's end and every `layerId` names
a layer. The field is additive; bundles without it are unchanged and stay
valid, and a project whose last note is deleted drops the field again.

Notes live in the manifest, not in a file of their own, so Save JSON,
Download bundle (`project.json` is always written), Open bundle, the
standalone JSON import and the project copy keep them with no file of their
own; `saveBundle` writes `project.json`, the files the manifest names and,
once the project has an agent's revision, the derived `feedback.json` (see
[feedback for the agent](#feedback-for-the-agent)). Removing a layer in the studio keeps its notes at their frame
and drops only their `layerId` (`keepNotes`), so feedback is never lost
silently. Shortening the composition past a note is refused, as it is for a
layer. The rules are in `shared/director/notes.ts`.

## Feedback for the agent

The round trip: an agent edits the project; the person adjusts it in the
Director and pins notes; the agent reads back exactly what changed and what
was asked, as Director commands it can apply to its own record of the edit,
and acts on the notes. Its next command starts the next round.

An optional `feedbackBase` holds the **agent's revision** that feedback is
measured from: `{project, prompt}`, the whole manifest as it was (with no
`feedbackBase` of its own) and the project prompt then. The local server
records it each time it applies a Director command from the command route
(`applyAgentCommand`), and the studio records the same when the copy's stream
announces that command, so both hold one base. An agent's take handed in with
`genobi_take_to_project` records it too; the studio reloads that copy.
Opening a bundle records nothing: a bundle saved with a base keeps it, and an
agent that writes a bundle for the person to open marks its own revision by
writing `feedbackBase` itself, the manifest and its prompt as written (the
manifest carries no other sign of who wrote it, so a person's own bundles
stay as small as before). Undo keeps the newest agent's revision either state
holds, so undoing an agent's edit shows up as feedback rather than losing the
base.

The base is untrusted input like the rest of the file. Validation holds it to
the same project id, a revision no later than the project's, and every check
a manifest passes, its recipes included: each must be a registered recipe
with the registry's own parameter schema, since feedback replays commands
against it. The diff then uses the person's recipe definitions wherever the
base names the same recipe, so no pattern a base brings with it is ever run.

It sits in the manifest rather than in a file of its own so Save JSON,
Download bundle, Open bundle, the standalone JSON import, Undo and the
project copy all carry it unchanged, and the server records it in the same
validated write that applies the command. The two limits agree
(`src/director/manifest.ts`): the project without its base is held to 1 MB
as compact JSON, and the base to 1 MB of its own (`FEEDBACK_BASE_BYTES`); a
base over that is not recorded, and the project then has none. Save JSON and
Download bundle write the project indented with the base last on one line,
under the 4 MB file limit, so a project that opened always opens again. The
copy's push route takes 3 MB for the same reason.

`shared/director/feedback.ts` diffs the base against the current project into
an ordered list of existing Director commands: `move-clip` and `trim-clip`
(an in-point change is a trim to where the source lines up, then a move),
`set-placement`, `set-parameters` (text included), `replace-plate`,
`add-clip`/`add-graphic` for new layers, `set-prompt`, `set-global-prompt`,
`set-clip-prompt`, `set-clip-directions`, `set-template-inputs`,
`set-camera`, `set-beat-grid`, and the note commands. Each command is applied with
`applyCommand` as it is chosen, so the list applies in order to the base (with
any files the person added, which are listed below) and gives the person's
project back. Each carries a short label in frames and, when the composition
has a tempo, in beats and bars counted from `beatOffsetSeconds`: "title 変身
starts 12 frames (0.82 beats) later, at frame 249 (on bar 4 beat 4)", "HUD
moved down 40 px". What no command can express (a removed layer, a rename,
mute or lock, gain, a restacked layer, the frame size, rate or length, a
cleared tempo field, a new file,
or a change the base refuses, such as a move on a layer locked there) is
listed in `unmapped` with its reason; a final comparison of the replayed
project with the person's catches anything else, so nothing is dropped
silently.

```json
{
  "schema": "genobi.director-feedback.v1",
  "projectId": "signal-studies",
  "baseRevision": 2,
  "revision": 4,
  "commands": [
    {
      "command": { "op": "move-clip", "layerId": "photo-1", "startFrame": 72 },
      "label": "Orbit 1 starts 12 frames (0.8 beats) later, at frame 72 (3 frames before bar 2 beat 2)"
    }
  ],
  "notes": [{ "id": "note-kick", "frame": 60, "text": "Earlier, on the kick" }],
  "unmapped": []
}
```

`notes` are the open notes; `baseRevision` is null before any agent revision,
with no commands. `parseFeedback` reads a file someone else wrote: exact
fields, each command through `parseCommand`, labels and reasons up to 300
characters with no control characters, at most 2,048 commands and unmapped
entries and 200 open notes. **Download bundle** writes the feedback as
`feedback.json` beside `project.json` whenever the project has an agent's
revision, built afresh from the manifest each save; Open bundle ignores the
file and rebuilds it from `feedbackBase`. In the studio, **Feedback** in the
timeline header shows the summary (changes, open notes, unmapped), downloads
the JSON and copies it; over MCP, `genobi_project_feedback` returns it.

## Cut and mute state

Every layer accepts optional `muted` (default false). It suppresses that layer
in preview and export while retaining its source, timing and parameters. Locks
protect edits, but allow a mute-only toggle. Graphics and filters accept optional
`animationOffsetFrames` (default zero): recipe time is
`(frame - startFrame + animationOffsetFrames) / fps`. A split preserves media
source offsets, advances the right-hand recipe clock and divides placement
interpolation without changing any original frame's pose.

## Project copy and Director commands

On the local server the open Director project is also kept as a copy on disk,
under `.local/projects/`, one bundle per owner session and project id:
`copy.json` holds the manifest, the prompt brief, the revision and the linked
sessions, and `files/` holds every asset, recipe and prompt font by SHA-256.
The browser store stays the owner (`src/director/useProjectCopy.ts`): about
600 ms after an edit it uploads any file the copy lacks and pushes the
manifest at its revision, on top of the revision the server last accepted.
The server validates the manifest with the generated validators and the
prompt with the studio's own reader, checks every named file is stored, and
refuses a stale base with `409 revision_conflict` and the current revision,
so a person's edit and an agent's command cannot overwrite each other. A
page's first push of a project reads `GET /api/projects/:id` first
(`CopySync.openCopy`): when a copy exists (a reload, an earlier visit) the
page opens it in place. It says "Opened this project's saved copy" only when
the bundle is still the one the page loaded (`initialize`) and no edit came
while the copy was read. Otherwise (edits, an edit during the download, a
template the gallery committed) it says the copy replaced them and Undo brings
them back, and the leave guard and `saveCopies` stay unconfirmed. The
manifest read for that check is reused for the copy, not read twice.
It never pushes a freshly loaded template over the copy, which is what
answered 409 after a reload. Reads never answer 409; a conflict that still
happens on a push (another window, or an agent's command the page had not
applied yet) reads the copy in place, with the reason in the Director's
notice line; the page never reloads. When that replaced the person's edits,
the Director asks (Box 1.8, `CopyConflictQuestion`): the agent's revision is
open and theirs is in Undo; **Keep the agent's** leaves it, **Use mine** puts
their version back and pushes it over the agent's changes. Nothing replaces
the agent's changes without that answer, and an answer to a revision the
agent has since moved on asks again. The hosted Worker has no copy; the
studio finds no `/api/projects` there and mirrors nothing.

**The leave guard** (`src/director/leave-guard.ts`) asks only for work the
copy does not hold. Undo history alone is not unsaved work: `beforeunload`
reads `CopySync.isSynced()` (nothing waiting or out, the copy at the current
revision, no conflict reload since the person's last saved revision, and any
other project they edited saved where they left it) and stays silent when it
is true. It asks for a pending, failed or conflicting save, and always on the
hosted studio. It first blurs the focused element, so a field that commits on
blur (the notes, the Inspector's text fields) moves the revision and the guard
asks for it. Reloads the app causes save first: the wordmark, a stale chunk
(`reloadForStaleChunk`) and a restarted local server (`ServerRestart`) run
`saveCopies` for every project and reload without the dialog once it
confirms. In development, Vite's full reload awaits a `vite:beforeFullReload`
listener (Vite 6.4's client awaits it) that saves the same way but never drops
the guard itself: Vite also sends it for another HTML file and then does not
reload, so the guard keeps reading `isSynced()` at unload time. Generate now
and the Director's regenerate need only the open project saved. A dev server run from a checkout that other
sessions edit full-reloads whenever they change a file it cannot hot-swap;
test in a worktree of your own.

| Route (local only)                    | Who           | Does                                            |
| ------------------------------------- | ------------- | ----------------------------------------------- |
| `GET /api/projects`                   | owner, linked | The copies this session may see                 |
| `PUT /api/projects/:id`               | owner         | `{baseRevision, project, brief}`; 409 if stale  |
| `PUT /api/projects/:id/files/:sha256` | owner         | One file, stored only under its own hash        |
| `GET /api/projects/:id`               | owner, linked | Manifest, brief and revision                    |
| `GET /api/projects/:id/files/:sha256` | owner, linked | A file the manifest names                       |
| `POST /api/projects/:id/commands`     | owner, linked | `{baseRevision, command}`; 409 if stale         |
| `GET /api/projects/:id/feedback`      | owner, linked | Feedback since the agent's revision             |
| `POST /api/projects/:id/link`         | owner         | A one-use link code, valid ten minutes          |
| `POST /api/projects/link`             | any session   | Spend a code: this session may read and command |
| `GET /api/projects/:id/events`        | owner, linked | Server-sent `revision` events                   |

Another session gets `404` for every project route until the owner links it.
Linking is explicit: **Link an agent** under JSON editor & agent tools shows a
code, and the agent spends it with `genobi_link_project`. Each copy has its own
handle, `copyId` (`<project id>.<ten random characters>`), because templates
reuse fixed project ids and two owners can hold the same one. In `:id` the
owner may use the bare project id, which names only its own copy; a linked
session must use the handle that the link and the list return. At most four
linked sessions per project: a fifth link drops the oldest, whose open event
streams are closed at once (`server/project-streams.ts` checks every stream's
session on each change), so it hears nothing more. Sixteen copies per session
and 150 MiB of files per copy (`DIRECTOR_PROJECT_BYTES`), each file up to the
Director's own 150 MiB import limit (`DIRECTOR_MEDIA_BYTES`); the studio and the
copy read the same two constants, and every refusal names them. Files staged for the next manifest are counted
without the files the current copy holds, so replacing a 90 MB clip with a
20 MB one stages 20 MB; the manifest push then holds the files it names to
150 MiB, and files it no longer names are removed. A push refused for a
stale base or for passing the limit frees the files staged for it at once, and staged files whose push never came are
reclaimed after ten minutes (`server/project-staging.ts`), so abandoned
uploads stop counting. A first upload whose manifest never came stops
counting toward the sixteen copies after the same ten minutes: its
directory is removed before the cap is checked.
Writes count against a separate `edit` rate limit, not the paid `submit` one.

**Director commands** (`shared/director/commands.ts`) are the small, exact
vocabulary an agent, a voice prompt or a 3D gesture uses. `parseCommand`
refuses an unknown op, a missing or extra field, a wrong type, an id outside
the bundle's id pattern or a value over its limit; `applyCommand(copy,
command)` is pure and returns the next copy one revision on, or a refusal
saying why. The server runs it against the stored copy; the studio runs the
same function on its own store when the stream announces the command, so both
reach the same project. Both then record the result as the agent's revision
(`applyAgentCommand`; see [feedback for the agent](#feedback-for-the-agent)).

| Command               | Fields                                                                                                                                         | Effect                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `add-clip`            | `layerId` (new), `assetId`, `track` (id or `new`), `startFrame`, `durationFrames`, `name?`, `sourceStartFrame?`                                | Place a production asset on a track of its family; audio and video start at the in-point (default 0)                |
| `add-graphic`         | `layerId` (new), `moduleId`, `track`, `startFrame`, `durationFrames`, `name?`, `parameters?`                                                   | Add a recipe layer; `parameters` go over a using layer's settings, and an unused recipe needs all it requires       |
| `move-clip`           | `layerId`, `startFrame`, `track?`                                                                                                              | Move in time, or to another track of the same family                                                                |
| `trim-clip`           | `layerId`, `startFrame`, `durationFrames`                                                                                                      | New in and out; a left trim moves the source or recipe clock in step                                                |
| `set-prompt`          | `text` (up to 12,000 characters)                                                                                                               | The project prompt (brief text); references stay bound                                                              |
| `set-camera`          | `shotId`, `camera` (`shot-sizes`, `angles`, `movements`)                                                                                       | A template shot's camera, in its model's documented terms; rewrites that plan's prompt                              |
| `set-template-inputs` | `inputs` (`subject?`, `title?`, `acoustic?`)                                                                                                   | Template record, title layer and every plan prompt; frame and tempo stay studio-only                                |
| `replace-plate`       | `layerId`, `assetId`                                                                                                                           | Put an image or clip on a picture layer, keeping its place (the cross-kind path); a reference gets a `-plate` alias |
| `set-placement`       | `layerId`, `position?` (`x?`, `y?`), `scale?`, `opacity?`, `rotationDegrees?`, `motion?` (`scaleTo?`, `xTo?`, `yTo?`, `opacityTo?`, or `null`) | A video, image or graphics layer's start placement and the end its linear motion reaches (`visualAt`)               |
| `set-parameters`      | `layerId`, `parameters` (name to text, number or true/false)                                                                                   | A graphics or filter recipe's controls, its text included, checked against the parameters the recipe declares       |
| `add-note`            | `noteId` (new), `frame`, `text` (up to 500 characters), `layerId?`, `author?` (`person` or `agent`), `createdAt?` (UTC)                        | A frame note, pinned to a frame inside the composition and, optionally, to a layer (locked ones included)           |
| `resolve-note`        | `noteId`, `resolved?` (default true; false reopens it)                                                                                         | Mark a note done, or open it again                                                                                  |
| `delete-note`         | `noteId`                                                                                                                                       | Remove a note; the last one gone removes the `notes` field                                                          |
| `set-beat-grid`       | `bpm?` (20 to 300), `beatOffsetSeconds?` (0 to 3600), `beatsPerBar?` (whole, 1 to 16); at least one                                            | The composition's beat grid; fields left out keep their value. An audio analysis `composition` applies as is        |
| `set-global-prompt`   | `text` (up to 12,000 characters)                                                                                                               | The project's one primary direction (`globalPrompt`); blank text removes it                                         |
| `set-clip-prompt`     | `layerId`, `text` (up to 1,200 characters)                                                                                                     | That clip's own `prompt`; blank removes it. Never touches its directions                                            |
| `set-clip-directions` | `layerId`, `directions` (`shot?`, `lens?`, `camera?`, `action?`; null clears one)                                                              | That clip's typed directions; fields left out keep their value. Never touches its prompt                            |

A command that moves, trims or replaces a locked layer, retitles a locked
title, or sets a locked clip's prompt or directions, is refused, as in the
timeline. The prompt fields and their vocabulary are in
[prompts and directions](../director-prompts.md).

The note commands live in `shared/director/notes.ts`. Over MCP an `add-note`
is always the agent's: `genobi_director_command` sets `author: "agent"` and
`createdAt` to the time it sends. The studio's notes list sends the same
commands with `author: "person"`. `genobi_project` returns every note
(`noteId`, `frame`, `layerId`, `text`, `author`, `createdAt`, `resolved`),
so an agent reads the person's review, acts on it, and resolves each note.

`set-placement` and `set-parameters` live in `shared/director/layer-commands.ts`.
A placement field left out keeps its value: position is in composition pixels
from the centre (y down, within ±10,000), scale is above 0 and up to 10 (the
inspector's range), opacity 0 to 1 and rotation ±360 degrees. A `motion` given
in part keeps the rest of the current end, or holds the start where the clip
had none; `motion: null` stops the clip animating. `set-parameters` takes up to
32 names; each must be one the recipe's `parameterSchema` declares, with its
type (text, number, whole number or true/false), range, `maxLength` and
`pattern`. Text loses control characters and is at most 200 characters before
the recipe's own limit (80 for a title). Unnamed parameters keep their values.
The browser's `text` command uses the same rule. `genobi_project` returns each
clip's in-point, gain, placement (`motion` is null when it holds still) and
parameters, and each recipe's parameter schema, so an agent can review framing
and text before it changes them.

`add-graphic` (`shared/director/graphic-commands.ts`) takes a recipe the
project holds or one from the trusted registry it does not hold yet (the
modules of `docs/director-bundle/example/studio.json`, the same registry the
importer checks every module against). A registry recipe joins the project's
modules exactly as the registry defines it, so the importer's check still
holds; its file joins the bundle at the registry's path, and another file at
that path is refused. `parameters` are read and checked as `set-parameters`
reads and checks them (names the recipe declares, type, range, `maxLength`
and `pattern`) and go over the settings of a layer already using the recipe.
A recipe no layer uses yet has nothing to copy, so every name its schema
`required` lists must be given: `add-graphic {layerId: "lower-third",
moduleId: "caption", track: "new", startFrame: 30, durationFrames: 60,
parameters: {text: "MORPHING TWINS", color: "#f2f2f2", size: 48, bpm: 120}}`.
The server copies a registry recipe's file from the repository into the copy,
checked against its SHA-256 (`afterCommand` in `server/project-bundle.ts`),
and holds the whole copy to its byte limit, a file already staged for it
included. The studio applies the command in place only when its bundle already
names the recipe's file at that path and hash; otherwise, even with a file
at that path from an imported ZIP, it reloads the copy, which downloads the
recipe by its hash. `genobi_project` lists the project's `recipes`
and the `registryRecipes` it can still bring in, each with its parameter
schema and `required` names.

`set-beat-grid` (`shared/director/beat-grid-command.ts`) writes the
composition's `bpm`, `beatOffsetSeconds` and `beatsPerBar`, the fields above,
held to the schema's bounds (`BEAT_GRID_LIMITS`, which the studio's beat grid
fields use too). Each field is optional and at least one is given; a field
left out keeps its value. An audio analysis report's `composition`
(`genobi_audio_analysis`) has these names, so an agent applies it as
`{op: "set-beat-grid", ...composition}` once the person has confirmed the
downbeat. The tempo is kept at full fitted precision. It sets the grid only:
on a template project it does not rebuild the template, as the studio's own
fields do not. A person's change to these fields comes back in feedback as one
`set-beat-grid`.

**Layer cap.** A project holds at most 128 layers (`LAYER_LIMIT` in
`shared/director/types.ts`, read by the importer, the project copy, splits and
`add-clip`/`add-graphic`). It was 64, and a 26-shot, 21-second cut already
used 62 because flashes and mattes are layers. It was raised after a
measurement in headless Chrome on an Apple-silicon Mac: bundles of N
sequential 3-frame clips at 1920×1080 opened in the preview and rendered to
MP4. Opening (which every edit repeats, since the preview is rebuilt) took
0.24 s for 16 video clips and 0.39 s for 192, and 0.20 s to 0.31 s for title
layers. Rendering cost 45 to 48 ms a frame for video at 64, 128 and 192 layers
and 8 to 13 ms for titles, because only the layers active on a frame draw.
The JavaScript heap went from 74 MB at 64 video layers to 100 MB at 128 and
155 MB at 192. None failed. 128 leaves room above that measurement; it is not
a guarantee at every other maximum at once. A shot's camera is kept in an optional,
additive `camera` on its generation plan. `withShotCameras` puts it in the
plan the studio reads, so the shot summary, `projectPlan` and new template
inputs all use it, with the template's own move as the fallback.
`set-template-inputs` changes the title layer only when it names the title;
otherwise the layer's current words, which the headline field edits directly,
stay and are recorded as the title.

The studio's rules live in `src/director/project-copy-sync.ts`. When an event
arrives the studio applies it only if its own revision is the
command's base and nothing is waiting to be pushed; otherwise, and after a
refused push, it reloads the copy and says so in one line. The person's
version stays one Undo away. While a render or a file operation runs, the
reload waits until it ends; the studio checks again after the copy is read,
since one may have started meanwhile. A fresh page whose project already has a copy
meets the same conflict, opens the copy and starts listening to its stream.
A reload that finishes after the person opened another project is dropped;
the next push of the first project meets the conflict and reloads it then.
Answers can arrive out of order, so the studio keeps the newest server
revision it has seen from any source and never goes back: a reload whose copy
is older is discarded and read again, reloads run one at a time (a newer
request replaces a waiting one), a push waits until reloads are done, and a
push answer that arrives after a reload or an applied command does not move
what the studio believes the server holds. Events skipped while a push was
out still count: if one named a newer revision (the same project open in a
second window), the studio loads it once its push is answered. A push that
came due while a reload ran goes as soon as the reload ends, even if the
reload was dropped because the person opened another project. A read that
fails part way (another window removed a file between the manifest and its
download) does not strand a newer reload queued behind it; with none queued
it is read once more before the studio says it could not. A reload that
replaces edits the server never got always shows the notice, whatever asked
for it. Reloads read at most eight times in a round; a request still
waiting after that starts another round rather than being dropped. While a
conflict reload waits for a render or file operation, that project's pushes
pause too, since they would only meet the same stale base; they resume once
the reload has run.
