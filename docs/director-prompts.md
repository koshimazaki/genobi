---
tags: [director, bundle, agents]
summary: The Director's prompt contract - one global prompt per project, and per clip its own prompt and typed shot, lens, camera and action directions - in the bundle, the commands, the studio and what agents read.
---

# Prompts and directions

A project holds one **global prompt**, the primary direction for the whole
piece, and every clip may hold its own **prompt** and typed **directions**.
All are optional: a bundle without them opens unchanged, and a project that
never sets them saves without them.

## In the bundle

| Field               | Where       | Bounds                                                                                                            |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `globalPrompt`      | Project     | 1 to 12,000 characters (the prompt brief's limit); line breaks kept, no other control                             |
| `prompt`            | Every layer | 1 to 1,200 characters (one generation's description limit); line breaks kept, no other                            |
| `directions.shot`   | Every layer | `wide`, `aerial`, `medium`, `close-up`, `insert`, `low-angle`, `crane-wide`, `pass-by`, `heroic-medium`           |
| `directions.lens`   | Every layer | `14mm`, `18mm`, `24mm`, `35mm`, `50mm`, `85mm`, `100mm`, `135mm`, `200mm`                                         |
| `directions.camera` | Every layer | `{shot-sizes, angles, movements}`, each a term from `shared/camera.ts` or null                                    |
| `directions.action` | Every layer | `forward`, `arc`, `zigzag`, `rise`, `accel`, `decel`, `converge`, `hold`, `drop`, `impact`, `infinity`, `release` |

`directions` holds at least one field when present. The vocabulary and its
labels live in one module, `shared/director/directions.ts`; the schema
(`docs/director-bundle/schema/layers.schema.json`, `definitions.directions`)
enumerates the same ids, which `tests/director-prompts.test.ts` checks. The
schema holds shape, enums, lengths and characters; `checkReferences` adds what
it cannot see, that each camera term is one Genobi offers. Every path that
reads a project goes through that one validator: Open bundle, reopening a
saved manifest, the browser store's commit, the local server's project copy
(push and command) and the studio applying a streamed agent command. Nothing
outside these fields passes through.

The shot and lens labels come from the Editor timeline mock's pickers. They
are **creative direction**: no model takes a focal length, and no calibrated
optics are promised. `camera` is Genobi's own camera wording, the same terms
the composer and `set-camera` use ([camera wording](camera-wording.md)).

The prompt brief (`brief/prompt.json`, `set-prompt`) stays as it was and is
still read and written; the global prompt sits beside it as the primary
direction, so no earlier prompt, reference or Taste evidence is lost.

## Commands

The studio and agents edit these through three Director commands
(`shared/director/prompt-commands.ts`), parsed and applied by the same
`applyCommand` as every other command:

| Command               | Fields                                                           | Effect                                                                                   |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `set-global-prompt`   | `text` (up to 12,000 characters)                                 | The project's global prompt; blank text removes it                                       |
| `set-clip-prompt`     | `layerId`, `text` (up to 1,200 characters)                       | That clip's prompt only; blank text removes it                                           |
| `set-clip-directions` | `layerId`, `directions` (`shot?`, `lens?`, `camera?`, `action?`) | Each field given is set, `null` clears it, others keep their value; none left removes it |

Control characters other than a line break become spaces. A locked clip
refuses both clip commands, as it refuses a move. A prompt command never
changes the other field: a menu change keeps the words the person wrote, and
rewriting the words keeps the menu. None of them quotes, submits, plans or
regenerates anything. Regenerate and the **Send to Genobi** buttons (Global
prompt, clip inspector) hand the words to the agent, which quotes every paid step for the person to
approve ([Regenerate from the Editor](director-agent-tools.md#regenerate-from-the-editor)).

## Through edits

- **Split** keeps the prompt and directions on both halves; each is then
  edited on its own.
- **Duplicate** (`shared/director/duplicate.ts`) copies them to the new layer,
  which gets a new id.
- **Reorder** moves layers, never prompts: each stays on its layer id.
- **Undo** takes a prompt command back in one step, like any commit.
- **Remove** of a layer removes its prompt with it, under the existing undo.
  Removing an annotation view in the ported timeline must not remove prompts.

## What agents read

- `genobi_project` returns `globalPrompt` beside the earlier brief (`prompt`),
  and each clip's `prompt`, `directions` and `directionWords` (the directions
  in words) when it has them.
- A session started from the studio carries `direction` in its studio
  context ([picks and context](agent-context.md)): the open project's id, its
  global prompt (cut to 2,000 characters, with `globalPromptCut`, to keep the
  start inside 24 kB) and the clip selected in the Editor with its own fields.
  The server keeps it only when the project is the one the session is linked
  to. The reading guide tells the agent that the explicit current request
  outranks saved directions, and to surface a disagreement between a clip's
  words and its typed directions rather than choose one.
- `genobi_project_feedback` lists the person's changes to any of these as
  the three commands above.

## In the Editor

Until the timeline port lands, the Editor has a **Global prompt** field above
the timeline and a **Prompt** field in the clip inspector. Each commits its
command when the field loses focus, or when it goes away with a draft (another
clip selected, the inspector closed), so no words are lost. A change from
elsewhere (an agent's command, an undo) replaces an untouched field; over a
draft the person is writing it asks instead (**Keep mine** or **Use theirs**),
and a question left unanswered keeps the project's value. The inspector shows
a clip's directions in words; the visual pickers come with the port.

### Where to prompt

- **The whole piece**: the Global prompt, beside Program. Its **Send to
  Genobi**, under the field, sends the project's direction.
- **One clip**: select it and write in the clip inspector's **Prompt**. Its
  **Send to Genobi**, beside the CLIP INSPECTOR heading, sends that clip. To
  direct clip by clip, write a clip's prompt, send it, select the next clip,
  write and send again; the global prompt can be sent at any point.
- **Free words about anything else**: Regenerate, beside Render MP4.

Every Send button reads **Send to Genobi** whichever agent is set up (the
studio is model-agnostic; the tooltip and the outcome note name the agent).
Pressing one commits its field first. Each is Regenerate's Send
([Regenerate from the Editor](director-agent-tools.md#regenerate-from-the-editor)):
a running session is not interrupted, the person's edits are saved to the
project copy first and travel with the instruction, and the agent quotes
every paid step for the person to approve. No Send quotes, submits or
retries a generation itself.

### What each Send includes

The instruction is built by `shared/director/prompt-send.ts`, at most 1,500
characters (Regenerate's field limit), with a pointer to `genobi_project`
wherever words were cut. It carries ids, names, times and the person's words,
never asset files, provider job ids or visitor keys.

- **Clip inspector.** That clip: its id, name, kind and source (asset id, or
  recipe engine), its time range in seconds and frames, its typed directions
  in words and its prompt, which has first claim on the room. Then the global
  prompt as shared context in what is left, or a pointer to it. Refused, with
  a note, while the clip has no prompt; a locked clip's note says to unlock
  it first, since its Prompt is read-only (a locked clip that already has a
  prompt still sends). On a studio that keeps no project copy (the hosted
  one) Send is off, and the reason shows under the Prompt.
- **Global prompt.** The global prompt: up to 1,500 characters alone, up to
  700 characters when clip prompts follow. With no agent revision on the
  project yet, every clip with a prompt or directions follows, by start time,
  each cut at 240 characters. With one, the clips changed since it are
  **named** but not repeated, because their words already travel in the
  `set-clip-prompt` and `set-clip-directions` commands of the person's edits;
  a change no command could carry (on a locked clip) is listed in full.
  Unchanged clips the agent already has are not sent again.
- **Global prompt, left empty.** Not refused while any clip has a prompt or
  directions: it sends the clip prompts as above, and when nothing changed
  since the agent's revision it lists every clip's words, so the send is
  never empty. Refused only when there is no global prompt and no clip
  prompt or direction at all.

After a send, the clip's Prompt shows **Sent to Genobi · hh:mm** (this page
only; a reload forgets it), with **· edited since** once its words change.
The field stays editable, and sending again sends the new words. A Global
send marks every clip it listed or named.
