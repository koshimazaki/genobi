---
tags: [director, bundle]
summary: Trusted editable poster, scan, HUD, kinetic and reflection renderers with explicit frame time and reproducible checks.
---

# Editable effect renderers

These five original Genobi modules implement the catalogue's first four
compositions. Their exact source bytes and parameter schemas are registered in
[`modules.json`](modules.json). Catalogue previews and Director's frame renderer
use the same factories from `src/director/catalogue-effects.ts`; project bundles
retain the registered source and editable parameter values.

| Module                  | Output                            | Controls                                                                                |
| ----------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `effects-poster-window` | Filter over the current composite | Mix, normalized window position/size, tonal levels, halftone, spatial jitter and accent |
| `effects-scan`          | Filter over the current composite | Mix, speed, scan-line strength, lens distortion and accent                              |
| `effects-hud`           | Transparent overlay               | Mix, speed, accent, label and font                                                      |
| `effects-kinetic-title` | Transparent overlay               | Mix, speed, palette, title/subtitle, font and petal count                               |
| `effects-liquid-mirror` | Filter over the current composite | Mix, ripple, fold count and speed                                                       |

## Timing, geometry and source

Every frame is a direct function of `timeSeconds`, parameters and the current
input texture. There are no timers, network requests, random seeds, accumulated
drawings or simulation history. Changing the frame rate changes sampling of the
same motion. Setting a filter's mix to zero copies its input; an overlay at zero
is transparent. A speed of zero holds the scan, HUD, kinetic and mirror motion.

The poster window contains one aligned 3 × 3 crop, not repeated images. Its size
is a fraction of the shorter composition dimension, with a 1.55:1 window shape.
Position is normalized from the top left and clamped so the window remains
inside the image. The halftone pitch scales from six pixels at a 540-pixel short
dimension. Jitter is a small spatial displacement, not a time offset.

The scan filter and HUD remain separate layers: place the HUD above the scan so
the lens treatment does not distort text. The readout is labelled **SIM** and
**SIMULATED READOUT** because it is authored instrumentation, not camera tracking
or live telemetry. Edge margins and type sizes scale with the shorter dimension.

The kinetic title keeps authored petal, blade, orbit, rim and hub path data fixed.
Only their transforms change. Title text, palette and petal count remain editable
parameters. Its composition is rasterized by Canvas for preview and MP4 export;
this module does not import arbitrary SVG or export an animated SVG file.

The liquid mirror uses analytic reflection and image refraction. It consumes
only the current composite and does not imply physical fluid simulation,
motion estimation, the original Folio implementation, or temporal Water-grid
sampling. The separate [Water grid study](../../poster-grid-direction.md)
demonstrates actual neighboring source frames; it still needs a production
multi-frame input contract.

## Source and assets

All five modules are original Genobi code. Poster and mirror directions grow
from the local studies, and the kinetic paths grow from the authored geometric
control. No reference images, third-party shader code or model weights are
included. They use the existing Three.js filter host and Canvas overlay adapter;
no dependency is added. Fonts pass through Director's existing bundled-font
resolver. The source media remains the project's own image/video/composite.

Changing registered source bytes requires updating the corresponding SHA-256 in
`modules.json`, then running `npm run director:validators`. Bundle import still
rejects changed source, unregistered code and widened parameter schemas.

## Reproduce verification

Start the local Vite server and then run the browser check:

```sh
npx vite --host 127.0.0.1 --port 4499
node scripts/check-effects-catalogue.mjs
```

`EFFECTS_CHECK_URL` selects a different loopback origin, `CHROME_BIN` a Chrome
executable and `EFFECTS_CHECK_OUT` the report directory. The check creates its own
procedural input, loads the production factories, and compares their pixels with
DirectorRenderer. No external source or paid operation is involved.

The browser checks cover all five modules at 640 × 360 / 24 fps,
360 × 640 / 30 fps and 513 × 513 / 60 fps: neutral mix, changed source, direct and
reverse seeking, animated motion, trusted bundle import and exact agreement
with Director's renderer. They compare decoded frame pixels in the same browser;
they do not claim identical pixels across GPUs or lossless MP4 encoding.

`npx vitest run tests/effects-catalogue-modules.test.ts` additionally checks source
hashes, accepted defaults, module/schema tampering, bounded geometry and invalid
parameters. The whole application retains its normal build and validation gates.
