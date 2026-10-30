---
tags: [templates, cloudflare]
summary: How gallery and Camera library cards load light previews while projects, watch pages and downloads keep the original media.
---

# Gallery and Camera media preparation

Every bundled gallery clip and Camera library video has a separate
`<name>.preview.mp4` and `<name>.preview.jpg` beside its originals. The Director
template picker and the local Taste construction study use these too. No
generation or provider call is involved.

| Surface                                               | Video                                      | Initial loading                                               |
| ----------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Gallery card, Director template picker                | `galleryMedia().preview`                   | Small poster, `preload="none"`; hover/focus starts playback   |
| Camera library grid and featured clip                 | `Source.preview`                           | Small poster, `preload="none"`; hover starts playback         |
| Gallery drawer, watch/embed, Camera lightbox          | Full `video` / `url`                       | Explicitly opened player; watch/embed and drawer preload none |
| Downloads, upscale, Send to Director, project imports | Full `video` / `url`, template `mix.media` | Explicit action                                               |
| Taste construction study                              | Small preview                              | Poster, preload none; Play starts playback                    |

`galleryMedia().width/height`, including `MIX_PREVIEW_SIZE`, describe the **full**
render for watch/embed metadata. Its original poster remains the same size.
`Source.width/height/duration` and the library catalogue's `bytes` likewise
describe the full upscale source. Never replace these with preview measurements.
Project media under `public/media/director-templates/` remains full resolution;
its URLs are independent of the card encodes.

The shell keeps Director mounted across workspaces. Its route loader waits until
Director/Editor is active before opening the default or URL-selected project.
An untouched Gallery visit therefore fetches neither the default Dimensions mix
media nor the example bundle's video/audio. Opening a project still fetches its
full files. Existing projects and drafts remain available across workspace changes.
Saved generation cards likewise preload none; a newly arriving result may load
its first frame for the existing reveal animation.

## How to repeat it

Run `node scripts/encode-gallery-previews.mjs` with ffmpeg and ffprobe on PATH.
It reads the original MP4s and selected JPG frames, writes only preview files,
and fails if an output exceeds its budget. It also prepares retained library
clips not currently listed and the Taste reel. Original files are never rewritten.

- H.264 High, x264 `fast`, CRF 27, yuv420p, max 1280 × 720, even dimensions,
  preserved aspect, no upscale, MP4 `+faststart`.
- Existing sound stays AAC at 96 kb/s; silent sources stay silent. No chapters
  or source metadata is copied.
- At most 4,000,000 bytes per preview, or 6,000,000 for a clip over 60 seconds.
  If CRF exceeds the ceiling, two-pass encoding budgets 94% of that ceiling
  across the complete duration, subtracting audio. For the two-minute teaser
  this requires substantially less than 1.2 Mb/s; full playback keeps its master.
- Posters preserve the chosen original frame (including the GENOBI title and
  cathedral scan), max 1280 pixels wide without enlargement, at most 150,000
  bytes. JPEG quality is lowered only until that budget is met.

When adding a library entry, set `preview` and `previewPoster` explicitly in
`public/media/gallery.json`, alongside the existing full `url` and `poster`.
Gallery catalogue media derives preview filenames from its full local MP4 path;
prepare those files whenever adding or replacing a gallery render.

## Verification boundary

`tests/gallery-preview-assets.test.ts` checks asset existence, byte limits,
MP4 faststart, measured geometry, duration and sound when ffprobe is installed.
`tests/gallery-preview-surfaces.test.tsx` pins card/grid/hero preview URLs and
poster-only preload settings against full drawer/watch/embed/lightbox URLs.
The template-opening tests check that import requests keep full media URLs.
The existing hover tests cover sound permissions, visibility and reduced motion.

Pages' public static range requests can return the entire file with `200`.
For that reason metadata preload is not a small-download guarantee. An untouched
gallery visit requests posters, not videos; hovering one card fetches only that
card's preview. First-visit media totals must count unique requested poster paths,
including any mounted Camera panels, rather than summing all available masters.
JS, CSS, fonts, API responses and external Taste demos are separate from that
media-only budget. See [Cloudflare operations](cloudflare.md#pages-deployment-details).
