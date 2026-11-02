---
tags: [director, templates]
summary: Make my version — swap media into a finished template's slots with Undo; new media is made in Camera and comes back through Assets → Generated. Nothing here generates.
---

# Make your version

**Swap only, 2 November 2026 (#57).** Template editing is content swap, not
regeneration and not character swap. A finished template keeps its
timeline, effects, crops, timing and soundtrack; the person swaps media into
its slots. No action in this panel starts an agent, a quote or a GPU job.
This replaced the earlier **Generate my version** panel with its generation
plan, **Generate replacement with my agent** checkboxes, preselected
replacement slots and **Prepare with Genobi** handoff.

Open an editable template in Director or Editor. **Make my version** opens
with it; reopen the panel from either workspace's header. Closing the panel
keeps the project. Switching between Director and Editor uses the same document.

## Swapping media

The panel derives its inputs from the template: character/reference images,
audio, cut footage and pictures inside graphics. Existing replacements and title
edits appear as the current inputs. For each slot, drop a file on its large
media box, choose one, pick a project asset or inspiration, or keep the default.
Audio can be previewed and picked from owned Camera results. Required kinds,
counts and duration checks preserve the current cut. Removing a reference also
removes its saved brief token in the same undoable edit; unrelated references
and the person's description stay intact.

- **Apply swaps** commits a local edit with Undo and keeps the panel open.
- **Apply swaps and continue editing** commits and closes the panel.
- **Save project ZIP** applies and downloads the editable project, which is how
  the hosted studio keeps uploads and edits.

A graphic's picture may change while its text and animation remain editable;
its image bytes travel in the saved project ZIP. **Advanced · description and
references** opens the optional brief after the media cards. It starts
collapsed; closing it keeps the text and bindings. Finished mixes show their
declared template direction, which you can edit; this is not a claim to know
the example footage's original generation prompt.

The main Director panel's **Your template assets** (`TemplateMediaInputs`)
shows the same slots inline. There, a slot also accepts a drag from the Assets
rail: a **Project** asset or a Camera result from **Generated**.

## Recreate in Camera

Each video and audio slot has one optional action that only navigates
(`src/director/recreate-in-camera.ts`):

- **Recreate in Camera** when the slot's current media carries a recorded
  prompt: a generated asset's own `generations[].prompt`, or, for Bloom's
  untouched bundled takes, the owner's recorded `BLOOM_PROMPT`. Camera opens
  and that prompt is typed into its prompt field. Bloom's character sheet is
  named in the button's title; attach it in Camera yourself, since the
  reference image and model settings are not restored.
- **Create in Camera** otherwise (Dimensions records cut points, not
  per-creature prompts; swapped-in uploads record nothing). Camera opens as it
  was; nothing is invented.

Neither generates, and neither swaps anything in. Camera owns the model,
settings, price and approval. A Ready result appears in the Assets rail's
**Generated** collection; return to the template and drop it onto the slot.

## Hosted editing

The hosted studio can apply swaps and save an editable ZIP. Uploaded media,
custom descriptions and timeline edits travel in that explicit project ZIP; a
link or account pairing does not transfer them. Project decisions and scoped
reusable preferences are available in the local Director under **Project memory
& taste**. See [shared project memory](taste-memory.md).

Agents remain available outside this panel: the agent API, MCP server and CLI
can still drive a project from a terminal ([Genobi CLI](genobi-cli.md)).
