---
tags: [director, dual-editor, agents, mcp, verification]
summary: Dual Editor, the browser-local two-frame workspace, with its controls, decoding boundary and verification.
---

# Dual Editor

Open **Dual Editor** from the studio header, or visit `/dual-editor`.
This is a browser-local frame workspace. It needs no provider key and sends no
video bytes to the server. Choose or drop one video into each viewer.

## Controls

- The viewers stay side by side. Narrow screens scroll the pair horizontally.
- Frame position opens by default; Luma distribution has its own collapsed
  section. Frame/time readouts and export stay visible. Controls use compact
  spacing, with larger touch targets on phones. Fold transitions respect reduced motion.
- Assets opens a side drawer (above the viewers on narrower screens). Reuse
  library clips, session sources, or files opened in this tab with drag-and-drop
  or Load A / Load B. Refresh reads Director's existing `/api/history`; returning
  to the tab refreshes it too. Up to 20 local File references are retained, and
  downloaded Director clips use a 512 MB cache. Downloads above 512 MB should
  be opened as local files. No cross-origin asset fetching is allowed.

- Each side has an independent zero-based frame index and presentation timestamp.
- Drag the tick fader, focus it and press Left/Right, click ±1, or enter a frame number.
- Full spans the clip. 120f and 24f magnify a window around the selection; the
  smaller overview above it can move anywhere in the clip.
- The ±1 controls move only their own viewer, clamped at its ends.
- Alignment guides overlay thirds and a centre mark. Fit / 100% / 200% controls
  the viewer; scroll the image at pixel zoom. Neither affects the exported image.
- The histogram and mean/black/white readouts compare sampled sRGB luma.
- Export to assets adds the selected frame, at its decoded display dimensions,
  to the project's assets under Project; it does not download
  ([outputs into project assets](project-assets.md)). Save to disk… uses the
  browser file picker when available, with download fallback. Outside the
  studio, the export button is Export PNG and downloads.
- Keep frame retains up to 12 PNG assets in the current tab. Download them from
  the tray; export a JSON manifest for source filename, frame index, timestamp,
  slot and dimensions. Reloading clears clips and the tray.

## Component and decoding boundary

`src/dual-editor/DualEditor.tsx` exports `DualEditor({ onCapture? })` for embedding.
The optional callback receives a `FrameAsset`, including its PNG Blob and timing
metadata, when Keep frame is used. The default page supplies navigation and theme.
`FrameSource.open(file, signal, progress)` indexes encoded packet timestamps with
Mediabunny. It sorts presentation order (including reordered B-frames), and
`decode(frame)` retrieves and verifies the decoded timestamp before returning a
full-resolution sRGB canvas. No constant-FPS estimate or HTML video seek is used.
File reads are lazy. Slots serialize decoding and discard stale selections and
replaced-file results; source inputs and samples are disposed on replacement or
unmount. Export remains disabled until the selected frame has decoded.

MP4, MOV and WebM support depends on the browser's codec decoder. Unsupported,
empty, malformed or ambiguous-timestamp files fail explicitly. Limits: 4 GB per
file, one million indexed frames, 40 megapixels per decoded frame. PNG is an
8-bit browser-rendered sRGB asset, not an HDR/raw or mastering export. Rotation
and pixel aspect ratio are applied. Scopes are sampled and not calibrated video
scopes; black is luma ≤ 1 and white ≥ 254 on a 0–255 scale.

## Brief captured

1. Two video drop zones and simultaneous viewers.
2. Individual frame selection and exact one-frame movement.
3. Compare brightness, levels and positioning.
4. Flux Studio Lite tokens and the existing tick-fader design.
5. A magnified timeline for precise selection.
6. Full-resolution PNG download and destination choice where supported.
7. A reusable Camera Director component and kept frames as downstream assets.
8. Working name: Dual Editor. Future MCP integration should adapt the frame
   source and asset contract; no MCP server is installed by this change.

Current brief: independent position and scope folds, a fixed side-by-side pair,
and a collapsible Director asset drawer with reusable videos.

The first release is local. MCP transport, durable asset storage and automated
handoff to generation are later work, after testing the editor workflow.

## Agents

Agents reach Dual Swords' work through the local server's ffmpeg routes
([local media tools](architecture.md#local-media-tools)), not the browser
editor. The Genobi MCP server wraps them as `genobi_media_tools` (is ffmpeg
installed), `genobi_media_probe`, `genobi_media_frames`, `genobi_media_trim`,
`genobi_media_concat`, `genobi_media_crossfade` and `genobi_media_space`
(`mcp/media-tools.ts`), and the `genobi-swords` skill teaches them. Space puts
an AKUSPACE room on a clip's sound in timed segments ([space](media-space.md)). Each is checked against the server's
limits (`shared/media-limits.ts`) before anything is sent; none is paid, and
every result is a new derived source in the agent's own session. A session the
studio starts for a project prompt gets only the check and the probe (a picked
take can be probed through the read scope); the cutting tools read the agent's
own session only and are left out of it (`GENOBI_TOOLS`,
`server/agent-runner.ts`). An agent with the full MCP server or the CLI hands a
video or audio result into a linked Director project with
`genobi_take_to_project` and its `sourceId`, as a production asset whose record
names the operation and inputs ([agent tools](director-agent-tools.md)).
Not yet: turning a frame into an image reference for a quoted run, and
timeline commands like the Director's.

## Verification — 16 October 2026

Local checks: 254 tests in 31 files, typecheck, production Pages build and Worker
portability check passed. Lint has no errors (three existing warnings outside
Dual Editor); changed files pass formatting and `git diff --check`.
Browser checks covered two real library clips, loading through the Director asset
drawer, stacked and side-by-side layouts, collapsible controls, CFR and VFR
numbered H.264 clips with B-frames, frame selection, PNG download and keeping a
frame in the tray. The exported CFR frame 17 was independently read as a 640×360
PNG with the correct burned-in frame number. VFR index 3 read 0.291667 seconds,
matching the fixture's presentation timestamp. Native Save as dialogs and phone
viewports have not yet been verified. This is local evidence, not a deployment.

## Editing extension

The **Frames / Timeline** switch preserves both workspaces. Edit frame beside
View opens reversible grading and optional local background removal. Timeline
adds frame-bounded trims, split/delete, A/B cutaway tracks and audio/video export.
See [editing contracts, limits and research](dual-editor-editing.md). PNG/JPEG/WebP
images can also be opened directly in either frame viewer.

## Editing verification — 17 October 2026

- 276 tests in 34 files passed, including VFR cuts, track priority, drag/trim
  math, grading/alpha, curves, looping, grounded jumps and run/walk speeds.
- Real browser: split a 72-frame H.264 clip, delete the intro, join a second
  source, and independently decode the 120-frame 640 × 360 H.264/AAC export.
  The source tones changed from 440 Hz to 880 Hz at the cut.
- Dragging a clip edge changed Out from 72 to 48 source frames. Dragging the
  lower clip moved its start near zero; one arrow-key nudge landed exactly at
  zero. A moved upper clip exported 75 frames / 2.5 s, with its picture and
  440 Hz tone replacing the lower 880 Hz clip only during its interval.
- A separate VP8/Opus WebM kept 75 frames and exported silence while the upper
  clip was muted; the lower track's audio did not leak through.
- Space play/pause, Backspace deletion and Undo verified in the Timeline.
  World Builder loop continued beyond a take boundary; Space jump, held Shift
  movement and Backspace deletion of a test primitive worked in the browser.
- RGB curve dragging changed Midtones from 128 to 172 and changed the sampled
  histogram. Production bundle with actual static CSP ran local background
  removal. Exported 960 × 528 PNG had alpha from 0 to 255, with about 43% fully
  transparent pixels. Replacement with frame B was exported at the same size.
- No generation request, paid inference, publication or deployment was used.
  Cloud Qwen vision comparison and actual relighting remain unimplemented.

### Live trim preview — 17 October 2026

Dragging the left edge previews its first included frame; the right edge previews
`Out - 1`, the last included frame. Moving a clip previews its first frame. The
boundary view temporarily overrides track priority and pauses sound, remains
visible on release, and supports arrow-key trims. Playback or scrubbing restores
the normal program. Edit this frame opens the inspected boundary itself.

Verified with a 48-frame numbered H.264 fixture: right-edge dragging changed Out
to 38 and displayed frame 37; left-edge dragging changed In to 10 and displayed
frame 10, even beneath an overlapping A clip. An arrow-key end trim changed Out
to 37 and displayed the burned-in frame 36. Edit this frame opened source frame
36; playback restored PROGRAM / A. The decoder serializes requests and discards
obsolete completions/errors. Full 281 tests / 35 files, formatting, typecheck,
lint and Pages/Worker build passed; lint retains three pre-existing warnings.

### Native and lossless export — 17 October 2026

Export defaults to lossless source copy: an unchanged source is returned
byte-for-byte, while compatible keyframe/packet-aligned sections can be cut and
joined without re-encoding. Unsafe boundaries, incompatible codec settings or
resolutions, extra media tracks and black gaps are refused explicitly. Source
copy never silently becomes a lossy export or moves a trim.

Native exact cuts is the explicit high-quality re-encode alternative (lossy,
8-bit SDR). No 1080p limit: 2176 × 928 stays 2176 × 928. Mixed inputs offer two
choices: retain each source's native pixels with padding, or scale to fit the
shared maximum-width/maximum-height canvas without stretching. Odd dimensions
are padded upward to even pixels. The footer shows the source and output sizes.
PNG frames remain native. See the [editing contract](dual-editor-editing.md) for
codec, timing and memory limits.

Verified in the browser with a 2176 × 928 / 24 fps source: a lossless
keyframe cut downloaded 12 frames / 0.5 s with decoded pixel hashes identical
to source frames 12–23; an unsafe one-frame-offset trim was refused. Mixed
2176 × 928 and 320 × 180 exports both produced 24 frames / 1 s at 2176 × 928.
Independent decoding found the smaller picture at exactly 320 × 180 in native
mode and 1650 × 928 in scale-to-fit mode. Regression tests also compare actual
compressed video and aligned AAC packet bytes, timestamps and compatible joins.
Full 297 tests / 37 files, formatting, lint, typecheck and Pages/Worker build
passed; the existing three lint warnings and bundle-size warnings remain.
