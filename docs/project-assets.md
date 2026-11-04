---
tags: [studio, director, world-builder, dual-editor]
summary: Every studio output lands in the open project's assets through one path - 3D takes and first frames, Dual Swords frames, rendered and saved videos, gallery results.
---

# Outputs into project assets

The owner's rule, 27 October 2026: **every output lands in the project's
assets, through one shared path.** The Assets rail shows them under
**Project** (production media) or **Inspirations** (references). Part of #18,
with the Dual Swords half of #14.

## One path

| Output                             | Where it lands                    | Action                                                |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------- |
| 3D World Builder take              | Project, MP4 (+ WAV)              | **Capture take** (automatic once captured)            |
| 3D World Builder first frame       | Inspirations                      | **Send first frame to Director**                      |
| 3D live clip, or a take again      | Project, MP4                      | **Add take to project assets** (Export take)          |
| A World Builder library take       | Inspirations PNG, Project MP4     | **Send to Director**, or an agent's `send-to-project` |
| Dual Swords frame                  | Project, PNG                      | **Export to assets**                                  |
| Dual Swords kept frame             | Inspirations                      | **Keep frame**                                        |
| Director render                    | Project, MP4; hosted: library too | **Add to project assets** on the finished video       |
| An MP4 from this computer          | Project                           | Drop it (or choose it) in the Assets rail's Project   |
| A gallery or Library result        | Project                           | **Send to Director** (+) on the card                  |
| A take from a terminal or an agent | Project                           | **Send to Director** (+) on its marked gallery card   |
| A Dual Swords Library item         | Project                           | **Send to Director** on the item                      |
| A Scrolls sheet or reference       | Inspirations                      | **Send to Director** on the result                    |
| A Scrolls panel or audio           | Project                           | **Send to Director** on the result                    |
| Any Scrolls result                 | Project                           | **Add to assets** on the result                       |
| A generated Scrolls result         | Project                           | Automatic, as it arrives                              |

In the studio, all of these call `addToProjectAssets`
(`src/studio/project-assets.ts`). It checks the output against the shared rule,
then imports it with the studio's own `import-asset` command, so the
Director's importer proves the bytes by decoding them (an image decoded, an
MP4 demuxed for its duration, audio read for its length; no magic-number
sniffing), deduplicates by hash, keeps it undoable, and pushes it to the local
project copy like any other edit. Afterwards the shell's
notice and the tool itself say which tab it is under, and the Assets rail
switches to that tab. The same bytes added twice keep one asset and say
"already in project assets". Media the studio already serves (a gallery result,
a saved video) is read through its owner-checked route first
(`addServedMediaToProjectAssets`, `loadSavedVideo`), never from a supplied
path.

The shared rule is `checkAssetMedia` (`shared/director/asset-media.ts`):
PNG, JPEG, WebP, MP4, WAV, MP3 or FLAC; one byte to 150 MiB (the Director's
`DIRECTOR_MEDIA_BYTES`, which also bounds a saved clip `loadSavedVideo` pulls in, so an
upscaled result fits; the whole project holds `DIRECTOR_PROJECT_BYTES`, also 150 MiB, and
every refusal names both from `formatMegabytes`); `production` or `reference`; and a filename with
control characters (`\x00-\x1f\x7f`) and folders removed, at most 100
characters, ending in the extension of its type. The bundle path keeps only
`A-Z a-z 0-9 _ -` of that name, as the Director's importer always has, cut
to its last 60 characters (`media/<asset id>/<name>.<ext>`). That kept name is
the asset's `label` in `genobi project` (`assetLabel`), so a World take sent as
`fall-wide.mp4` lists as `fall-wide`; a take an agent handed in by id is
stored under its id and has no label.

The simple Director's **Track** slot uses the same audio rule: a WAV, MP3 or
FLAC file dropped there is imported as production audio and replaces the
project's track, cut to the file's length and the composition
([templates](templates.md#make-it-yours-the-track-slot)).

Nothing here starts a generation. A first frame in Inspirations can be dragged
into Camera's reference tray (see below), quoted and approved as usual; the
result appears in the gallery, and **Send to Director** on its card takes
the same path. A finished Camera generation is not added to a project
automatically; a generated Scrolls result is (below). A take the Genobi CLI or
an MCP client made on this machine appears in the gallery once Ready, marked
**From terminal** or **From agent** (local server only), and its **Send to
Director** copies it like any other card, audio included; an agent linked to
the project can hand its take in directly with `genobi_take_to_project`.

## What Inspirations are for

The owner's rule, 3 November 2026, in his words: "inspirations are not gonna be
used, but be inspired from. You don't use them as an asset to generate, but as
an inspiration for structure or style." A Pinterest moodboard or a photo of a
cat goes under **Inspirations**; the person's own media goes under **Project**,
and a run is made from that.

- **An Inspiration is a style reference** (`use: "reference"`, role `style`).
  It may inform the style, palette, layout, mood, structure and wording of a
  prompt. Its pixels are not sent to a model as an image reference, a source
  frame, a swap source or any other generation input, so a run does not
  reproduce what is in it.
- **The exception is explicit and per request.** The person's own drag of an
  Inspiration into Camera's reference tray is that act: it is allowed, and the
  tray says "Inspiration used as an image reference for this run". An agent
  sets `allowInspirationAsInput: true` only when the person asked for it in
  the request it is working on; a brief or an earlier request is not consent.
  Make my version's **Make it with the agent** is such a request: an image
  dropped there with a sentence is offered as an input, and its first turn
  names the opt-in ([Director generate](director-generate.md#make-it-with-the-agent)).
- **Agents are told per reference.** `genobi_project` gives each asset a
  `role` (`production` or `style`) and `briefNotes`, one sentence for each
  Inspiration the brief names: "[Inspiration 2] is a style reference: describe
  what to take from it in the prompt; do not pass it as an image reference."
  The compiled brief (`resolveBrief`, the **Download brief + files** ZIP and the
  `brief` command) carries the same `role` and `notes`.
- **The adapter enforces it.** `projectImageReferences` in `genobi_quote` and
  `genobi_submit`, and a `projectAsset` staged with `genobi_deployment_stage`,
  are refused when they name an Inspiration without the opt-in, naming the
  asset and the rule. Production images pass unchanged.
- **A recipe image is checked where it is written.** `set-parameters` and
  `add-graphic` refuse an `asset:<id>` recipe image that names an Inspiration
  unless the command sets `allowInspirationAsInput: true`; with it, the recipe
  binds a production copy (the `-plate` alias `replace-plate` makes). Opening a
  project never refuses one, so a project saved before this rule with a recipe
  bound to an Inspiration still opens and edits.

The rule and its wording live in one portable module,
`shared/director/reference-role.ts`, so the MCP adapter, the CLI and the studio
cannot disagree. A World Builder first frame and a kept Dual Swords frame still
land under Inspirations; drag one into Camera's tray to make a run from it.

## Send to Director and Add to assets

**Send to Director** adds an item to the Director's project assets from where
it is, without opening the Director (27 October 2026, part of #16). It is on
every gallery and Library card (the former **Add to project**), on each item
of Dual Swords' Library (this studio's own media only: another origin is
refused before a byte is read), and on every Scrolls result: character sheets,
storyboards, panels and generated results. Scrolls results also have **Add to
assets**. Both go through `addToProjectAssets` or
`addServedMediaToProjectAssets`, so the rule, the hash deduplication and the
Director's undo history are the ones above (`src/studio/send-to-director.ts`,
`src/studio/SendToDirector.tsx`, `src/scrolls/to-project.ts`).

- The answer is "Added to the Director's assets · Project." (or
  Inspirations) or, for the same bytes again, "Already in the Director's
  assets · …". **Undo** beside a new add reverts that add through the
  Director's undo, and only while the project is still the one the add made;
  after any other edit it is gone, so it never reverts someone else's change,
  and it waits ("Can't undo while the project is busy") while an edit or
  render runs. On a gallery or Library card the answer is a full-width line
  under the card's actions, inside the card. Sent from the rail's own Library
  tab (Generated), the rail stays there so that line and its Undo stay in view;
  from anywhere else the rail moves to the tab the item landed in.
- Scrolls' **Send to Director** files a character or style sheet under
  Inspirations, where the Director's prompt takes references, and a panel or
  audio under Project. **Add to assets** always files under Project. The
  bytes are the scroll's own; the importer measures them again.
- **A generated Scrolls result lands under Project as it arrives** (the
  owner's "as it generates, to assets, the project"). It joins the scroll
  first; if the project refuses it (still opening, busy, over 150 MB) the
  Scrolls message says so and the result stays in Scrolls, where **Add to
  assets** can try again. On the hosted site, which keeps no project copy, the
  message adds that project assets last until a reload and the bundle is the
  way to keep them. Only a found project copy is remembered; a miss is asked
  again on the next result.
- The project asset shelves (Project, Inspirations, Manage) are the
  Director's assets themselves, so they have no Send to Director.

## 3D: Capture take and Send first frame

Before this change both buttons worked but neither reached the project, so
from the owner's side they did nothing:

- **Capture take** kept the take in the 3D panel only: a VP8 WebM behind the
  collapsed **Export take** fold, with the readout still saying "capture
  armed" and the only sign a status line under the footer. The Director
  imports MP4 only, so the WebM could not have joined the project as it was.
  Now the take is re-encoded to MP4 in the browser (`take-mp4.ts`, mediabunny
  over WebCodecs: H.264, else VP9 or AV1 in MP4, as the playblast) and added
  under Project, with the take's matching WAV when the scene has sound; the
  readout says "take captured" and names the assets. A take whose WebM is
  already over 150 MB is refused before encoding (download the WebM instead),
  and **Cancel adding the take** stops an encode; the take and its WebM stay.
- **Send first frame to Director** did add the PNG, but under Inspirations
  while the rail stayed on Project, and a second send of an unchanged scene
  (the same bytes) changed nothing while still reporting "added". Now the rail
  switches to Inspirations and a repeat says it is already there.

The capture length is shown in seconds and frames beside **Capture take** in
the footer, in the Capture panel's readout and as the Camera panel's active
shot, each with − and + in steps of 8 frames (9 to 241 frames, 24 fps). All
three are one control (`TakeLength.tsx`). The footer group keeps the bar's
height; at phone width it shares the row with Capture take.

Embedded as a scene adapter (`/scene-adapter`, or `/world-builder` inside a
frame), there is no project, so the postMessage hand-off is unchanged.

## Dual Swords: Export to assets and Save to disk

**Export to assets** adds the decoded frame as a PNG under Project; it no
longer downloads. **Save to disk…** is the former Save as: it opens the
browser's file picker where supported, with a download fallback. Keep frame
still files the frame under Inspirations and in the tab's tray.

## Into Camera

Camera's reference tray and the Image/Edit stage accept a drag from the
Assets rail (Project or Inspirations) or the Library, not only files from
disk (`studioDropFiles`, `src/studio/media-drop.ts`). The drag carries the
asset's identity; its bytes come from the open project. The provider's own
limits still apply, for example references need both sides at least 256 px.
An Inspiration dropped there is the person's explicit choice to use it as an
image, so it is kept, and the workspace says "Inspiration used as an image
reference for this run" ([what Inspirations are for](#what-inspirations-are-for)).

## Saved videos

The Editor's former **Videos · add to project assets** section was removed
on 2 November 2026 (#57, swap-only studio). An MP4 from this computer goes in
through the Assets rail's **Project** drop zone (or its file chooser), the
same validated `import-asset` path. Videos saved to the session library
before stay where they were (nothing is deleted) and show in the rail's
**Generated** collection with the other Camera results. Placing a video on a
clip is a drag from the Project tab onto the clip.

Where a render lives depends on where the studio runs. Locally the project
copy on this computer keeps the project's assets, so a render added there
survives a reload. The hosted site has no project copy: its project assets
last until the page reloads (download the bundle to keep the project). So on
the hosted site the finished video's **Add to project assets**
(`src/director/RenderToAssets.tsx`) first uploads the render to the visitor's
private library (R2, through `/api/uploads`, as before; saved videos can
expire after 30 days), then adds it to the project's assets for the session
(`src/director/save-render.ts`). The upload uses the page's connected key in
its header only; it is never stored or logged, and an uncertain upload is
never retried.

## Seeing and hearing project media

Project media can be watched and heard where it sits, in the **Project media**
dialog and in the rail's Project and Inspirations tabs (`src/director/MediaTile.tsx`).
The media takes most of each card; the name is one small line, cut with an
ellipsis, with the full name in the tooltip.

- **Video** plays muted and looping while the pointer is over the card or the
  card has keyboard focus, and goes back to its poster when it leaves. Nothing
  is loaded until then. When the system asks for reduced motion, a play button
  takes the place of hover playback.
- **Audio** has a small play/pause button and a progress line. Pause keeps
  its place.
- **Images** are shown whole.
- Only one preview plays at a time (`src/director/media-playback.ts`). Closing
  the dialog, hiding the rail, changing its tab or opening the lightbox stops
  it (the lightbox player then takes its turn), and object URLs are revoked when a
  preview stops.
- **Preview** (the corner button), or a double-click in the dialog, opens a
  lightbox of about 70 % of the window: video and audio with their controls
  and sound, never starting on their own; Escape or a click outside closes it
  and focus goes back to the card. In the rail a single click still opens the
  dialog, so there the lightbox is the Preview button only.
- A missing file shows **Missing file** and no player; a file that will not
  play says **Can’t play** and stops trying.

No new waveform analysis is added: the Director's waveforms belong to placed
audio clips and their ranges, not to assets.

## Expanded assets view

The owner asked, 3 November 2026, for "a nice expander, so you can actually
better see assets, click on them, see them in the light view... similar to
what we have in Camera". **Expand assets** (the icon beside **Hide assets** in
the rail's header) opens the rail as a full-screen gallery over the studio
(`src/studio/ExpandedAssets.tsx`). **Close expanded assets** or Escape returns
to the rail, with focus on the Expand control; the rail itself stays open.
Changing workspace or hiding the rail also closes it.

- **The same tabs as the rail**, and the same selected tab: Project,
  Inspirations and, outside Camera, Library. Arrow keys, Home and End move
  between tabs. Library is the rail's own gallery (Camera's cards, or Dual
  Swords' library), moved into the view while it is open and back after.
- **Project and Inspirations** show every file, not the rail's first 12, as
  Camera gallery cards (`src/studio/ExpandedShelf.tsx`): the poster, a kind
  badge, the name, and the same fact line the shelf shows ("Used · <track>",
  "Not placed", a source span; `src/studio/asset-facts.ts` is shared by both).
  Inspirations cards, in the view and in the rail, carry a **Reference ·
  style** mark. It is a label only: inspirations behave exactly as before.
- **The light view** (`src/studio/AssetLightbox.tsx`) is Camera's lightbox
  (`VideoLightbox`) for images and video, and a plain audio player for sound,
  with the kind, duration, measured size and the card's facts. **Previous** /
  **Next**, or the left and right arrow keys, step through the tab and wrap;
  a focused player keeps its own arrow keys. Escape closes the light view only.
- **Dragging** a card carries the rail tile's payload exactly
  (`writeAssetDrag`: project, asset id and hash, no bytes). Once a drag starts
  the view fades and lets pointer events through, so the drop lands on the
  prompt, slot or timeline beneath, as it would from the rail; it returns when
  the drag ends. A busy project refuses the drag, as the rail does.
- **Drop zones** in Project and Inspirations import files exactly as the
  rail's do (`importProjectMedia`, production or reference).
- **Phones** (700 px and under): the view starts under the tool dock, so the
  dock stays reachable, and is the only thing that scrolls.

- **Recreate or Use in Camera** (`src/studio/camera-handoff.ts`), the shared
  Recreate button as a card's action. It leaves the view, opens Camera and
  never generates:
  - **Recreate**, when the asset's own run recorded a prompt: the same restore
    a template slot's Recreate in Camera does (`generatedRecipe` in
    `src/director/recreate-in-camera.ts`): prompt, model and the images it read.
  - **Use in Camera**, when it recorded none: a PNG, JPEG or WebP becomes
    Edit's only reference (earlier references are cleared, so a Generate never
    sends one this asset did not choose); an MP4 is uploaded as Upscale's
    source, exactly as the Upscale drop zone uploads one
    (`src/upload-video-source.ts`), and selected. An upload is not a
    generation. Audio, SVG and other files get no control.
  - Camera's notice line says what happened. A newer handoff, a project
    switch or leaving Upscale while the upload runs wins over a late result.

## Agents

An agent hands its own take, or a video or audio media-tool result, into a
linked project copy with `genobi_take_to_project` (#140,
[agent tools](director-agent-tools.md)); that path has its own ownership and
lineage checks in `server/project-takes.ts`. An agent's still frame cannot be
handed in yet. The studio path on this page and the agent path both end as
assets in the same project.

## Checking it

- `tests/reference-role.test.ts`: the Inspiration rule, its brief notes, the
  compiled brief's roles and the tray's drop recognition;
  `tests/mcp-inspiration-input.test.ts`: the refusal through quote and submit,
  the explicit opt-in, and a production image passing unchanged.
- `tests/asset-media.test.ts`: types and aliases, control characters,
  folders, extension, length, size and use.
- `tests/project-assets.test.ts`: the tab a use names, the cleaned name and
  path, the repeat answer, refusals that leave the project untouched.
- `tests/send-to-director.test.ts`: added and already-there answers, one
  asset for a repeat, Undo of its own add only, the Scrolls use per role, a
  generated result under Project, the hosted caveat and a refusal that is said
  rather than thrown.
- `tests/project-media-tile.test.tsx`: hover play and release, one preview
  at a time, one sound at a time, reduced motion, the lightbox opened by
  double-click or Preview and closed with focus returned, a missing or
  unplayable file.
- `tests/save-render.test.ts`: on the hosted site a render goes to the
  library with the transient key before the project, a refusal adds nothing
  and an uncertain upload is not retried; locally nothing is uploaded.
- Browser: `scripts/check-project-media-preview.mjs` (rail hover playback,
  one sound at a time, the drawer's double-click lightbox with focus
  returned, reduced motion, and the phone drawer and lightbox at 390 px),
  `scripts/check-send-to-director.mjs` (a Scrolls result sent,
  undone and repeated, a Library clip sent, a generated result landing under
  Project; the API answered by the page, at 1440 and 390 px),
  `scripts/check-studio-shell.mjs` (Capture take, Send first frame,
  Keep frame, Export to assets, and a project asset dropped on Camera's
  reference tray), `scripts/check-world-workspace.mjs`,
  `scripts/check-3d-tab.mjs`, `scripts/check-dual-compact.mjs`.

Run on 27 October 2026 against a local dev server; nothing was deployed and
no generation was submitted. Capture take added a 105-frame take as a
4.375-second MP4 under Project; Send first frame added the PNG under
Inspirations and the rail switched to it, and a second send said it was
already there; Export to assets added a 640 × 360 PNG with no download, and
that asset dropped on Camera's reference tray (FLUX 3 · Image) became
reference 1 of 10; the Editor panel copied an earlier saved video and an
imported MP4 in. The finished video's **Add to project assets** was not run in a browser; its hosted branch is covered by `tests/save-render.test.ts`.
`check-world-workspace.mjs` passed at desktop and phone. Three checks already
fail on `main` for reasons outside this page: the shell check's header
comparison in Ninja (the mic button moves when Ninja's configure button
appears), `check-dual-compact.mjs` at 390 and 320 px (it expects the side by
side pair that the compact mobile dock, 7464ab1, stacks) and `check-3d-tab.mjs` (it expects
the 3D camera plates where 3D now opens World Builder). The shell check's
other steps, these new ones included, passed with the Ninja header step left
out, and the Dual check passed at 1440 px.
