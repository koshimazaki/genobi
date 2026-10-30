---
tags: [director, studio, verification]
summary: The working Director composer, with its offline asset foundation, how to try it, rendering and verification.
---

# Director: first working composer

Offline asset foundation (18 October 2026): one Zustand owner now backs normal
and advanced Director modes, settings, selection, Undo and template drafts.
**Project media** offers Assets/Inspirations, local file intake without placement,
named-slot placement, role aliases and guarded removal. Inspirations remain in
the editable ZIP, outside MP4. Save manually before reload. Workspace-preset
rearrangement, Builder state migration and hosted generation remain separate.

Open **Director composer** at `/director` or from the studio shell's Editor
preset. Switching to another preset and back keeps the editable project in
memory; refreshing still clears it.
The UI follows Holo's Timeline · Automation structure: a stable stage, transport,
time ruler, stacked clip lanes, audio waveform and selection-driven inspector.
The bundle model replaces the source application's world/avatar state. Full 3D
scenes, physics and scene capture are outside this version. The page matches the
studio's width and font scale. The smaller preview does not change output
resolution.

## Media intake and reuse

Director has a preview on the left, a large **Make it yours** prompt in the
center, and Assets/Inspirations on the right. Headline, color and named template
slot inputs are not part of this preset. The separate Ninja input panel and
Editor retain their existing controls.

Character, Style and Add controls sit inside the prompt. They open a compact
project-file picker with search, source filters and Image/Video/Font choices.
Typing `@` opens the same picker and replaces the mention at the caret when a
file is chosen. A card can also be dropped onto Character or Style. Active
reference chips show the file and can swap its binding without changing the
prompt text. Character and Style are explicit prompt wording beside existing
reference tokens (for example, `Character: [Image 1]`), not new asset types or
schema fields. Fonts retain the existing validated font-import path.

Assets and Inspirations have large drop areas, compact **Choose files** buttons
and media cards beside one another. Dropping files into either tray imports
without placement. Drag an image or video onto the prompt to insert a linked
reference. The existing image/video picker offers the same reference choices
for keyboard and touch use. Audio stays available through the editor.
Template source cards show the layer that uses them. Clicking a used card
opens Project media with that template slot or layer selected for replacement;
importing still waits for an explicit **Use selected media** action.

Project media uses the same visible drop area and a compact file button.
Files keep the existing validation, roles, bundle format and save/export paths.
Internal drags are checked against the current project and asset fingerprint;
a stale drag or a different project is refused rather than silently reused.
On phones, the preview and prompt precede the media trays; the saved Ninja
arrangement is unchanged. This is a layout pass over the existing prompt brief,
not a new agent submission or generation path.

## Offline foundation verification, 18 October

- 48 test files / 369 tests pass, including role aliases, provenance, blocked
  removal, stale writes, monotonic Undo revisions and ZIP round trips.
- Typecheck, Pages build, worker check, generated-validator check and formatting
  pass. Lint has no errors and three existing warnings outside this change.
- Browser proof: import a local inspiration without adding layers; explicitly
  use a production copy in both character slots; edit the headline through the
  shared command; switch normal/advanced and template drafts without losing it.
- At a 390 × 844 viewport the drawer fits without horizontal overflow; Escape
  closes it and returns focus to its launcher. Physical-device touch is untested.
- Save and reopen the edited ZIP with all four asset records and both roles.
  Export and download a six-second 360 × 640 H.264/AAC MP4; decode a frame and
  confirm the placed artwork and edited text. No browser console errors observed.

This proves local composition and media reuse, not model-based character
replacement. No generation API, hosted sharing or automatic reload recovery was
used. The shared owner currently covers Director; wider studio/Builder migration
and smooth workspace transitions remain planned.

## Asset inspector verification, 21 October

- Unit tests cover the source range (in, out, handles and an exact final
  frame), clip and asset linking, the selection that follows a replaced source
  through commit and Undo, and the poster cache (one draw per hash and time,
  skipped requests, remembered misses, 96-entry eviction).
- `check-director-browser.mjs` asserts the plate's in/out (`f 0`, `f 179`), its
  outlined clip and linked card, and that an imported `tests/fixtures` clip's
  card shows a decoded blue poster, `2.00 s` and an unchanged card box.
- Locally, a 62-layer, 32-asset anime bundle drew all visible posters with no
  errors; the henshin clip read `f 6 · 0.250 s` to `f 35 · 1.458 s` with a
  6-frame head and 15-frame tail. `check-phone-a11y` passed at 390 and 1440 px.
  Hosted behaviour was not deployed or tested; it runs the same browser code.

## Frame notes verification, 21 October

- `tests/director-notes.test.ts` covers the schema (an older bundle stays valid;
  text length and control characters, frame range, layer, id, author, time,
  duplicates and the 200-note cap are refused), each note command's parse,
  apply and refusals, rewording, a removed layer detaching its notes, and notes
  surviving Download bundle and Open bundle, and Save JSON reopened.
- `tests/director-project-copy.test.ts` pushes a project with a note and checks
  the studio and the server reach the same bytes after `add-note`,
  `resolve-note` and `delete-note`; `tests/mcp-director.test.ts` reads, adds
  and resolves notes over MCP.
- `check-director-copy.mjs` adds a note in the studio on the title, reads it
  as the agent, resolves it as the agent, sees the list and the ruler pin
  update live, checks the console, stage and toolbar did not move, and that
  the drawer fits a 390 px screen with no sideways scroll.
  Run locally only; nothing was deployed.

## Try it

```sh
npm ci
npm run dev
# Open http://127.0.0.1:4317/director
```

The original **Signal studies / 01** example combines a six-second video, two
image cuts, a 120 BPM audio pulse, p5 rings, Anime.js bars and animated typography,
a Three.js dither pass, and a CRT pass with curvature, scanlines, RGB separation
and vignette. Source artwork, music and footage are synthetic fixtures authored
for this repository; no model service or paid generation is involved.

The three [house-style templates](templates.md) open the same way:
`/director?example=product-video`, `/director?example=character-piece` and
`/director?example=audio-visual`, each with its shots, tracks and planned
prompts.

1. Play or scrub the timeline. The Web Audio clock drives playback; every graphics
   module receives an explicit local timestamp. Video frames are decoded
   at the corresponding source timestamp. Audio comes only from audio layers.
2. Select a clip. Double-click it or use the header eye to open the inspector;
   its eye control closes it. The inspector slides over the timeline without
   resizing its grid. Fold channels to keep just colors, numbers and visibility
   controls. Drag a clip's body to move it, or its edges to trim; arrow keys nudge
   by frame or beat snap. Beat snap follows the song's grid: beats start at the
   composition's downbeat offset, bar lines are drawn heavier, and a nudge always
   moves to the next line even where a fractional beat rounds onto the clip's
   frame. Set **BPM**, **Downbeat** (seconds) and **Bar** (beats per bar) in the
   transport, or scrub to the song's first downbeat and press the grid button to
   put a downbeat on the playhead frame. Nearby
   clip starts/ends act as magnets for both moves and trims, including locked
   clips as alignment targets. Matching clips are highlighted with a vertical
   guide and frame readout. Hold Shift while dragging to bypass clip magnets
   while retaining frame/beat quantization. Enter values in the inspector and leave the field to
   apply them. The cut icon, **C** or **S** splits the selected unlocked clip at the
   playhead. Media offsets, recipe clocks and animated placement survive the cut.
   **Space** plays/pauses while the timeline has focus; **Loop** repeats preview
   using the audio clock and finishes the current pass when switched off. Text fields and menus keep
   their normal keys. Locks protect timing, placement, source and parameters. Undo keeps
   the last 20 project states during this session.
   **Notes** in the timeline header opens the frame notes over the console's left
   edge: pause on a frame, select a layer if the note is about one, and add a note
   such as "move the HUD lower". Each note is a pin on the frame ruler; a pin seeks
   to its frame and selects its layer. Reword, resolve, reopen or delete notes in
   the list. Linked agents read them from `genobi_project` and resolve them, and a
   resolve shows in the list and on the pin as it happens.
   **Feedback** beside it opens _Feedback for the agent_ over the right edge: your
   changes since the agent's revision as Director commands, each labelled in
   frames and beats ("title 変身 starts 12 frames (0.82 beats) later"), with the
   open notes and anything no command can express. **Download JSON** saves it and
   **Copy** puts it on the clipboard to paste to the agent; a linked agent reads
   the same from `genobi_project_feedback`.
3. Edit text, color, recipe parameters, placement or opacity. **Animate placement**
   interpolates scale, X/Y and opacity across the clip. Add graphics or filters,
   duplicate a layer, and use Move up/down to change compositing order. The
   timeline displays the top visual layer first; JSON remains bottom to top.
   Audio lanes have speaker **Mute/Unmute** controls; visual lanes use their type
   icon for **Hide/Show**, including locked lanes. Disabled layers remain
   editable and saved, but contribute no image, filter or sound to preview or MP4.
   Choose active layers before rendering; this does not cancel provider jobs.
4. **Add track** opens a name/type dialog with a drop area and file picker for
   audio, video or images; registered graphics/filter templates are available in
   the same type menu. Directly dropping media onto the composer creates tracks
   automatically and closes the inspector. Rename a clip/track in the inspector;
   JSON retains its name. A rendered graphics MP4 imports as video. Images import consecutively with the selected
   **Image step** in frames: 6 frames at 30 fps places ten images in two seconds.
   Extend the composition before importing a sequence that will not fit. New
   media is inserted below graphics/effects. Replace source preserves the selected
   layer's timing and placement, rejecting sources too short for those edits. A
   video can replace an image and an image a video (a generated clip over a
   template's plate, for example); audio replaces only audio.
5. **Asset inspector.** Video asset cards, in **Project media** and the Assets
   panel, show a poster frame and the file's duration; a placed clip's card adds
   the source span it uses (`0.25–1.46 s`). The clip inspector's source card shows
   the in and out frames as two posters, both as frames and seconds (`f 6 ·
0.250 s`), with the source length and the unused head and tail handles. The
   in-point is `sourceStartFrame` and the out-point the last frame the clip shows,
   the frames the renderer draws. Selecting a clip marks its asset's card;
   selecting an asset outlines its clips on the timeline, and **Project media**
   lists them to select. Posters are decoded in the browser from the bundle's own
   bytes with the preview's Mediabunny decoder, so neither the local nor the
   hosted studio makes a request. They decode lazily, one at a time, only for
   cards near the viewport (12 per page) and the selected clip, and are cached by
   file hash and source time; each card revokes its own object URL. Card media
   boxes keep their size while a poster loads.
6. **Download bundle** saves JSON, media, references and module source in one ZIP.
   **Open bundle** loads that ZIP. **Save JSON** saves edits alone; a standalone
   JSON can reopen against files already loaded in the current browser session.
   Browser refresh does not preserve an unsaved project.
7. **Render MP4** evaluates every composition frame in order, waits for video decoding,
   graphics and shader passes, then encodes H.264 at `frame / fps` with duration
   `1 / fps`. The audio mix is encoded as AAC. Export stays in the browser with
   no uploads, API keys or render server. Progress counts completed frames;
   **Cancel render** releases encoders and never offers a partial file.
8. The ruler uses the upscaler fader's machined minor ticks and taller accents.
   A single grid spans every lane. Frame ticks, labels, clip edges and playhead
   use the same whole-pixel frame scale, avoiding fractional tile drift. Zoom
   reveals frame-number labels; the scale keeps at least two whole pixels per
   frame. Clicking the ruler seeks to the nearest frame. Subtle lane grid lines
   share one origin. Zoom and playhead reuse the upscaler **TickFader**, and snap
   and snap/track-type choices reuse the studio **SelectMenu**. Section surfaces, borders,
   radii, focus states and colors use the same host tokens. Zoom selects 2–8
   whole pixels per frame.

## Rendering and module boundary

Export is offline and frame-exact: a busy browser takes longer rather than
skipping output frames. Preview remains real-time and can skip displayed frames
when busy. Both paths use the same explicit-time compositor. Video source frames
are decoded by presentation timestamp with Mediabunny/WebCodecs, including source
trims, rather than sampled from live playback.

The stereo 48 kHz offline mix preserves offsets, trims, gains and silent gaps.
Clipping rejects export. AAC encoder delay is measured with two test impulses
for this browser/encoder, compensated using negative packet timestamps and the
MP4 edit list, and its tail is trimmed to the mix duration. This avoids guessing
an OS-specific priming constant. A silent prefix protects early source samples.
Calibration failures stop export instead of emitting audio with unknown timing.
AAC remains lossy; sample-identical audio is not claimed.

Use a browser with H.264/AAC WebCodecs encoding and video decoding plus WebGL2
(current Chrome/Edge recommended). Missing encoders produce a visible error;
there is no live-recording fallback. Output is SDR, opaque sRGB. Layer alpha is
preserved through graphics/filter compositing and flattened onto the background.
Alpha-video export, HDR and a server render queue are not included. Encoding and
the final MP4 use browser memory within the existing project bounds.

Graphics source files remain separate from JSON. This first importer runs only
registered recipes with matching source hashes, engine versions and parameter
schemas. The [motion effects](director-bundle/motion-effects.md) (shake, transition,
grade, speed lines and a styled title) are registered recipes too. Agents can compose those recipes and generate/edit parameters through
JSON today. A new agent-authored module must be added to `src/director/recipes.ts`
and the trusted schema catalogue, reviewed, then rebuilt; imported JavaScript is
never evaluated as arbitrary code in the UI. Adding a recipe does not require
changing the timeline UI. Production image import accepts PNG/JPEG/WebP; SVG can
remain a non-rendered moodboard reference. Fonts are currently the bundled studio
font, not arbitrary font assets.

[Schema and format details](director-bundle/README.md) cover file hashes, alpha,
filters and provenance. Image layers, optional placement interpolation and an
optional composition BPM extend the initial `director.bundle.v1` contract without
changing existing fixture interpretation. Optional `muted` defaults to false;
optional `animationOffsetFrames` defaults to zero on graphics/filter layers and
retains the recipe clock through cuts and left trims. BPM supplies the placement grid,
optional `beatOffsetSeconds` (default 0) its phase and optional `beatsPerBar` (default 4)
its bar lines; the example title has its own explicit BPM parameter. Automatic beat detection,
generation scheduling and Comfy node dispatch are not implemented here.

Limits: 150 MB unpacked project, 128 archive entries, 1 MB manifest, 150 MB per
imported media file (`DIRECTOR_PROJECT_BYTES` and `DIRECTOR_MEDIA_BYTES`, MiB), 128 layers, 100 assets, 32 registered modules, 16 megapixels
per image, 1080p-equivalent composition area and two minutes. These are first
renderer bounds, not a performance guarantee at every maximum simultaneously.

## Self-hosting and the later render-node adapter

The composer and browser renderer need only static hosting. Build with `npm run
build` and serve `dist/` with a single-page-app fallback, or use the existing
[Cloudflare deployment setup](cloudflare.md) for the full generation studio.
The composer itself needs no D1, R2 or provider key; generation services have
separate credentials, limits and costs. The studio header retains the repository
link; media and rendering stay in the browser.

Anyone can download the project, run this open-source app locally and reopen the
ZIP, preview it and export MP4 directly. FFmpeg is used only as an independent
verification tool; it is not required by the app.

A future Comfy render node can accept this bundle, resolve the same registered
recipes, render through the shared clock, and return media plus a receipt. It
must transport the files, not just paths from the user's browser. Cloudflare
hosts the UI/API; it does not execute browser graphics or provide a free GPU.
No Comfy node or hosted rendering endpoint is represented as available now.

## Verification

```sh
node scripts/check-director-bundle.mjs
npx vitest run tests/director.test.ts tests/director-export.test.ts
npm run typecheck
npm run lint
npm test
npm run build:pages
# Separate terminal, then Chrome integration checks:
npx vite --host 127.0.0.1 --port 5175
node scripts/check-director-browser.mjs
node scripts/check-director-timeline.mjs
node scripts/check-director-controls.mjs
node scripts/check-director-compact.mjs
node scripts/check-director-templates.mjs
# Optional independent decode/timing proof (requires FFmpeg):
node scripts/check-director-mp4.mjs
```

The browser check exercises random seek, one-frame ruler positioning, cancellation,
export under 4× CPU throttling, ZIP round-trip,
JSON edits, lock protection, duplicate layers and portrait width. The controls
check covers C/S, Space, form guards, repeated cuts, locked mute, shared
menus/faders, composition kept across a Camera → Editor preset round trip,
preview continuity and decoded silent AAC when all layers are muted. The
browser, timeline, controls and compact checks open the studio example in the Editor
preset (`/director?example=studio&workspace=editor`), because `/director`
alone opens a template in the simple Director. They save local
screenshots, preview frames and an MP4 under ignored `.local/director/`. Set `DIRECTOR_URL` for
another local server; the default installed browser channel is Chrome. Set
`DIRECTOR_BROWSER=chromium` after installing Playwright Chromium to use that
browser. Pixel comparisons allow mean channel error below 0.15/255 and fewer
than 0.2% of channels differing by more than 8/255, to tolerate Canvas/GPU
rasterization differences without accepting shifted layers.

Shader code is original. API contracts follow official [p5 redraw](https://p5js.org/reference/p5/redraw/),
[Anime seek](https://animejs.com/documentation/animation/animation-methods/seek/)
and [Three ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html).

The independent MP4 check verifies all 180 frame timestamps at 30 fps, six-second
video/audio/container durations, H.264/AAC codecs, sampled preview/export PSNR
above 32 dB and source/audio alignment within four 48 kHz samples. A second
37-frame/24 fps export checks non-whole-second duration and the correlation
of trimmed, offset, overlapping audio against its expected mix. The fixture
covers video, two image cuts, p5/Anime layers and Three dither/CRT passes; broader
projects and hardware still need their own parity checks. Encoding APIs follow
[Mediabunny sources](https://mediabunny.dev/guide/media-sources) and
[media sinks](https://mediabunny.dev/guide/media-sinks).
