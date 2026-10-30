---
tags: [director, storyboard, agents, mcp, sound]
summary: Standalone character sheets and storyboards, a reference-guided sheet generator, selected guidance handoffs, deterministic audio animatics, and bounded portable bundles.
---

# Scrolls

Scrolls is an optional, standalone visual planning workspace at `/scrolls`.
Character studies and storyboards share a prompt-first board: write one brief,
then click a cell only when a separate prompt, camera intention or action helps.
The header microphone targets the last visible Scrolls brief/cell you focused.
Director does not require a Scrolls step.

## Workflow inspiration

The author credits [Kōda / @aimikoda](https://x.com/aimikoda)'s character-sheet and
storyboard approach as an inspiration for Scrolls. His supplied examples also
inform the [VFX recipe shelf](vfx-recipes/README.md). Those credits describe
workflow lineage; no Kōda artwork or video is bundled with Scrolls.

## Planning and generation

The generator under the board is a prompt, a **Like these** reference row, the
Camera's image controls and one button per action. Every button only quotes;
nothing is spent until **Approve & generate**.

- **Character sheet → Generate sheet**: one run of the brief (for example
  "generate a character sheet like this one") with the references.
- **Storyboard → Generate board**: one run of the brief with the panels compiled
  under it, in order: title, timing when **Time to audio** is on, camera and
  action. The board UI is the guidance for what happens when.
- **Storyboard → Fill panels**: one run per empty panel, each from the brief and
  that panel's own text (and the references), each quoted with its own key.
  Each result goes into its panel if the panel is still empty. The approval
  shows the number of runs and the total estimate.

**Prompt the model gets** shows the exact compiled text before quoting, and the
approval repeats every prompt it will send. A button is disabled, and the
preview says why, when a run could not be recorded: the brief and panels over
4,000 characters (`PROMPT_LIMIT`), more than 48 assets, or a scroll past 64 KB
once every result the action would add is counted (a whole Fill batch
included). Nothing is quoted or paid for in that case.

**References.** Pick an image already in this scroll or a library example in
**Add reference**, or drag one in: a Scrolls result, a file, an asset of the
open Director project or a library item (the studio's shared drop reader). An
example is added as a style reference without changing the board's sheet. Each
reference is shown with the prompt it was made from as an example pair; the
bundled examples carry no recorded prompt and say "No prompt recorded" rather
than inventing one. The compiled prompt quotes each recorded prompt (up to 600
characters), then asks for a new sheet "the same way, changed to" the brief.
References are held to the server's limits: up to 10, each at most 5 MB, about
11 MB together.

**Models.** The menu lists every ready image and edit entry in the registry, as
the Camera's image menu does, with the same ratio and size choices and the same
refitting (`fitControls`) when the model changes. The default is FLUX 3 Image
Klein. Its **Run** choice is **Open · Comfy** (Comfy's Klein graph; text only,
see `kleinOpenControls`) or **API · BFL** (`POST /v1/flux-3-image-klein`, up to
ten references, a BFL key; [docs.bfl.ai](https://docs.bfl.ai/quick_start/pricing),
checked 21 October 2026). Open with references is refused with the two routes
that take them, Klein API or FLUX 3 Edit (closed, through Comfy Router, a Comfy
key; the route the anime teaser uses to redraw these examples). Nothing switches
model by itself. The hint shows one run's estimate from the same price table the
quote uses; the quote is the figure that binds.

**Results** land in Your generations as new assets: a sheet or board becomes the
board's displayed sheet, a cell run a candidate for that cell. A Fill result
whose panel was filled meanwhile also stays a candidate, and the message says
so. Each is named for its model and what it made, with the measured image's
extension (control characters stripped). It records the person's own prompt
(the brief and compiled panels, never the example pairs, so examples do not
nest) and `generation`: the registry entry and each reference's name and hash.
The prompt that was sent can be rebuilt from those, and the result can be an
example pair next time.

If a submission fails without a clear answer, its panel may still have
started. Scrolls names the panel, keeps its key, and Fill panels skips it until
the person checks Camera history and clears it. A generated result also lands in the open
project's assets under Project as it arrives; if the project refuses it, the
message says why and the result stays in Scrolls. Each result has **Send to
Director** (a character or style sheet under Inspirations, a panel or audio
under Project) and **Add to assets** (Project), neither of which opens the
Director; both say whether it was added or already there and offer Undo
([project assets](project-assets.md#send-to-director-and-add-to-assets)).
There is no automatic slicing: map regions by hand (below) to take frames from
a generated sheet. There is no single-image export that joins filled panels;
the animatic, MP4 export and Director handoff use them in panel order.

Camera and action pickers open
as overlays using Camera's controls and theme tokens, so opening a menu does
not move the board or composer. Empty directions display and use Locked/Hold.
Switching Character sheet / Storyboard keeps loaded images and cell edits.
Use the sheet's corner **×** or a result's **Remove** button to remove media;
cell prompts, directions and timing stay. Removing a source with derived crops
asks to remove those crops too, keeping saved lineage valid.

## Script and Describe the video

**Script** (beside Character sheet and Storyboard) shows the same scroll as a
plain text page in the board's place: the person writes what they want in
the video, up to 4,000 characters, kept in the scroll (`script`, saved with
the bundle; the `brief` command's `script` field). The board, its kind and
its images are unchanged; Character sheet or Storyboard goes back to them.

- **Use as Director prompt** makes the script the open project's main prompt
  (the project prompt, `prompt-brief.ts`) without opening the Director. It is
  one ordinary edit, so the answer ("Set as the Director's prompt." or
  "Already the Director's prompt.") carries **Undo** while nothing else has
  changed, as **Send to Director** does
  ([project assets](project-assets.md#send-to-director-and-add-to-assets)).
  References already bound in the prompt stay bound.
- **Describe the video → Send** asks Genobi to fill the panels (what happens
  when) from the description, or from the script when the field is empty.
  The prompt (`shared/scrolls/fill.ts`) fences the description (up to 1,500
  characters, as Regenerate's instruction; a longer script sends its first
  1,500, the prompt says it was cut rather than verbatim, and the Script
  says so after Send) and each example pair: the
  references picked under **Like these** with the prompts they were made
  from, or, when none recorded one, the Rooftop Escape plan from the library.
  It lists the panels as they are, names a one-use code, and always fits the
  session's 4,000-character prompt limit, cutting the panel list first.
  Each Send starts at most one session through the studio's one spawn action;
  a session still running or a start already under way elsewhere is shown,
  not joined.
- The agent calls `genobi_scrolls_panels` with the code and one entry per
  panel. The local server (`server/scrolls-fill-routes.ts`) accepts it only
  for the cells the Send named, checked whole (one line and the cell's limits
  for title, camera and action, 1,500 for a prompt, no control characters, no
  repeats), once. Only the tab that asked collects the panels, once; each is
  applied as an ordinary `cell` edit merged into the cell as it is now, so
  images, timing and regions stay. A new Send replaces the waiting one, and a
  request is forgotten after 20 minutes. The tab stops waiting when the
  session the Send started ends without panels ("Genobi finished without
  sending panels."), after one last read. The codes are compared in constant
  time (as World's pairing code now is), and the three routes count in the
  server's per-session ceilings: the writes as `edit`, the wait as `poll`. The panels land on the storyboard
  even when the person has switched back to it.
- The session spends nothing by itself: it fills text only, and any paid step
  goes through its quoted tools for the person to approve. The person edits
  the panels and presses **Generate board**, which quotes as usual.
- The hosted studio has no such route and says filling needs the local
  studio.

## What works

- One image request for a sheet or board, one per empty panel, or a separate
  request for a chosen cell. The existing quote, approval, idempotency and job
  lifecycle handles generation; a failed submission stops the rest of a Fill
  panels batch, says how many started, and is never retried. Results appear
  below the board; select favourites explicitly. Only Fill panels places its
  results, and only into panels that are still empty; otherwise assign an image
  to a cell separately.
  **View sheet** changes the primary whole-sheet view without changing selection.
- Select a planned cell to open its inspector. **Map region on sheet** draws or
  resizes a manual box, with numeric bounds available; each box is tied to its
  source image. Selecting a cell shows its overlay on the whole sheet, never an
  inferred crop. **Use reviewed region as frame** explicitly extracts those bounds
  into a new panel candidate with source/bounds lineage; select it separately for
  handoff. Imported old documents remain valid without mapped regions.
- **Prepare region edit** builds a source-bound edit draft. **Open FLUX 3 Edit**
  explicitly loads the existing API editor with the source and region guidance;
  it submits nothing. Open Klein editing is unavailable in the current adapter.
  There is no automatic switch from the open workflow to a paid edit model.
- Klein open workflow is the default. It currently accepts text only. Reference
  conditioning requires explicitly choosing Klein's API run or another model
  that takes references. Quote errors remain visible; there is no silent
  paid-model fallback.
- Imported image/audio files and generated images persist through **Save bundle**
  and **Open**. The ZIP contains a bounded revisioned `scroll.json` and hashed
  media. JSON alone needs the corresponding media already open. Browser refresh
  does not save this workspace automatically. In-flight jobs remain in Camera
  history; collection into Scrolls requires the open session.
- Optional audio analysis proposes tempo. Changing BPM does not move cuts until
  **Fit cells to 4 beats** is selected. The optional timeline shows image, camera,
  action and decoded audio waveform on one measured time scale. Move or trim any
  visual block to edit the linked cell interval; overlapping groups ripple right.
  Beat snapping uses the editable beat origin; Alt-drag uses individual frames.
  Arrow keys move and Shift-arrows trim, with numeric start/hold controls too.
  Audio has editable timeline start and source in-point. Timing is integer video
  frames; a source-sample mapping appears only with a measured decoded sample rate,
  and does not claim sample-accurate video editing.
  The animatic uses the existing Director renderer, audio clock and MP4 exporter.
  It holds still images at deterministic frame boundaries; camera/action text
  remains guidance. Only assigned panel-role images appear in playback.
  Camera/action controls wrap into readable rows on narrow screens. The timed
  tracks scroll horizontally instead of shrinking every cell to fit a phone;
  swipe the ruler or focus the track region to scroll without moving a clip.
- **Open in Director** creates a separate Director draft and returns a placement
  receipt. Selected character/style references remain off the timeline. Accepted
  timed panel-role images and attached audio receive layers. Existing drafts
  from the same scroll are protected from overwrites. Untimed sheets remain
  reference assets in the new project. A muted transparent fixture supplies the
  required empty Director stage; references are never placed on screen implicitly.
- **Use in video** prepares role-labelled guidance with ordered cells. Today's
  video composer accepts text only; the explicit LTX button copies a text brief
  and submits nothing. It does not pretend to send multiple reference images or
  an animatic to a model. Keep the media bundle for a compatible workflow.
- **Export agent handoff** exports the handoff JSON and media bundle. It does
  not resume a live agent. `genobi_scrolls` performs the same validated document
  edits and returns a document to save/open; it is a stateless MCP operation.

## 3D storyboard from World Builder

**Four Rooms** in the library is a storyboard blocked in 3D: eight World
Builder recipes (`custom_nodes/director_world_builder/examples/storyboard/ninja/p01…p08.json`),
one animated mannequin, laid out like the Sky Gate sheet. Each panel's text
gives its shot, beat, camera path, action path, rhythm and escalation; each
recipe sets the room or field, the character's clip and a named camera shot,
17 frames at 24 fps, 1024×576. `scripts/capture-ninja-storyboard.mjs` captures
them headless (colour, depth, every frame) and writes the first frames to
`public/scrolls/ninja/` and the contact sheet the library shows.

**Use storyboard plan** loads the panels and adds each first frame as an
uploaded style image tied to its panel (`cellId`). Any run for that panel,
Fill panels or the panel's own Generate, sends its frame first, with words
asking to keep the frame's camera, framing, pose and set and redraw the
stand-ins (`shared/scrolls/panel-frames.ts`); the board's **Like these**
references follow and a frame is never sent twice. It is the same quote,
approval and one submission per panel; there is no separate route. Klein's
open graph takes text only, so choose Klein · API or FLUX 3 Edit; the
refusal names the panel. Edit can draw from the frames alone. Results record
the frame by name and hash; the recorded prompt stays the person's own text.
Edit a recipe, recapture and replace a panel's frame to re-block it. The
library thumbnail is a capture, not an AI-generated sheet.

## Agent workflow

The plugin's `genobi-scrolls` skill teaches this to agents.

Call `genobi_scrolls` with `action: create`, a stable `id`, `kind` and `count`.
Inspect its returned document; issue `edit` with that document and a command
containing its current `revision`. Commands are `brief` (prompt/name/sheetAssetId), `cell`
(full cell, including optional integer startFrame and source-bound region), `select` (asset IDs), `timing` (partial timing), `resize` (count),
and `add-asset` (validated asset metadata with a matching media file).
A region uses `{assetId, box: [top, left, bottom, right]}` with integer 0–1000
coordinates and at least 1% extent. `derivedFrom` records the same source/bounds
on an explicitly extracted image. `timing` optionally stores beatOffsetSeconds,
audioStartFrame and sourceStartFrame. Intervals may have gaps but cannot overlap;
hand-offs sort cells by their actual start frames. Timing is optional for both
character and storyboard documents.

When a Scrolls Send started the session, `genobi_scrolls_panels` writes the
panels into the person's open scroll by the prompt's one-use code (above). It
is the one Scrolls tool that reaches the browser, and it writes text only.

Use `action: retime` with the current `revision`, `cellId`, target integer `frame`,
`mode: move|left|right` and `snap: frame|beat` to use the UI's linked interval and
collision rules atomically. It returns a revised document, never submits a job.

Use `image-request` for the whole sheet or `cellId` for one cell. The returned
Klein request can be quoted with `genobi_quote`; obtain approval before submitting
with the existing quote/idempotency tools. The document command never generates.
Imported JSON must name actual media already present in the matching bundle;
metadata alone is not a fabricated generation result.

After the person chooses candidates, use `handoff` with their selected IDs and
a destination. The result preserves asset roles, stable IDs, hashes, accepted
cell assignments, cut order, and the document revision. It is a portable plan;
the browser's Director button performs the actual project import and read-back.

## Boundaries and references

Documents allow 1–16 cells, 48 assets and 64 KB of JSON. ZIPs are bounded at
100 MB before/after decompression; media paths are confined, hashes and measured
image/audio types are checked. Images are at most 32 MB/16 megapixels; audio at
most 50 MB/20 minutes. Animatics are at most two minutes. Unknown command fields,
stale revisions, missing references and unsafe paths are refused.

The curated example library is separate from imported assets. Every example
except the Four Rooms capture is AI-generated, and each file keeps its signed content credentials (C2PA): six
sheets from OpenAI's image API and the simple creature from FLUX.3 through BFL's
API. The library labels each one that way.
Importing an example adds a whole-sheet style reference, not individually sliced
frames. **Add to assets** in the example's lightbox copies the same file into
the open project's assets under Project, as a result's **Add to assets** does,
without adding it to the scroll; Undo is offered while nothing else has edited
the project. All six original references remain, plus Rooftop Escape. **Use storyboard
plan** starts Sky Gate or Rooftop Escape with editable shot titles, camera and
action defaults authored from the reference. It keeps the sheet as one image;
it does not infer crops or extract directions from arbitrary imported images. There is no automatic grid slicing or claiming printed labels as exact
model controls. The supplied library includes character, creature and mecha studies. Dedicated
vehicle-only and creature-with-vehicle source examples are not yet included.
Creature, vehicle and character studies use the same editable
cell structure; no new form is needed for each subject.

Deferred: server-backed live Scrolls sessions, resumable agent approval, automatic
sheet slicing, timed camera simulation, and image/video-conditioned LTX workflow
submission. Those require explicit contracts rather than extra UI switches.
