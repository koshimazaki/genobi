---
tags: [director, bundle, templates]
summary: The four recipes Dance with Fruits added to the trusted registry - a comic speech bubble, a pixel-art fruit shower, a surveillance treatment confined to a box and a scan with its own lock line - with their parameters and checks.
---

# Dance with Fruits: its recipes

[Dance with Fruits](fruits-swap.md) added four recipes. They are registered
in the studio example (`docs/director-bundle/example/studio.json`) beside the
other mix recipes, because a mix takes its recipes from there, and in the
browser by `src/director/mix-recipes.ts`. Every parameter is required and
checked against the schema, and every frame is a function of the layer's
time alone, so a seek in any order draws the same frame.

## `speech-bubble`

`graphics/mix-speech-bubble.mjs`, a Canvas 2D overlay under the `animejs`
entry. A rounded bubble with a thick outline and a tail whose tip sits just
off an anchor point; it grows from the tip with an overshoot over `duration`,
then holds. The bubble is kept inside the frame; the tail stretches to follow.
Version 2 of the cut used it for the title; version 3 types the title instead,
and the recipe stays for any cut.

| Parameter   | Values                                                       |
| ----------- | ------------------------------------------------------------ |
| `text`      | 1 to 60 characters, no control characters; " / " breaks      |
| `font`      | `IBM Plex Mono` or `Instrument Sans` (bundled faces)         |
| `color`     | `#rrggbb`: outline, tail and words                           |
| `fill`      | `#rrggbb`: the bubble                                        |
| `x`, `y`    | the anchor, 0 to 1 of the frame                              |
| `size`      | 8 to 240 px, the type size at the layer's pixels             |
| `direction` | `up-left`, `up-right`, `down-left`, `down-right` from anchor |
| `duration`  | 0.05 to 4 s, the pop                                         |

## `sprite-shower`

`graphics/mix-sprite-shower.mjs`, a Canvas 2D overlay under the `animejs`
entry. Pixel-art fruit flying across the frame like a game: an apple, a banana
and a watermelon slice, 12 × 12 pixels each, drawn in the recipe itself (no
image files). Each sprite has a seeded lane, pace and bob; one in four is
drawn twice as large. Sprites are drawn in whole-pixel squares snapped to
their own grid, so their edges stay crisp at any size.

| Parameter   | Values                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| `density`   | 1 to 400 sprites at once                                               |
| `speed`     | 0 to 4 frame crossings a second for the average sprite; 0 holds travel |
| `direction` | `left`, `right`, `up`, `down`                                          |
| `size`      | 1 to 32 screen pixels per sprite pixel on a 1920-wide frame            |
| `seed`      | 0 to 9999                                                              |

## `box-scan`

`graphics/mix-box-scan.mjs`, a Three.js filter. An ordered-dither posterize
on brightness alone (each pixel is scaled to its stepped luminance, so its hue
stays its own) and `wire-scan`'s Sobel wireframe sweep in one shader, applied
only inside a rectangle with softened edges; outside it the composite below passes
through untouched. It is a copy of those two filters with a box, not a change
to them, so they and every project pinned to their hashes stay as they are.

| Parameter          | Values                                                     |
| ------------------ | ---------------------------------------------------------- |
| `x`, `y`, `w`, `h` | the box, 0 to 1 of the frame from its top left             |
| `feather`          | 0 to 0.2 of the frame: the soft edge                       |
| `posterize`        | 0 to 1: how much of the dithered picture shows             |
| `levels`           | 2 to 32 steps of brightness                                |
| `wire`             | 0 to 1: how much of the wireframe sweep shows              |
| `color`            | `#rrggbb`: the wireframe's glow                            |
| `sweep`            | 0.1 to 8 s for the scan line to cross the frame            |
| `trail`            | 0.05 to 1 of the frame: how long the wireframe stays alive |

## `scan-lock`

`graphics/mix-scan-lock.mjs`, a Canvas 2D overlay under the `animejs` entry:
the `scan` surveillance read (corner marks, a reticle that closes over one
beat and locks on the next, a dotted leader, camera and time code readouts)
with its own lock line. While it closes the readout says ACQUIRING over
`text` on a dark plate; once locked the plate turns `accent` and reads
`locked`. A copy of `mix-scan.mjs`, so the Dimensions mix and Bloom, pinned
to that recipe's hash, stay as they are.

| Parameter | Values                                                      |
| --------- | ----------------------------------------------------------- |
| `color`   | `#rrggbb`: words, marks and the reticle while it closes     |
| `accent`  | `#rrggbb`: the locked reticle and the locked plate          |
| `text`    | 1 to 32 characters: the subject while acquiring             |
| `locked`  | 1 to 64 characters, " / " breaks a line: the locked readout |
| `x`, `y`  | the target, 0 to 1 of the frame                             |
| `bpm`     | 20 to 300: one beat to close, then locked                   |

## Checks

- `tests/mix-speech-bubble.test.ts`: schema refusals, seek order, the pop
  and its overshoot, line breaks, the bubble inside the frame.
- `tests/mix-pixel-recipes.test.ts`: both recipes' schema refusals and seek
  order; the shower's pixels square, whole and on their grid, density, seed,
  direction and speed 0; the box scan's box and settings reaching the shader
  and its mix by the box mask alone; the scan lock's ACQUIRING step, its
  locked lines and its accent plate.
- `npm run check:director-validators` keeps the standalone validators in step
  with the schemas; `npm run build:mcp` carries the registry to the plugin.
