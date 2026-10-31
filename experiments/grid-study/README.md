# Quiet grids — local visual study

Two restrained, standalone treatments informed by the supplied 31 October
stills and the user's preference for tasteful monochrome, small color accents
and quiet motion. This is original Canvas code, not a port of Kodoi/Opus code,
a finished Director recipe, or a general preset insertion feature. No uploaded
still is included. No new generation, external service or paid operation runs.

## Look and try

- [Quiet window](previews/poster.mp4): centered 3 × 3 treatment, fine halftone,
  dark/cream tonal bands and sparse muted red/cyan accents.
- [Water grid](previews/water.mp4): optional full 20 × 12 grid, a locked central
  4 × 4 region, small temporal offsets and gentle analytic ripples outside it.
- [Side-by-side montage](previews/two-grids.mp4).
- [Poster frame](previews/poster.png), [water frame](previews/water.png),
  [browser checks](previews/checks.json) and [codec report](previews/capture-report.json).

From the repository root:

```sh
npx vite --host 127.0.0.1 --port 4324
```

Open `http://127.0.0.1:4324/experiments/grid-study/`. Choose a treatment, change
intensity, scrub or press Play. Playback starts paused; intensity zero restores
the prepared source exactly, including removing the grid. Real-time preview
may skip display frames on a slow device; explicit exports render every frame.

The UI's spacing and palette follow the repository's original
`experiments/effects-study/` shell. Its CSS is independently scoped here; no
external UI code, font, shader or image dependency is added.

## Image and timing contract

The full source remains recognizable. The 3 × 3 window is 442 × 286 pixels at
(259, 127) in a 960 × 540 output: approximately 46% of the image width and 53%
of its height. It processes one continuous crop. There is **no repeated whole
image in each cell**. The stationary 6-pixel halftone pattern and thin gray
lines share global image coordinates. One gentle displacement moves the entire
treated crop by at most 1.2 horizontal and 0.8 vertical output pixels at full
intensity; there is no independent cell shake, flashing or random datamosh.

Water uses global source coordinates on a 20 × 12 control grid. Zero-based
columns 8–11 and rows 4–7 retain primary time. Their output rectangle is
(384, 180, 192, 180), restored directly from the primary source after
upscaling so delayed neighbors cannot bleed across its edges.

For other cells, let `d` be the larger horizontal/vertical cell distance from
that central rectangle. Their delay is `min(4, 0.65 * d) * intensity` frames.
Fractional delays blend the two actual neighboring source frames. This is
simple temporal interpolation, not optical flow or motion estimation. At the
default intensity 0.64, the largest delay is 2.56 frames (about 107 ms); at full
intensity it is 4 frames (167 ms). A continuous global ripple fades to zero at
the central rectangle and stays within 1.4 horizontal and 0.9 vertical output
pixels at full intensity. It is analytic distortion, **not fluid simulation**.

Source lookup clamps to the bank's valid frame indices. The study's primary
range and preroll keep all configured delays inside that bank, so the demo
does not need to freeze an edge frame. Grid visibility is a separate control.

**Timing is authored and silent.** No soundtrack was supplied for this study;
the bundled Bloom music is not used or analyzed. The render runs for 96 frames
at 24 fps (4 seconds), with no claim of beat detection or music synchronization.

## Prepared source and provenance

The source is the existing owner-supplied MiniMax H3 open-weights footage
`public/media/director-templates/bloom-teaser/bloom-h3-b.mp4`, the dark-studio
Bloom take described in [Bloom's footage notes](../../docs/bloom-teaser.md#the-footage)
and [the media licence inventory](../../LICENCES.md). Both existing Bloom
takes were visually inspected; take B supplied the closer dark, centered look.
The supplied reference stills guided composition, not source identity.

Source SHA-256:
`5276e31e954a068d60a9b8a66fe3a5d4b0568cefdc1009a880a93243816b1114`.

`prepare.py` verifies that hash and creates one JPEG atlas containing 128
actual source frames at **480 × 270**, 24 fps, in eight columns and sixteen
rows. The browser decodes that one atlas once and holds at most eight cached
pixel frames. Per-cell processing never seeks or decodes a video. The decoded
atlas's RGBA equivalent is about 63 MiB, plus working buffers; actual browser
memory and physical-device performance are not benchmarked here.

Primary frame `f` reads source frame `16 + f`: the four-second excerpt begins
at source time 0.667 s. The atlas is **upscaled to 960 × 540** for display and
export. Neutral comparisons use this same prepared JPEG source, not the
original 1920 × 1080 MP4. This is a preview-quality study, not a claim of native
540p source detail. Atlas identity and preparation details are in
[`media/source.json`](media/source.json). The existing media conditions also
apply to these derived previews; the source is not relicensed as code.

## Repeat and inspect

Requires the repository's existing Node/Playwright dependencies, Chrome,
Python 3 and local FFmpeg/ffprobe. No new package installation is required.

```sh
python3 experiments/grid-study/prepare.py
node experiments/grid-study/check.mjs
node experiments/grid-study/capture.mjs
```

`STUDY_URL` changes the loopback server origin; `CHROME_BIN` selects a local
Chrome executable. `STUDY_OUT` selects the evidence/capture destination.
`capture.mjs` writes 96 awaited PNG frames per mode to FFmpeg, encoded as silent
H.264, CRF 27, medium preset. The individual clips are 960 × 540; the small
montage places two 480 × 270 views side by side. This is not a wall-clock screen
recording. Rebuilding the atlas may change JPEG bytes with a different FFmpeg
version; the preparation records its resulting hash.

```js
await window.gridStudy.set({ mode: "water", intensity: 0.64, grid: true });
await window.render(48); // Resolves after the exact requested frame draws.
const canvas = window.gridStudy.canvas;
const state = window.gridStudy.get();
```

`set` accepts only defined mode/intensity/grid/frame fields and validates the
complete patch before changing playback or state. `window.render` accepts
integer frames 0–95 and pauses real-time playback. The clock uses a generation
token and cancels obsolete animation callbacks when paused or scrubbed.

## Verification

Chrome 148 checks passed at 1440 × 1080 and 390 × 844:

- Exact rendered pixels at frame 48 before and after seeking 95 → 3 → 48,
  for both modes on the same browser.
- Exact intensity-zero parity with the prepared source; the full water center
  matches the primary-time source with grid lines off, including its edges.
- Actual outer-image change, bounded pixel cache, source-content hash,
  controls, play/pause/resume and no horizontal overflow.
- Malformed and explicitly undefined patch values leave state unchanged.
- No page exceptions or external requests in the isolated study checks.

FFprobe verifies 96 frames, 24 fps, 4 seconds and no audio stream for each
individual clip. Desktop/phone screenshots and both final poster frames were
visually inspected. Source and export quality are bounded by the prepared
atlas and the stated encoding. Cross-browser pixel identity, physical-phone
frame pacing and production editor integration remain unverified.
