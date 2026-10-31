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
`set-camera`, `set-beat-grid`, `set-resolution`, `remove-clip`, `set-muted`, `set-gain`, and the note commands. Each command is applied with
`applyCommand` as it is chosen, so the list applies in order to the base (with
any files the person added, which are listed below) and gives the person's
project back. Each carries a short label in frames and, when the composition
has a tempo, in beats and bars counted from `beatOffsetSeconds`: "title 変身
starts 12 frames (0.82 beats) later, at frame 249 (on bar 4 beat 4)", "HUD
moved down 40 px". What no command can express (a rename or lock, a restacked layer, the frame
rate or length, a
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

See [project-copy synchronization and commands](project-copy.md).
