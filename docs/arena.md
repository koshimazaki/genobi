---
tags: [workflows, agents, mcp, studio]
summary: Compare two to four workflow results in Project Tools, with shared playback, references and an agent-readable record.
---

# Arena

Open **Project Tools → Arena**. Results occupy the main surface; each approach's
prompt, model, workflow and observations expand from its chevron. The design uses
the Camera composer's type, spacing, borders and theme tokens. Arena is an optional
comparison workspace, so it stays under Project Tools rather than adding another
primary mode. Existing swap and JSON controls remain under **Workflow tools**.

## Compare

Create a comparison, name two to four approaches (loads), and generate them, upload
MP4 results or choose videos from Assets. The generator at the top holds the main
prompt, the references and the shared settings; each load's model is chosen there or
under its card's **Prompt & settings**. **Recorded as** keeps the model name or exact
checkpoint for a manual result; it documents the recipe and does not make an
unsupported generation route runnable.

Play, pause, restart and scrub the clips together. Players start muted; select one
speaker to listen to that result. Playback stops at the shortest loaded clip.
**Source end** seeks to the recorded guidance duration. Playback synchronization
uses browser timestamps with drift correction; it is not an exact decoded-frame
benchmark. Hidden workspaces and hidden browser tabs pause playback. Timeline text updates
at most ten times a second while video synchronization uses the animation clock.

**Play alone** on a card, or in the enlarged view, plays that one result with the
shared clock stopped and the others paused; **Play all** plays them together again.

Mark a preferred result and save observations. **Save changes** persists edits;
agent updates appear while the comparison has no unsaved local edits. A stale
revision refuses the save instead of overwriting another editor. Export record
saves JSON metadata; media remains in local storage and is not embedded in that
JSON export.

## Drag and drop

Drop media from **Assets** (Project, Inspirations or Library), a gallery card,
or the desktop onto an approach to make it that approach's result, or onto the
generator's **References** zone (or **Notes & source**) to add a reference. Results and references can be MP4
videos or PNG, JPEG and WebP stills. Drops resolve through the studio's own
`studioDropFile`, so they follow the same project and library checks as the
Director's drop zones, and the server measures the bytes again.

Drag a result or reference out of Arena onto any studio drop zone (a Director
slot, the timeline, the editor) or onto the desktop. Inside the studio it
carries a library id (`arena:<comparison>/<hash>`) that `useEditorAssets`
resolves from the owner-checked media route; outside it offers a download
link.

## Generate

The generator sits above the results. Write the **Main prompt**, drop references,
set the shared **Duration**, **Aspect ratio** and **Resolution** (and **Image size**
and **Image ratio** when a load makes stills), then choose a model for **Load 1**,
**Load 2** and **Load 3**. Video: LTX-2.5 Fast, LTX-2.5 Pro or FLUX 3 through Comfy
Router, or LTX-2.5 · Open workflow and LTX-2.5 · Acoustic Space as workflows on the
session's run location (Comfy Cloud, or the local ComfyUI). Stills: FLUX 3 Image
through Comfy Router, FLUX 3 Image Klein on BFL's API, or Klein as a workflow on the
run location, which costs nothing on a local ComfyUI. **Record only** keeps the load
as a manual result. Models that need a guide video or a start image (H3, FLUX 3
image to video) are not offered: a load carries only a prompt and still references.
Comfy Deploy entries are not offered either: Arena cannot stage their required
deployment inputs. Use local Camera for those runs and attach the finished result.

The Model menu is the studio's own list menu, not a text field with suggestions:
choosing a row sets the model at once, whatever the load held before. (The earlier
field was an `<input list>` datalist, which browsers filter by the text already in
the field, so other models only appeared after it was cleared.)

Each load runs with its own **Prompt override** when one is written, otherwise the
main prompt (`slotPrompt` in `shared/arena-run.ts`); its row says which. The camera
clause is off. The shared settings are fitted to each model with `fitControls`, the
Camera composer's own rule (`arenaRunInput`): LTX-2.5 Pro at 7 seconds, 4:3 and 4K
runs at 6 seconds, 16:9 and HD, while FLUX 3 takes them as chosen. The row shows the
fitted values and an estimate from `estimateRunUsd`, the function every quote uses;
a workflow on a local ComfyUI is quoted at nothing, which only the server knows.
Settings are saved with the comparison (`settings` in the draft); without them a
video load runs at 16:9 HD for the source duration rounded to whole seconds (at
least one), or five seconds.

References: stills not used as a result go to loads whose model takes references
(FLUX 3 Image on Router and Klein on BFL's API, up to ten images and 11 MB); the
zone says which loads receive them, and video loads run from the prompt alone.
Oversized, extra or unavailable references show beside the zone and refuse the run
before quoting rather than being silently omitted.

A saved run is checked after reload before its approach can run again. Pending
or unresolved runs block only their own approach; other approaches remain runnable.
A run the studio no longer knows (404: its record expired, or another session
submitted it) ends the check and shows why, so that approach can run again with
a new key; any other read failure keeps it blocked and is read again.
Polling is scoped to the selected comparison, so a late result cannot switch the
view back to another comparison or overwrite edits.

Image runs validate the complete reference set before quoting: at most ten images,
5 MiB each and the combined image request limit.

Runs go out together and run at the same time where the provider allows it:
Router runs in parallel; Comfy Cloud and a local ComfyUI work through their own
queue, so the second and third start as the first finishes.

**Generate all** runs every load with a model and a prompt that has no result yet;
**Generate** on a row, **Run** or **Run again** on a card, and **Generate with this
prompt** under a card's override run that one, and are the deliberate way to run a
load again. The confirmation marks a load that already has a result "replaces its
result". The studio quotes each load through `POST /api/quotes`
(`src/arena/quote-runs.ts`), asks once with each load's quote and the total, saves
each load's idempotency key in the comparison, and only then submits through
`POST /api/jobs` with the quote. Dismissing the question sends nothing. Runs join the studio queue and gallery like any other generation. Arena
reads each run every four seconds; a finished video is copied into its approach
(`POST /api/arena/:id/slots/:slot/result`, the session's own Ready run only),
so the comparison outlives the job's retention. The result it replaces is removed
from the comparison when no other approach shows it, so a replaced still does not
come back as a reference on the next image run. Copying waits while the
comparison has unsaved edits.

Nothing retries a submission on its own. If an answer is lost, the approach keeps
its key without a job; the next press reuses that key, so a submission that did
land is replayed instead of paid for twice. Choosing another model clears the key.
Agents choose models with `set_slot` and ask with `request_run`; the person sees
**Review and run**, which quotes and confirms exactly as Run does. Running or
dismissing clears the request.

## Agent and voice

**Ask agent** saves the comparison and supplies a one-use connection to the existing
local agent session. Other typed, voice, setup and pairing sessions keep their own
prompts; they do not save Arena or mint a connection code. This routes the request; it does not claim a tested
end-to-end model generation. The configured runner and a supported generation
workflow are still required. Paid operations use existing quotes and approvals.
Opening Arena, uploading media and editing a comparison never submit generation;
only a confirmed **Run** does.
Video Range requests use the media quota independently of history polling.

`genobi_arena` is available through MCP and the generic CLI (`genobi arena`).
Actions: `list`, `create`, `read`, `link`, `update`, `set_slot`, `add`, `upload`
and `request_run`. Use `genobi schema arena` for exact inputs, for example
`genobi arena --input '{"action":"set_slot","id":"…","slot":"rgb","patch":{"entry":"flux-3-image","prompt":"…"}}'`. Action-specific requirements are validated before any API call: `link`
requires a code; `update` requires an id, revision and draft. External agents pair through **Agent connection → Create one-use
code**; the code expires after ten minutes. A linked client can read and update
only that comparison and its media. It cannot issue another pairing code.

1. Link using `{"action":"link","code":"<code from Arena>"}`.
2. Read the returned comparison and its current revision.
3. Change an approach with `action=set_slot` (`slot`, `patch`). Bring in studio
   media with `action=add` (`sourceId`: an upload, a finished run's job id or a
   catalogue clip) or local files with `action=upload` (`filePath`). Either takes
   an optional `slot` to make it that approach's result in the same write.
4. Ask for runs with `action=request_run`; the person confirms in the studio.
5. For whole-comparison edits, update with the latest `revision` and the full
   `draft`. Re-read after every upload or conflict; never overwrite concurrent
   edits blindly.

HTTP uses the same contract: `GET/POST /api/arena`, `GET/POST /api/arena/:id`,
`POST /api/arena/link`, owner-only `POST /api/arena/:id/link`, raw media
`POST /api/arena/:id/files`, `GET /api/arena/:id/files/:hash`, and
`POST /api/arena/:id/slots/:slot/result` for a finished run,
`POST /api/arena/:id/media` for studio media by id, `POST`/`DELETE
/api/arena/:id/run-request`, and `?slot=` on file uploads.
Delete an unused comparison with **Delete comparison and files**. This requires
owner confirmation and permanently removes its uploaded media, revokes pairing
grants and releases its quota. A linked agent cannot delete the owner’s comparison.
`DELETE /api/arena/:id` uses the same ownership rule.

Media types and dimensions are checked from bytes. Arena MP4s allow up to 120
seconds, 4096 pixels per side and 8,847,360 pixels total. Images allow 16 megapixels. There are at most four
approaches, 24 media files / 256 MiB per comparison, 64 MiB per upload, 20 comparisons
per session and 200 total. Private media is served only to its owner/linked clients.
Malformed or truncated indexes disable Arena with a repair message and are
preserved; the rest of the local studio can still start.
Records and media persist locally; link grants expire on server restart. This local
adapter has no hosted Worker equivalent, so the hosted studio hides the Arena tab
and opens Project Tools on Workflow tools. There is no public share or deployment.
A media file is removed again when its index write fails, so it cannot hold quota unlisted.

## Layout and verification

Camera labels its library and outputs **Your generations** beneath the controls.
The workspace scrolls with the page; Assets remains a sticky side panel with
vertical overflow, without a separate scrollbar inside the main workspace.

`node scripts/check-arena.mjs` (against a Vite dev server, every API route a
fixture) checks the generator and the window at 1440 × 1000 and 390 × 844: the
model menu replacing a typed name, one quote per load with its own model and prompt,
the confirmation dismissed with nothing submitted, moving and resizing by pointer
and keyboard, the phone window filling the screen, Play alone and Play all, no
horizontal overflow and no page errors. Earlier local browser checks covered three
simultaneous clips, source-boundary seeking, adding/removing a fourth approach and
saving. Ownership, one-use pairing,
concurrent revision conflicts, uploaded media bytes, byte-range seeking and
persistence after restart are covered by tests. Desktop and phone layouts were
inspected; a paid end-to-end generation from Arena and voice generation remain
unverified.

## Enlarged review

Click a result or its expand button to review one video or image in a large
window. **Enlarge comparison** opens the whole set with shared Play all, Restart and
seek controls, and **Play alone** on each result. The original players pause on
opening; closing or pressing Escape returns to the same comparison at the reviewed
position, paused. Each enlarged video has its own audio toggle; only one is audible
at a time.

The window moves and resizes so the comparison behind it stays in reach: drag the
title bar or the move handle to move it, and the corner handle to resize it (mouse,
pen or touch). With a handle focused, the arrow keys move or resize it by 16 pixels,
64 with Shift; **Reset size** restores the opening size. It stays on screen, at least
320 × 260, and fits the screen again when the browser is resized
(`src/arena/window-frame.ts`). At 540 pixels wide or less it fills the screen and the
handles are hidden. Nothing animates, so reduced motion needs no change.
