---
tags: [director, templates]
summary: Make my version — swap media into a finished template's slots with Undo, or drop a reference and say what it replaces to start the agent with the template's skill. New media is made in Camera or by the agent, which quotes every paid step; the panel itself starts no paid job.
---

# Make your version

**Swap only, 2 November 2026 (#57).** Template editing is content swap, not
regeneration and not character swap. A finished template keeps its
timeline, effects, crops, timing and soundtrack; the person swaps media into
its slots. No swap in this panel starts an agent, a quote or a GPU job; the
one exception is [Make it with the agent](#make-it-with-the-agent), which
starts an agent session and still never a paid job.
This replaced the earlier **Generate my version** panel with its generation
plan, **Generate replacement with my agent** checkboxes, preselected
replacement slots and **Prepare with Genobi** handoff.

Open an editable template in Director and **Make my version** opens
automatically. In Editor, it waits for the header button instead; either
workspace can reopen it explicitly. Closing the panel keeps the project. Switching between Director and Editor uses the same document.

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

## Make it with the agent

**4 November 2026, the owner's decision:** "giving assets invokes it, like
user wants this image to swap with something, and text should be with what."
For a mix template whose skill ships in the Genobi plugin (Dance with Fruits,
Acoustic Spaces v2, Adaptive reverb and Bloom, listed in
`VERSION_AGENT_TEMPLATES`, `shared/templates/version-agent.ts`), the panel
has one optional drop zone and one **With what?** sentence ("Swap the apple
with this"). Genobi is voice-first: the sentence is a voice destination
("Version · with what"), and since the panel is modal the same mic as the
header's sits beside it and aims at it while the panel is open. A dropped
file is the person's reference: it steers the look and is not swapped into the
video. It is imported through the version-inputs path (an image as a reference
asset) and committed as one undoable edit. **Make it with the agent** waits for
the server's copy, then starts one agent session through the same spawn as the
gallery's Generate now, as `voice` when the sentence was dictated and `typed`
otherwise. The sentence alone ("make a papaya instead of the apple") is
enough. The first turn (`versionAgentPrompt`) names the template, tells the
agent to load the skill of the same id, names the reference by asset id and
file name when there is one, quotes the sentence verbatim with control
characters removed, and says every paid step is quoted and approved first.
A dropped image is kept as an Inspiration (`use: "reference"`), which the
adapters refuse as a generation input unless the request opts in
([project assets](project-assets.md)). Dropping it with a sentence is the
person asking for it in this request, so the first turn says the image was
offered explicitly as an input and tells the agent to set
`allowInspirationAsInput: true` on the quote and submit that pass it. A dropped
track or clip is production media and needs no opt-in.
With no agent set up, the button stays live and the spawn dialog walks the
person through choosing one. A studio that keeps no project copy disables it
and says why. When the open version has edits the panel asks first. The
Camera's **Audio Reactive · Layout to Motion** card, under the LTX models,
opens the Director on Acoustic Spaces v2 with this panel open; that route
renders on the hosted deployment the studio and the site share (Comfy Deploy
`genobi-ltx-world-v2`, which scales to zero between jobs).

## Recreate in Camera

Every slot (image, video or audio) has one optional action that only
navigates (`src/director/recreate-in-camera.ts`):

- **Recreate in Camera** when the slot's current media records a prompt. For
  a generated asset (`generations[]`), Camera is handed, as an ordinary edit:
  the registry entry that made it (`recipe.id`, so the same model and route
  are selected, for every ready entry: each LTX option, FLUX 3 video and
  image-to-video, FLUX 3 Image / Edit / Klein open and API, every MiniMax H3
  path, the Openjutsu swap, both upscalers, MiniMax Music and the Comfy
  Deploy entries), the prompt, and the image references and inputs read from
  the project's own files. A project video the run read (an upscale's or an
  H3 workflow's source) is not a Camera library clip, so it is named as not
  stored. A mix template's untouched bundled take restores what the
  template records for that slot in `mix.recipes`
  (`shared/templates/types.ts`, `SlotRecipe`): the still it started from as
  Camera's reference (after its shape guide, when the still was made from
  one), the still's own prompt when it was written down, and the preset,
  named in the notice ("Made from preset char-gorilla-explode; model and
  settings not stored"). Bloom (the owner's `BLOOM_PROMPT` and character
  sheet), Dance with Fruits ([what made each shot](fruits-swap.md#what-made-each-shot))
  and Acoustic Spaces v2 ([what made each room](audio-reactive-drop.md#what-made-each-room))
  record theirs. A part not written down is named, never filled in: a slot
  whose still prompt is unknown restores its still with "prompt" listed as
  not stored. A take's video render prompt is kept beside it as
  `renderPrompt` for the person to read; Camera does not restore it. A
  still that was not made as a still says where it came from (`source`, e.g.
  `"ltx-video frame"` names "First still taken from an LTX video"). No
  bundled take records which Camera model made it.
- **Create in Camera** otherwise (Dimensions records cut points, not
  per-creature prompts; Adaptive reverb is one continuous take; a room or
  take whose still could not be matched has no record; swapped-in uploads
  record nothing). Camera opens as it was and says "Settings not stored for
  this asset"; nothing is invented.

A slot with a record also shows its still in the version panel, a small
**First still** thumbnail (Bloom's says **Character sheet**) under the slot's
current media, with its shape guide when it has one and the preset beside it
(`src/director/SlotFirstStill.tsx`).
The stills are static files under
`public/media/director-templates/<template>/stills/<slot>.jpg`, 1360 × 765
JPEGs (the booth's 1920 × 1080), quality 90, each under 1 MiB
(`tests/template-slot-stills.test.ts`); they are not copied into the project.

For a FLUX 3 still, text-to-video or upscale, the recorded route also sets Camera's provider (BFL
direct or Comfy Router); with no route recorded the provider is named as
missing. Klein's open and API runs are separate models. Any other model's
route follows the connected key, so a run recorded on another route is named
rather than silently changed.

Camera's notice line says what was restored and what was not. Neither action
generates or swaps anything in. Camera owns the price and the Generate press.
A Ready result appears in the Assets rail's **Generated** collection; return
to the template and drop it onto the slot.

## Hosted editing

The hosted studio can apply swaps and save an editable ZIP. Uploaded media,
custom descriptions and timeline edits travel in that explicit project ZIP; a
link or account pairing does not transfer them. Project decisions and scoped
reusable preferences are available in the local Director under **Project memory
& taste**. See [shared project memory](taste-memory.md).

Agents remain available outside this panel: the agent API, MCP server and CLI
can still drive a project from a terminal ([Genobi CLI](genobi-cli.md)).
