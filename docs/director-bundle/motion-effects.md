---
tags: [director, bundle, agents]
summary: The five registered motion-effect recipes (shake, transition, grade, speed lines, styled title), their parameters and how agents use them.
---

# Motion effects

Five registered recipes for the cuts agents make, such as an anime opening:
camera shake, transitions, a colour grade, speed lines and a styled title with
an eased slide. They run on the same [graphics module interface](README.md#graphics-module-interface)
as the first six recipes, so the Director previews them, exports them
frame-exactly and checks their parameters on import and on every command.

- Sources: [`effects/graphics/`](effects/graphics/), one file per effect.
- Catalogue and worked example: [`effects/project.json`](effects/project.json),
  a five-second 640×360 cut that uses all five. Its `modules` are the trusted
  entries (hash, engine, mode, parameter schema); its layers are working
  defaults.
- Registration: `src/director/effects.ts` (browser only: it imports the
  sources with Vite's `?raw`) is spread into `src/director/recipes.ts`;
  `src/director/effect-modules.ts` reads only the catalogue JSON, so
  `src/director/validate.ts` trusts the effects under plain Node too, where the
  local server validates projects.

The Dimensions mix adds eight mix recipes on the same interface, among them
the editable construction end card (`end-card`), whose words are parameters
like the styled title's ([the end card](../dimensions-mix.md#the-end-card)).

## Every frame from its time alone

Each effect is a pure function of the layer's local time (the frame number,
`animationOffsetFrames` included). Randomness is a seeded integer hash, never
`Math.random`; nothing accumulates from one frame to the next. A seek in any
order, a fresh instance and the MP4 export therefore draw the same frame. The
styled title waits for its font before measuring, so preview and export lay
out the same words.

## The five effects

| Recipe         | Mode    | Engine    | Parameters                                                                                                                                                                                                                                                                                                               |
| -------------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shake`        | filter  | `threejs` | `amplitude` 0–64 px, `frequency` 0.5–30 Hz, `seed` 0–9999 (whole), `decay` 0–10 per second                                                                                                                                                                                                                               |
| `transition`   | overlay | `animejs` | `type` cut, crossfade, wipe or slice; `phase` in or out; `duration` 0.01–4 s; `direction` left, right, up or down; `color` `#rrggbb`; `slices` 2–24                                                                                                                                                                      |
| `grade`        | filter  | `threejs` | `lift` −0.5–0.5, `gamma` 0.2–5, `gain` 0–4, `contrast` 0–3, `saturation` 0–3, `tint` `#rrggbb`, `tintAmount` 0–1, `amount` 0–1                                                                                                                                                                                           |
| `speed-lines`  | overlay | `animejs` | `density` 4–160 (whole), `color` `#rrggbb`, `direction` radial, left, right, up or down; `speed` 0–8; `thickness` 0.5–16 px; `length` 0.05–1 of the frame; `seed` 0–9999                                                                                                                                                 |
| `styled-title` | overlay | `animejs` | `text` up to 80 characters; `font` Instrument Sans or IBM Plex Mono; `color` and `accent` `#rrggbb`; `plate` true/false; `size` 8–160 px; `direction` left, right, up or down; `ease` linear, outQuad, outCubic, outQuart, outExpo, outCirc, outBack, outElastic, outBounce, inOutCubic or inOutExpo; `duration` 0.1–4 s |

Every parameter is required, and no other name is accepted. The filters are
Three.js shaders; the overlays draw with Canvas 2D under the `animejs` engine
entry, whose eases the transition and the title use.

- **Shake** moves the composite below by smooth seeded noise, sampled
  `frequency` times a second and scaled by `amplitude × e^(−decay·t)`. The
  amplitude is held to a fifth of the frame's shorter side and is the most the
  picture moves on screen; the shader applies the move before a zoom of
  1 + 2 × amplitude ÷ shorter side, which is just enough that no edge shows. `amplitude` 0 is
  the picture unchanged.
- **Transition** works against a matte colour, because a filter or overlay
  sees one composite, not two clips. `in` opens on the matte and reveals the
  picture over `duration`; `out` covers the picture and holds the matte to the
  layer's end. `cut` holds the matte for the duration (in) or switches to it
  after (out): a two-frame `cut` in white is a flash frame. `crossfade` fades
  to or from the matte; `wipe` moves one edge in `direction`; `slice` splits the
  frame into `slices` bands that set off one after another. Easing is Anime.js
  `inOutCubic`. A dissolve from one clip straight into another is still two
  overlapping clips with an opacity `motion` (`set-placement`).
- **Grade** applies lift, gain and gamma, then contrast about mid-grey,
  saturation against Rec. 709 luma and a multiplied tint, and mixes the result
  in by `amount`. Alpha is kept.
- **Speed lines** are tapered streaks. Linear directions travel at `speed`
  passes a second, each line at its own seeded pace; `radial` draws manga focus
  lines that start where each ray meets the frame's edge and point toward the
  centre (`length` is a share of that ray), so every line is on screen, redrawn in steps (twelve a
  second at speed 1), like hand-drawn cels. `speed` 0 holds them still.
- **Styled title** slides a slanted `accent` plate in from off frame over the
  first 60% of `duration`, then slides the words through the plate's window
  from 30% to the end, both on the chosen Anime.js curve. `plate: false` keeps
  the window and its reveal without the fill. Place, scale or fade the whole
  card with the layer's placement; the fonts are the two the studio already
  bundles under the OFL.

Filters replace the composite below them, so put `grade` last to grade
everything, and a `shake` below the title to keep the words steady.

## Using them from an agent

An agent writes a bundle that carries the module entry from
`effects/project.json` and the matching file byte for byte at its
`file.path`. The Director refuses any other bytes or a changed schema
("Unregistered graphics module", "Recipe parameter schema changed") and
checks each layer's parameters against the schema ("Invalid parameters").
Within a project that carries an effect:

- `set-parameters` changes any of its parameters, checked against the
  schema: an unknown name, a choice outside the list, a number out of range or
  a colour that is not `#rrggbb` is refused with the reason.
- `add-graphic` places another layer of a recipe a layer already uses, with
  that layer's settings (a second flash cut on the transitions track, another
  shake); follow it with `set-parameters`.
- `genobi_project` lists each recipe's parameter names, types, ranges and
  choices.

Adding an effect that no layer in the project uses yet is the job of the
`add-graphic` change that takes full parameters; until it lands, an agent adds
the module and a first layer in the bundle it writes.

In the studio, the inspector shows a parameter with choices as a menu and a
`#rrggbb` parameter as a colour picker. A number field's arrows nudge by 0.05,
but any fraction in range is taken when typed (0.4 s where the minimum is
0.01); whole-number fields keep their whole steps.

## Checks

- `tests/director-effects.test.ts`: registration by hash, the worked example
  opens, a changed source or widened schema is refused, invalid parameters are
  refused on import, and `set-parameters`/`add-graphic` accept and refuse as
  above.
- `tests/director-effects-frames.test.ts`: each effect draws the same frame
  however it is reached, plus the shake's seed and decay, matte coverage for
  each transition type and phase, one streak per speed line and the title at
  rest.
- `tests/director-effects-shake.test.ts`: the shake as the viewer sees it. The
  shader's own sampling, evaluated per screen pixel over a centred marker,
  moves the marker at most the amplitude and never reads past an edge, at five
  frame sizes.
- `tests/director-effects-lines.test.ts`: part of every radial focus line lies
  inside the frame (sparse, short and thin lines included, at five sizes), each
  starts on the frame's edge, and travelling lines keep crossing the frame.
- `tests/director-effects-server.test.ts`: the server's project modules and
  the validator load under plain Node with tsx (no Vite) and trust the effects.
- `node scripts/check-director-bundle.mjs` validates the worked example.
- `node scripts/check-director-effects.mjs` (Chrome, against a Vite server,
  FFmpeg for the comparison) opens the example from a ZIP, seeks 80 → 20 → 130
  → 80 to identical pixels, checks the mattes, the flash and the title, edits a
  transition type in the inspector, keeps an off-grid duration (0.4 s) and
  scale (1.3) typed there, exports an MP4 and compares five frames
  with the preview. A second cut then measures the pixels: sparse, short radial
  lines show on screen, and an amplitude-64 shake moves the title's plate at
  most 64 px.
