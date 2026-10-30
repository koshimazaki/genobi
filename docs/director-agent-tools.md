---
tags: [agents, director, bundle]
summary: The agent commands over a Director project, with tracks and timing, the project drawer and animation references.
---

# Director agent tools

Project model/licence defaults use the existing revision-checked command:
`set-preferences {preferences: {selection?, usage?}}` replaces them and
`preferences: null` clears them. They are returned by `genobi_project`, persist
with the project manifest and participate in Undo/feedback. Session-only intent
stays in the prompt. See [licence-aware direction](licence-strategy.md).

The agent and human use the same `director.bundle.v1` project, trusted graphics registry and media bytes. In advanced mode, **Agent command → Run command → Agent receipt** is the supported agent interface. No new server endpoint or secret-bearing project format is needed. The [skill](https://github.com/koshimazaki/Genobi/blob/main/.agents/skills/director-remix/SKILL.md) describes browser operation.

| Command        | Required fields beyond `op`                                | Result                                                                             |
| -------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `assets`       | none                                                       | Detached asset list with roles and uses                                            |
| `import-asset` | revision, use (`production` or `reference`); attached file | Add media without placement; returns asset IDs                                     |
| `use-asset`    | revision, assetId, layerIds                                | Place existing media; references receive a production alias                        |
| `alias-asset`  | revision, assetId, use                                     | Retain bytes and provenance under the other role                                   |
| `remove-asset` | revision, assetId                                          | Remove only if no layer, plan or generation depends on it                          |
| `brief`        | none                                                       | Animation prompt and resolved asset/font references with relative paths and hashes |
| `inspect`      | none                                                       | Detached project snapshot including current revision                               |
| `text`         | revision, layerId, text (≤80 chars)                        | Updated graphics text, checked as `set-parameters` checks it; revision increases   |
| `replace`      | revision, layerIds; attached file                          | Atomic media replacement; same shot times/transforms                               |
| `split`        | revision, layerId, frame, newId                            | Existing Director split, preserving source/animation time                          |
| `project`      | revision, project                                          | Validated full JSON replacement with existing media hashes                         |
| `frame`        | revision, assetId, frame                                   | PNG plus exact source timestamp/dimensions receipt                                 |
| `cut`          | revision, assetId, in, out                                 | MP4 via dual editor; inclusive `in`, exclusive `out`                               |
| `plate`        | revision                                                   | Clean timeline MP4 without graphics, filters or soundtrack                         |

All indices are integers. `frame`/`cut` refer to the asset's decoded frame index (including VFR timestamps); `split` refers to composition frames. Cuts re-encode to the dual editor's output cadence, not packet-copy. Use its lossless tool separately if packet-copy/keyframe semantics are desired.

Unknown command fields are rejected. Writes require the current revision; the shared Zustand command entry reserves asynchronous writes and rejects stale results before commit. Mutations validate project shape, cross references and hashes before commit. Each success remains undoable in the timeline. `project` is a deliberate full manifest replacement: layer locks protect ordinary tools, not a user-authorized manifest import.

A ZIP contains `project.json`, referenced media and approved graphics files. A bare JSON import requires matching media already loaded. Download bundle and Render MP4 use existing Director controls; the command panel does not invent a second exporter. A generation result is applied only after explicit selection and records input/reference hashes, prompt and output backlinks. It excludes the provider key and provider job ID.

Limits: 150 MB bundle, 150 MB imported media, 128 layers, 1080p-equivalent pixel area, 120 seconds. These panel commands run in the browser only. Agents outside the browser use the Director command set (`add-clip` with an optional in-point, `add-graphic` with its parameters (a registry recipe the project does not hold included), `move-clip`, `trim-clip`, `set-placement`, `set-parameters`, `set-resolution` (width and height, at most 1920 × 1080 pixels; [resolution](director-resolution.md)), `set-beat-grid` (tempo, downbeat and beats per bar), `set-prompt`, `set-global-prompt`, `set-clip-prompt`, `set-clip-directions` ([prompts and directions](director-prompts.md)), `set-camera`, `set-template-inputs`, `replace-plate`, and the frame notes `add-note`, `resolve-note` and `delete-note`) over MCP, against the project copy on the local server, after the person presses **Link an agent** in this panel; see [the Director bundle](director-bundle/README.md#project-copy-and-director-commands).

## Template plans and provenance over MCP

Four MCP tools sit beside the Director commands; none spends, and all but the handoff only read.

| Tool                     | Arguments                                                                                                                          | Returns                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `genobi_template_plan`   | `template`, optional `inputs` (subject, title, aspect, bpm, acoustic) and `cameras` per shot id                                    | Each shot's exact `genobi_quote` arguments, length, start and expected price, from the `planTemplate` the Director opens                                                                                 |
| `genobi_budget`          | optional `runs` and `usd` for a whole recipe                                                                                       | Who pays (`payer`, `uncapped` for the owner's saved key), the runs and dollars the demo budget leaves this session today (`GET /api/budget`, local only), and whether the recipe fits                    |
| `genobi_provenance`      | `title`, `jobIds`, `agent` (harness, model, provider, open), `hardware`, optional `copyId`, `skill`, `workflows`, times            | The checked provenance card, its Markdown and a small gallery summary; outputs hashed from the studio unless `hashOutputs` is false                                                                      |
| `genobi_take_to_project` | `id` (a Ready job of this agent session) or `sourceId` (its own trim, concat, crossfade or space result), `copyId`, `baseRevision` | The asset id, copied into the linked project copy with its generation record (`POST /api/projects/<copyId>/takes`, local only), and a result's `derivation`; place it with `replace-plate` or `add-clip` |

A media tool's result (`genobi_media_trim`, `_concat`, `_crossfade` or `_space`, video or audio)
goes in by `sourceId` (`server/project-derived.ts`). Every source in its history must be the
agent's own media or a library clip, or the studio refuses it (`403 derived_foreign`); a frame
is a still and is refused. Its generation record carries a `derivation`: the operation and its
inputs in order, each with its kind, its origin (`take`, `upload`, `library` or `derived`) and,
when the project already holds the same bytes, that asset, which is also an `inputAssetIds`
entry. Hand the takes a cut was made from in first, so the project names them; the render
report then lists their models and notes any input from outside the project. No input's studio
job or source id is recorded; the asset itself is keyed by the result's id (`derived-<sourceId>`),
as a take's is by its job id (`take-<jobId>`).

The template skills in `plugins/genobi/skills/` use all four: plan, check the budget, quote, wait for
the person's yes, submit, hand the takes in and place them, then record the card. See
[Hermes runs](hermes-runs.md) for the card's rules and the run plan. Outside a template, the
`genobi-director` skill is the general approach: link the project, plan, then generate (with the
`genobi-camera` card for the model), hand takes in, cut to the beat grid from
`genobi_audio_analysis`, edit with the commands above and record provenance.

## Tracks and hand-corrected timing

A layer's optional `track` names the lane it sits on; without one, the layer owns a lane named by its own id, so older bundles read as one clip per lane. Clips on one track share a family (audio; video and image; graphics; filter), never overlap, and stay adjacent in `layers`, whose order is still the stacking order. Validation rejects a track that breaks any of these. A split keeps both halves on the original track.

Agents set timing by writing `startFrame`, `durationFrames` and `track` directly; they do not need the timeline UI. The timeline is where a person corrects or suggests that timing: drag a clip, trim it, or move it to another track, then Save JSON. An agent reading the saved project sees the new frames and tracks. Where the person would rather say than do, a frame note ("extend this title by a beat") pins the request to a frame and a layer in the project's `notes`; the agent reads it, acts, and resolves it.

**Feedback round trip.** An agent's command records its result as the agent's revision. The person then adjusts the edit in the Director and pins notes. `genobi_project_feedback` (or **Feedback** in the timeline header, which downloads or copies the same JSON) returns the person's changes since that revision as Director commands in order, each labelled in frames and beats, with the open notes and an `unmapped` list of what no command can express and why. The changes are already in the project: the agent applies the commands to its own record of the edit, so its next pass keeps them, then acts on the notes. Its next command starts the next round. An agent that hands over a bundle file instead marks its own revision by writing `feedbackBase: {project: <the manifest>, prompt}` into it. See [feedback for the agent](director-bundle/README.md#feedback-for-the-agent). Edits snap to whole composition frames. There is no beat or kick detection yet, so an agent cannot yet check a cut against the music itself.

## Regenerate from the Editor

The Editor (`workspace=editor`) has **Regenerate** beside **Render MP4**: a
compact field, "What should change?", floating under the file actions so the
toolbar does not move. It is a non-modal dialog (`role="dialog"`), so the
timeline's Space, Backspace, C and S stay off its buttons; Escape and Close
return focus to Regenerate. **Send** hands the instruction and the person's edits
to their agent, which works on the linked project again
(`src/director/regenerate.ts`, `RegenerateAction.tsx`, `useAgentSend.ts`).

The **Global prompt** beside Program has its own **Send to Genobi** under
the field (`GlobalPromptSend.tsx`), and the clip inspector has one beside its
CLIP INSPECTOR heading (`ClipPromptSend.tsx`). Both are exactly Regenerate's
Send, with the prompts as the instruction, built by
`shared/director/prompt-send.ts` within 1,500 characters
([what each Send includes](director-prompts.md#what-each-send-includes)).
Pressing either commits its field first, as leaving the field does. All three
buttons take the primary accent of Render MP4, and while a session started on
this project works they take Camera's Generate look, the ghost fill and the
moving edge (`generation-edge` in `composer.css`), so the main action reads
the same in every workspace. Every Send button reads **Send to Genobi**: the
studio is model-agnostic, so the agent set up on this server (Claude Code,
Hermes, Codex) is named only in the button's tooltip and in the outcome note,
and with none set up a hint says Send sets one up first.

Send runs in this order:

1. A session still running is left alone: the bubble shows it and the field
   keeps the words. Sessions take one turn each, so the person sends again
   once it finishes, or stops it. A start already under way from elsewhere
   (the bubble, the gallery) is not joined either (`spawnInFlight`): its
   prompt is not this instruction. A start the person closed mid-way is never
   reported as started.
2. A studio that keeps no project copy (the hosted one) says so and keeps
   Send off: an agent could not read the edits there.
3. The one spawn action (`spawnFromStudio`, [agent setup](agent-setup.md#spawn-the-agent))
   gets the agent ready: with no harness chosen or signed in, it walks the
   person through choosing and signing in one. Setup comes before the save
   on purpose: a person with no agent sees the setup, not a copy message, and
   the instruction stays in its field, so it is sent without retyping.
4. Once the agent is ready (the spawn's `writePrompt`), the copy must hold the
   current revision: Send waits, up to 30 seconds, on the same save the
   wordmark uses (`saveOpenCopy`, `leave-guard.ts`). A revision the local
   server refused is reported at once with the server's reason, since
   waiting cannot fix it; so are a server that did not answer, a reload that
   replaced the person's edit, and a page that never connected to the copy.
   Nothing is sent and the words stay in the field; the spawn's dialog closes
   rather than showing a failure.
5. The prompt (`shared/director/regenerate.ts`) is the instruction, verbatim
   between `---` lines (a line of dashes in it is bracketed), that this
   regenerates the linked project, and the edits in the feedback
   export's own form: the labelled Director commands since the agent's
   revision with their JSON, the open frame notes (fenced the same way), what no command can
   express, then the timeline by track with each clip's frames and in-point.
   It tells the agent to read `genobi_project_feedback` and `genobi_project`
   first, and stays inside the session's 4,000-character prompt limit by
   cutting a long list with a pointer to those tools. The instruction itself
   is capped at 1,500 characters. When the last session this page started
   was on the same project, the prompt names it as the next turn, with its
   status and summary; the project memory holds the rest. The session starts
   with the project's copy linked, looked up after the save.

Regenerate itself never quotes, submits or retries. The agent quotes each paid
step through its usual tools and the person approves it in the bubble, which
shows the session's progress as for any other start.

**Why a Send once said "did not reach the project copy in time" (29 October
2026).** The owner's local server had been started before the global prompt
existed. Its project validator refused every push of a project carrying
`globalPrompt` (400 `invalid_project`, "must NOT have additional
properties"); the copy sync keeps a refused revision unsaved and does not
retry it, so the save answered at once and Send called it slow. Send now
names the refusal and says to restart the local server (Restart local
server, or `npm run dev` again), which loads the current validator.
`tests/regenerate-copy-refused.test.ts` reproduces it against the real local
server wrapped to refuse as the older one did.

The file actions end with the way across: **Go to Editor ↗** in the Director
and **Back to Director** in the Editor (secondary buttons, the Director's own
`setAdvanced`, which keeps the shell's preset in step). On a phone the row is
a fixed grid of two columns and three rows, so both modes keep one toolbar
height; labels do not wrap.

Local evidence, 27 and 29 October 2026: `tests/regenerate-message.test.ts`
(the prompt from the project state and its limit), `tests/editor-regenerate.test.tsx`
(busy, a start under way, no copy, each unsaved reason, next turn and new
session, a cancelled start not joined, one start with the copy linked and no
generation request), `tests/regenerate-setup.test.tsx` (no agent: the chooser
before the save, then the same words sent; a refused save closing the
dialog; the Send to Genobi label; the Global prompt's Send; the header switch),
`tests/director-prompt-send.test.ts` (what each Send includes, its bound and
refusals), `tests/director-clip-send.test.tsx` (the clip inspector's Send),
`tests/regenerate-copy-refused.test.ts` (the 29 October reproduction),
`tests/regenerate-shortcuts.test.ts` (the timeline's keys off the field's
buttons) and `scripts/check-editor-regenerate.mjs`, run on 27 October at
1440, 768, 390 and 320 px. No real session was started from Regenerate.

## Offline project drawer

Normal and advanced views share one Zustand document, settings, selection and
Undo history. Project media separates Assets from Inspirations. Imported files
are not automatically placed; `use-asset` (or a named slot in the drawer) makes
that explicit. References remain in the ZIP but outside the render. Copying a
reference to content creates a production alias over the same bytes. Video
placement restarts at frame zero and rejects a clip shorter than its target.

Generated aliases retain their generation backlink. In-use assets cannot be
removed; inspect `uses` first. Unused production media is not decoded by the
composition renderer. Manual ZIP save is the recovery path; reload persistence,
cross-app shell integration and cloud sharing are not implemented by this slice.

## Animation prompt references

The optional `brief/prompt.json` sidecar preserves the user's prompt and stable
labels independently from the composition manifest. Referenced fonts accompany
it in `brief/fonts/`. `brief` resolves active labels against current project
assets and returns their role, kind, relative path and SHA-256. A missing binding
fails explicitly. Assets actively referenced in the prompt cannot be deleted.
The UI's brief ZIP includes `brief.json` plus all selected bytes, ready to extract
locally for an agent. This does not invoke an agent or provider, apply fonts to
layers, or imply browser uploads expose original absolute filesystem paths.
