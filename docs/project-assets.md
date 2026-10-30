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
| Director render                    | Project, MP4; hosted: library too | **Add rendered video to assets**                      |
| An MP4 from this computer (Editor) | Project                           | **Import MP4 to project assets**                      |
| A video saved before this change   | Project                           | **Show earlier saved videos** → **Add**               |
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
  tab, the rail stays on Library so that line and its Undo stay in view;
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

## Saved videos

The Editor's former **Saved videos · import and store** panel uploaded to the
session's server-side library, a store apart from the project. It is now
**Videos · add to project assets**. Videos saved before stay where they were
(nothing is deleted); **Show earlier saved videos** lists them and **Add to
project assets** copies one in. Placing a video on a clip is a drag from the
Project tab onto the clip.

Where a render lives depends on where the studio runs. Locally the project
copy on this computer keeps the project's assets, so a render added there
survives a reload. The hosted site has no project copy: its project assets
last until the page reloads (download the bundle to keep the project). So on
the hosted site the button is **Save rendered video to library and assets**:
it first uploads the render to the visitor's private library (R2, through
`/api/uploads`, as before; saved videos can expire after 30 days), then adds
it to the project's assets for the session (`src/director/save-render.ts`).
The upload uses the page's connected key in its header only; it is never
stored or logged, and an uncertain upload is never retried.

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

## Agents

An agent hands its own take, or a video or audio media-tool result, into a
linked project copy with `genobi_take_to_project` (#140,
[agent tools](director-agent-tools.md)); that path has its own ownership and
lineage checks in `server/project-takes.ts`. An agent's still frame cannot be
handed in yet. The studio path on this page and the agent path both end as
assets in the same project.

## Checking it

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
imported MP4 in. **Add rendered video to assets** was not run in a browser; its hosted branch is covered by `tests/save-render.test.ts`.
`check-world-workspace.mjs` passed at desktop and phone. Three checks already
fail on `main` for reasons outside this page: the shell check's header
comparison in Ninja (the mic button moves when Ninja's configure button
appears), `check-dual-compact.mjs` at 390 and 320 px (it expects the side by
side pair that the compact mobile dock, 7464ab1, stacks) and `check-3d-tab.mjs` (it expects
the 3D camera plates where 3D now opens World Builder). The shell check's
other steps, these new ones included, passed with the Ninja header step left
out, and the Dual check passed at 1440 px.
