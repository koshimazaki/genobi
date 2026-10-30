---
tags: [director, sound, licences]
summary: The Genobi teaser, the second mix template - two minutes of the studio in use cut to the owner's track at 135 BPM at 1920 × 1080, with 4K studio footage replayed in a browser, the owner's ComfyUI recording, Paper Shaders, a taste-layer credit, Transitions.dev titles run unchanged, and how to repeat it with every owner correction.
---

# Genobi teaser

The second **mix** template (`run: "mix"`), built the way the
[Dimensions mix](dimensions-mix.md) is: a finished cut of bundled media,
written as data, that the Director opens and **Render MP4** renders. Nothing
is generated, quoted or paid. `/director?example=genobi-teaser` opens it and
`&workspace=editor` opens the cut as lanes.

- Data: `shared/templates/genobi-teaser.cut.json` (the cut, in beats and
  source seconds), `genobi-teaser.ts` (the template and its media),
  `mix.ts` (`checkMix`, `mixProject`).
- Footage: `public/media/director-templates/genobi-teaser/ui-*.mp4`, recorded
  by `scripts/capture-genobi-teaser.mjs` (shots in
  `scripts/genobi-teaser-shots.mjs`), with what the pointer did in each in
  `docs/genobi-teaser-footage.json`.
- Recipes: `docs/director-bundle/example/graphics/teaser-*.mjs`, registered in
  `studio.json` and loaded by `src/director/teaser-recipes.ts`; the stage
  `public/motion/stage/stage.js`.
- Render: `scripts/render-genobi-teaser.mjs`.

Its history is a [showcase project](director-bundle/showcase/genobi-teaser/README.md): v1, v2 and v3 open in the Editor from the gallery card's **How it was made** list.

## The music

"Trailer-Genobi", the owner's own track (119.6 s, 48 kHz stereo), bundled
whole with permission as `teaser-track.mp3`. Measured on 30 October 2026
with the studio's own analysis (`shared/audio-analysis.ts`, the code behind
the Editor's beat grid) and a per-bar NumPy pass; nobody listened here.

- **Tempo 134.99 BPM** (261 of 265 beats on one line, 6 ms residual,
  confidence 0.83); the cut uses 135. First downbeat at 1.741 s.
- **Grid:** 37 ms of silence before the track put a bar line on frame 0, so
  cut beat 4 is the track's first downbeat and every bar of the track starts
  on a cut beat that is a multiple of 4. 269 beats, 2,869 frames at 24 fps,
  119.5 s (the renderer's limit is 120 s).
- **Sections** (cut beats): intro 0–36 with a break at 28–36; build 36–76,
  break 72–76; drop 92 (the biggest change, +15 dB); breaks 136–140 and
  232–236 (the low band drops out); drops 156 and 188; the final drop
  236–260; the outro 260–269 has no bass.
- **Loudness:** the master measures -15.7 LUFS, -3.1 dBTP; +1.7 dB of plain
  gain gives -14.3 LUFS, the mixes' convention. 192 kb/s MP3, 3.1 MB.

## The cut

Version 2 (30 October 2026, after the owner watched version 1), with
version 3's footage ([Version 3: creatures](#version-3-creatures)). Times
are cut seconds; a beat is 0.444 s.

| Cut beats (time) | Section        | What plays                                                                                                                                                               |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0–12 (0:00)      | Open           | `gen-title`: GENOBI traced glyph by glyph, "THE AI FILM STUDIO YOU DIRECT", with its agent log; `gen-status` "Booting the studio" → Studio ready                         |
| 12–20            | First shot     | `gen-image` builds the forest guardian, then the clip plays from that frame; status "Generating shot 01 · FLUX 3"                                                        |
| 20–36            | Generations    | Forest guardian, a flower creature, a lightning creature, HUD; MAKE on the break                                                                                         |
| 36–60            | Make           | Gallery; Camera's model families (Upscale, H3, FLUX) boxed; the prompt                                                                                                   |
| 60–66 (0:26.7)   | Camera control | Camera's camera controls (BFL's camera terms: Arc shot, High angle, the combined preview); callout "CAMERA CONTROLS" (owner: 0:27)                                       |
| 66–76            | Make           | The quote, boxed; a loader; a vine creature built by `gen-image`; DIRECT                                                                                                 |
| 76–81            | Direct         | The Director playing the Dimensions mix                                                                                                                                  |
| 81–86 (0:36.0)   | Three.js       | The owner's ComfyUI recording, close on the World Builder node's live Three.js scene; callout "★ THREE.JS" (owner: 0:36, where the vocal sings it)                       |
| 86–92 (0:38.2)   | ComfyUI        | One continuous move out from that node to Genobi's graph (director_world_builder and Koshi nodes); no text over it (the owner: the canvas speaks for itself)             |
| 92–140           | Direct         | Drop on beat 92; the Editor; shot and lens pickers; the rendered Dimensions mix; Send to Genobi; BUILD WORLDS                                                            |
| 140–156          | Build          | 3D World Builder (orbit, build tools); drop on beat 156                                                                                                                  |
| 156–172 (1:09.3) | Agents         | "bring your own agent harness / guide it with your taste library": the Genobi brief, boxed; status "Brief: a 20 s teaser on the beat" → "Nothing runs until you approve" |
| 172–175 (1:16.4) | Shaders        | "shaders": Paper Shaders' dithering (black on lime), no title                                                                                                            |
| 175–178 (1:17.8) | Space.js       | Space.js's Tracker and Reticle lock onto a creature, readout SPACE.JS / PATRICK SCHROEN                                                                                  |
| 178–181 (1:19.1) | Transitions    | "transitions": the Transitions.dev image variant builds the neon bloom                                                                                                   |
| 181–192 (1:20.4) | Taste layer    | "creative references, with credit to the people who made them": TASTE LAYER typed in, ANDREW ZELLINGER first, then the libraries Genobi ships and credits                |
| 192–200 (1:25.3) | Licences       | "choose models with their licence information in view": the taste page's model and licence choices and each library's creator and licence                                |
| 200–210 (1:28.9) | Local, API     | "run supported workflows locally / an end-to-end open-weight path / functional APIs": the Upscale family (SeedVR2), boxed; FLUX through the API                          |
| 210–224 (1:33.3) | Save, reuse    | "save the project, reuse the flow": the Editor's Save JSON, boxed; the Director's saved project and templates                                                            |
| 224–236          | Remix          | Dual Swords; Scrolls; ONE STUDIO                                                                                                                                         |
| 236–260          | Final drop     | Twelve two-beat shots of the owner's creatures, glitches and HUD                                                                                                         |
| 260–269          | End card       | MADE WITH / GENOBI / THE AI FILM STUDIO YOU DIRECT / MUSIC · TRAILER-GENOBI / KOSHIMAZAKI MIX                                                                            |

The generations are the owner's: the forest guardian preview (a FLUX 3
image-to-video run), the three Dimensions mix clips, and since version 3 his upscaled
MiniMax H3 creature clips and the upscaled Dimensions mix render. Wider
sources are scaled to cover 16:9 with a shot's `zoom`.

**The lyric.** The section from 1:09 follows the vocal (owner's
transcription: "…Studio, explore, bring your own agent harness. Guide it with
your taste library. Shaders, transitions and creative references, with credit
to the people who made them, shape that selection around your work. Choose
models with their licence information in view. Run supported workflows
locally / an end-to-end open-weight path / functional APIs. Save the
project. Reuse the flow."). No transcription model was available offline
(an openai-whisper install without weights; nothing was downloaded), so the
times are **assumed**: "shaders" on the bar at 1:16.4 next to the owner's
"around 1:17", and each phrase after it on the following beats at speaking
pace, as the table shows. The owner confirms or moves them; each is a layer's
or a slice's `startBeat`.

**Composition:** 1920 × 1080, 24 fps, 2,869 frames. **Layers:** 124 of the
128 the Director holds (`LAYER_LIMIT`, shared/director/types.ts: the
importer, the project copy, splits and every Director command read it, and
the render cost was measured up to 192 clips). Version 1's ten camera-move
filters became shot moves, and the repeated Editor, Scrolls and 3D-preset
beats were cut, so one more clip of the owner's (one more layer) still fits.
Raising the limit would touch that constant, its tests and the measurement
note in docs/director-bundle/README.md; it was not raised.

### Camera moves

A UI slice carries `move` (shared/templates/mix.ts): over its first `ease`
beats it moves from the whole frame (or `from`) to a window centred on
(x, y) at `zoom`, then drifts on. `mixProject` makes it from the slice's own
two video layers with the Director's `motion`, so the picture is scaled from
the 3840 × 2160 source and a 2× move keeps native 1080p detail (version 1
zoomed the finished 1080p frame with a filter). The pointer and focus box
follow the same move through their `view` parameter (`viewParameter`); a
test checks every one matches its slice. Where no slice plays (the title, the
Paper Shaders beat, the taste layer, the end card), layers marked `card`
hold the frame.

## Version 3: creatures

The owner, 30 October 2026: _"remove the bicycle… or the bike and the
trees, and use more creatures and anime stuff across the board"_, so the
teaser and the Dimensions mix share one look, creatures and anime rather
than realism, and _"use his new upscaled footage"_. No beat, overlay or
lyric-synced card moved; only the footage behind twelve shots changed:

| Cut beat    | Was                                            | Now                                                                                                                |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 32          | Neon bloom (`audio-visual`)                    | `creature-04`: spines and lightning                                                                                |
| 69–76       | Motorbike (`library-01`), built by `gen-image` | `creature-01`: the vine creature, built by `gen-image` from `still-creature.jpg`; status "Generating · MiniMax H3" |
| 116         | The Dimensions mix render                      | `dimensions-excerpt`: the owner's upscaled render                                                                  |
| 240, 252    | Neon bloom                                     | `creature-05`, `creature-04`                                                                                       |
| 246         | Forest trees (`library-03`)                    | `creature-02`: a creature among orbs                                                                               |
| 250, 258    | Toy creatures, neon bloom                      | `creature-transform`                                                                                               |
| 254         | Forest guardian                                | `creature-03`                                                                                                      |
| 28, 96, 238 | Toy creatures (`product`)                      | `creature-03`, `creature-05`, `creature-01`                                                                        |

The creature clips are the owner's MiniMax H3 (open weights) outputs,
upscaled by the owner; the teaser bundles only the seconds it plays of each,
at 1920 × 1080, H.264 two-pass at 3.2 Mb/s, about 1 to 1.6 MB a file
(`creature-training-01` to `05`, `creature-transformation-01`,
`dimensions-mix-excerpt` in `public/media/director-templates/genobi-teaser/`).
The Signal reel, `audio-visual`, `product` and both library clips left the media, so
the project's media was **96.0 MB** at first and is 146.5 MiB after the quality pass below (v2: about 110 MB) and the Editor saves
edits to its project copy: today's limit is 150 MiB (`PROJECT_BYTES`),
so about 3.5 MiB of headroom is left; v2 went over the old 100 MB limit.
The gallery, Camera, camera-controls and Dual Swords takes were recorded
again, so the interface shows the upscaled media: the Dimensions mix card,
and Camera's library with the owner's upscaled creature clips (the bundled library); the Camera prompt now types
"as the creature wakes up". The pointer and the Camera shots' source
times follow the new footage log.

The card names what made the generated footage (`MIX_FOOTAGE` in
`shared/gallery/catalogue.ts`): MiniMax H3 (open weights) for the creatures
and FLUX 3 video (API) for the forest guardian; the rest is studio screen
recordings, as the template's description says.

### Version 3, quality pass (owner's review of the v3 render)

- **Takes recorded again at full quality**, same choreography and pace:
  gallery, Camera, camera controls, Director, Editor, directions, 3D, Dual
  Swords, Scrolls and Agent at 3840 × 2160, CRF 18, using the current studio cards. The licences and save takes keep
  their v2 recordings: the taste page's labels moved since, and the save
  take timed out on a loaded machine. Shots follow each take's new timings
  (each slice's source shifted by the median change of its logged events).
- **0:19–0:24, the Editor timeline** (`ui-timeline`, beats 44–54): a clip
  moved along its lane, its end edge trimmed, the cut tool, then Regenerate
  opened (nothing sent). The Camera families take it replaced already plays
  later (beats 200–210); the prompt shot now starts at beat 54.
- **About 1:18:** Space.js and the Transitions.dev reveal share one flower
  creature (`still-flower-creature.jpg`, 1920 × 1080 from the owner's
  upscale), so no character switches before the TASTE LAYER, which now
  carries the owner's line: "Libraries, shaders, transitions and creative
  references — we credit the people who made them; shape that selection
  around your work."
- **Sources encoded once:** creature excerpts from the owner's 4K and 5K
  upscales at CRF 20, the Dimensions excerpt at CRF 22, the ComfyUI take
  from the owner's original recording at CRF 16 (3378 × 1900 crop, no
  upscale); the opening forest guardian builds from the 1918 × 820 FLUX
  start image (its clip is still the 960 × 406 preview; no larger source is
  in the repository). Project media 146.5 MiB, under the Editor's 150 MiB.
- **Output:** the submission master is CRF 16, AAC 320 kb/s, kept outside
  the repository; the gallery copy is a two-pass encode under 25 MiB.

## The footage

Each studio shot is a scripted walk through one part of the studio
(scripts/genobi-teaser-shots.mjs and, for the taste page and saving,
scripts/genobi-teaser-shots-taste.mjs), recorded at 1440 × 810 CSS pixels and 8/3
device pixels (3840 × 2160) through the DevTools screencast and sampled at
24 fps, H.264 CRF 23. Version 2 replayed version 1's takes (same actions,
waits and clicks; the owner: "Record as before, those were great actual
takes") at the new density and added Camera's camera controls. The script
aborts every POST that could spend (`/api/jobs`, chain and agent approvals)
and stubs both balance readouts (`/api/credits?provider=all` answers
`{balances}`); it never presses Generate, Submit, Approve, Confirm or Start.
Run it against your own server with keys that cannot spend:

```sh
COMFY_API_KEY=comfyui-capture-only BFL_API_KEY=bfl-capture-only \
  PORT=4317 node --import tsx server/index.ts
TEASER_URL=http://127.0.0.1:4317 node scripts/capture-genobi-teaser.mjs [shot…]
```

The footage has no pointer, zoom or highlight. The script logs every move and
click (time and the element's box as fractions of the frame) in
`docs/genobi-teaser-footage.json`; the cut's pointer, focus and moves were
placed from that log, so a recaptured shot is retargeted by editing numbers.

**The ComfyUI shot** (`ui-comfy.mp4`, 10 s) is the owner's own screen
recording of ComfyUI with Genobi's World Builder nodes (30 October 2026,
38.4 s at 3920 × 2158, 60 fps), used with permission: source 3.5 to 13.5 s,
cropped to 3378 × 1900 at (60, 258) to leave out the desktop, window chrome
and the canvas's debug readout, at 24 fps. Its pointer is the owner's own,
so it carries no pointer layer. A headless ComfyUI capture was tried first
and dropped for this recording; the original stays on the owner's machine.

| Weight                 | Version 1 | Version 2                | Version 3                      |
| ---------------------- | --------- | ------------------------ | ------------------------------ |
| Studio footage (ui-\*) | 17 MB     | 66 MB (eleven 4K shots)  | 73 MB                          |
| Gallery card           | 17 MB     | 21 MB (1080p, 1.3 Mb/s)  | 20.8 MB (1080p, 1.25 Mb/s)     |
| Largest file           | 17 MB     | 21 MB (the gallery card) | the Dimensions mix card, 24 MB |

Every public file stays under the 25 MiB Pages limit (a test holds it).

## The recipes

| Recipe         | Kind    | What it does                                                                                                                                                        |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gen-title`    | overlay | Transitions.dev UI generation, text and small-text variants: a title traced in dots, then inked, with an optional agent log and step line                           |
| `gen-image`    | overlay | Transitions.dev UI generation, image variant: a still of a bundled clip built as frame, tone sketch, halftone, colour dots, picture                                 |
| `gen-status`   | overlay | Four free Transitions.dev transitions in a Signal pill: matrix dot loader and shimmer text while working, success check and texts reveal at `doneAt`                |
| `ui-zoom`      | filter  | A camera move on the finished frame below (version 1; version 2 moves the slices themselves, see Camera moves)                                                      |
| `paper-shader` | overlay | Paper Shaders (paper.design, Apache-2.0): Paper's own ShaderMount and shaders (mesh gradient, dot orbit, god rays, swirl, voronoi), stopped and set with `setFrame` |
| `ui-cursor`    | overlay | A pointer gliding through `path` (`t:x,y / …`) with click dips, rings and dotted halos at `clicks`; `view` follows the slice's move                                 |
| `ui-focus`     | overlay | Dims the frame outside a box, traces a dotted box round it, lands corner brackets and types a label; `view` follows the slice's move                                |
| `signal-wipe`  | overlay | A matte with a lime edge and a halftone band sweeps over a cut and off the far side                                                                                 |

They join the mix recipes (`kinetic`, `hud`, `slice-glitch`, `end-card`).
Every parameter is required and checked against the registry's schema; a
still must be a `/media/` path, colours are hex, text cannot carry control
characters and is set with `textContent`.

`paper-shader` sizes Paper's host at the layer's pixels with a matching
`maxPixelCount`, so Paper renders at a render scale of 1 on any screen
(`u_pixelRatio` 1: the glitter is the same size on a Retina preview as in
the 1× export, checked in Chrome at device pixel ratio 1 and 2), and stops
Paper's resize observer after the first size.

`space-hud` builds Space.js's own `Tracker` and `Reticle` (`@alienkitty/space.js`
1.2.0, MIT) on a hidden element, stops Space.js's shared ticker and steps it
from the layer's time in 1/60 s ticks (replaying from 0 on a backward seek),
and rasterises the DOM it styles inline, scaled from Space.js's own pixel
sizes to the frame, so it is the same at any device pixel ratio.

`gen-title`'s small line takes " / " for a list, and `plate` puts it on a
Signal plate so a callout reads over the interface.

**Layer order**, bottom to top: end card, cards (title, reveal, Paper mesh,
taste layer), Paper overlays, pointer, focus, reveals, status, callouts,
slams, HUD, wipes, glitches.

### The stage

`gen-*` recipes open a private same-origin frame, load the upstream file
unchanged and `public/motion/stage/stage.js` beside it, and rasterise the
frame into the layer's canvas through an SVG image, as the end card does.
The text and image variants use the effect's own scrubbable `timeline()` and
`seek(ms)`. The CSS transitions are paused and set to the layer's time with
the Web Animations API (the loader from 0, the done state from `doneAt`, and
reset without a transition when the playhead goes back). Because an SVG
image plays nothing, the stage bakes each animated value into a rule for its
element (pseudo-elements too), turns canvases into images of their pixels
and inlines images and the bundled fonts. Same parameters, same pixels, in
any seek order.

## The transitions

From [Transitions.dev](https://github.com/Jakubantalik/transitions.dev) by
Jakub Antalik, upstream commit `e3aefb554d8fd2cb3e91e773e82a0f2d5a4f82a0`
(29 October 2026), **free tier only**:

| Transition                      | Upstream source                                                    | Here                                                   |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| UI generation: text, small-text | `skills/transitions-ui-generation/text-image-generation.{js,css}`  | `public/motion/text-generation/`, byte for byte        |
| UI generation: image            | the same file                                                      | the same                                               |
| Matrix dot loader               | `skills/transitions-dev/31-matrix-loader.md` (CSS and dot builder) | `public/motion/transitions-dev/matrix-loader.{css,js}` |
| Shimmer text                    | `15-shimmer-text.md`                                               | `shimmer-text.css`                                     |
| Success check                   | `10-success-check.md`                                              | `success-check.css`                                    |
| Texts reveal                    | `18-texts-reveal.md`                                               | `texts-reveal.css`                                     |
| UI generation: skeleton-texts   | (already vendored, older pin)                                      | the end card, `public/motion/construction/`            |

The CSS files carry only an added provenance header; each folder keeps the
upstream `LICENSE.txt`. The licence allows use and modification inside our
product and forbids republishing the collection or a substantial part of it
as a library or motion pack; Pro transitions were not used. See
[licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md#the-genobi-teasers-transitions).
Our own Signal recipes (`kinetic`, `hud`, `slice-glitch`, `signal-wipe`,
`ui-focus`) carry the rest of the look.

## Changing it

The cut is data. An agent (or a person in the Editor) can:

- **Retime a shot:** change its `startBeat`/`beats` in the cut and the next
  shot's start; `checkMix` refuses gaps, overlaps and slices that run past
  their source.
- **Change words:** `set-parameters` on the layer, for example
  `{layerId: "title", parameters: {line: "…"}}`, `end-card` for the credits,
  `make`/`direct`/`build`/`remix`/`one` for the slams.
- **Retarget a move or box:** a slice's `move` takes the window's centre and
  zoom, `ui-focus` the box (fractions of the frame); read the element's box
  from `docs/genobi-teaser-footage.json`, then refresh the overlays' `view`
  with `viewParameter`.
- **Move a callout:** the `callout-*` layers are `gen-title` with `plate`;
  their start beat is the time (cut seconds = beat × 60 / 135). "★ THREE.JS"
  is `callout-threejs` at beat 81 (0:36.0).
- **Move the pointer:** edit `path` and `clicks` on the `cursor-<beat>` layer.
- **Swap a generation:** point a shot at another bundled clip in
  `genobi-teaser.ts` (and its `cropY` or `zoom`).

Keep the project at 128 layers or fewer (it is at 124) and under 120 s.

## Upscaled generations

The owner may upscale the generation clips still in the media (the FLUX 3
forest guardian and the Dimensions mix clips; the creature clips already are)
and supply them; each is a drop-in replacement, so the cut does not change:

| Asset id        | Today's file                                                |
| --------------- | ----------------------------------------------------------- |
| `character`     | `public/media/template-gallery/character-piece.mp4`         |
| `mix-01` … `03` | `public/media/director-templates/dimensions-mix/mix-0N.mp4` |

1. Put the upscaled file at
   `public/media/director-templates/genobi-teaser/gen/<asset id>.mp4` (same
   duration and frame rate, any resolution, under 25 MiB).
2. Add the id to `UPSCALED` in `shared/templates/genobi-teaser.ts` (and its
   `durationSeconds` if it changed).
3. Re-render: `TEASER_URL=http://127.0.0.1:4317 node scripts/render-genobi-teaser.mjs out/`,
   then re-encode the gallery card (below). The slice is scaled from the
   file's own resolution, so a 4K upscale stays sharp at 1080p.

## How to repeat it

The recipe an agent follows to make this piece again or the next one like
it (the `genobi-teaser` skill runs the same steps). Memory first: the brief
and every correction are in `docs/genobi-teaser-memory.json`, recorded on a
project copy by `node scripts/seed-genobi-teaser-memory.mjs <copyId>` as
`decision` interpretations quoting the owner, with the reusable rules as
Taste proposals the owner activates (never activated by the script).

**The brief** (owner, 30 October 2026): "make the teaser video with Genobi
usage and the music we have", built like the Dimensions mix, "going through
functions, so the agent can actually show stuff: zoom in, click, use
effects, loaders, cool interface", with a range of Transitions.dev
transitions, ours included, and "more of the generations we have".

**Inputs:** the track (Trailer-Genobi, 119.6 s); the studio, driven by
scripts/genobi-teaser-shots.mjs; the owner's generations already in
public/media; the owner's ComfyUI screen recording; the libraries in
docs/credits/libraries; free Transitions.dev transitions; Paper Shaders.

**Recording UI takes** (the owner, 30 October 2026: _"the recordings
should be made in higher quality initially, and use the new cards; all the
animations, all the pace, everything is fine — they should be made exactly
the same, but recorded in higher resolution"_). Replay the same scripted
takes, unchanged in choreography, timing, pointer paths, clicks and pace;
only resolution and the current cards change. `scripts/capture-genobi-teaser.mjs`
records at 3840 × 2160, refuses a take below that, encodes once at CRF 18
(higher only to stay under the 25 MiB Pages limit) and prints the commit it
records from. Run the studio on the branch being cut, merged with main, and
check each take's first frame shows the current cards. Why: every camera
move crops the take, so a low-resolution or heavily compressed take turns
into artifacts on screen, and a studio on an older branch shows old cards.
Keep intermediates near-lossless until the final encode; the submission is a
high-bitrate master (CRF 16, AAC 320 kb/s), the gallery copy a two-pass
encode under 25 MiB.

**Steps:**

1. Analyse the track with `shared/audio-analysis.ts` (tempo, downbeat,
   drops); put a bar line on frame 0 (here 37 ms of lead silence) and plan
   sections on the bars.
2. Start your own studio (above) and record the shots at 3840 × 2160 with
   `scripts/capture-genobi-teaser.mjs`; replay the same takes when
   re-recording. Check frames old against new at the same times.
3. Write the cut as data: slices on whole beats, `move` on every interface
   slice, overlays as recipe layers, `card` layers where no slice plays.
   Placing the pointer and boxes from the footage log and filling `view`
   is mechanical (the cut was written with a small generator; the JSON is
   the source of truth).
4. Check frames in the Director preview at the beats that matter, then
   render with `scripts/render-genobi-teaser.mjs` and look at a contact
   sheet.
5. Save memory as you go (AGENTS.md): a `decision` per correction, a
   `session-checkpoint` per capture or render, Taste proposals for rules.

**Corrections, round 1 (review of cut 1):** no provenance claims about
external clips (the creature clips are the owner's MiniMax H3 outputs, the
forest guardian a FLUX 3 run), naming only the models the piece used; the
Scrolls page is light,
so keep it short; every interface beat zooms onto one readable detail and
holds it at least about 1.3 s; the 3D shots wanted a richer set.

**Corrections, round 2 (the owner watched cut 1: "really really good"):**
"a bit blurry, too low res" and "internal looks lower res" (render 1080p,
record at 2×, no AI upscale); "Record as before, those were great actual
takes"; at about 1:14 "just paper shaders there, some of the shaders in the
same colours, maybe a glittering shader"; a TASTE LAYER section listing
what Genobi really ships; less repetition, room for one more of the owner's
videos; "we don't say about camera control, which is kind of a BFL thing"
(typed "camera controls" at 0:27); "★ Three.js" at 0:36 where the vocal
sings it, flowing into "the ComfyUI workflow we have, it's a Comfy
competition, it's on brand" at 0:38, with the World Builder's Three.js scene
manipulated live (the owner's own recording).

**Corrections, round 3 (the owner watched v2: "much better in terms of
quality"):** the shader beat opens on Paper's dithering shader, lighter, with
no "PAPER SHADERS" title; Space.js right after the shaders, for variety
instead of another typed title; the section from 1:09 follows the lyric
(above); keep the taste layer, with ANDREW ZELLINGER first in its list; no
text over the ComfyUI shot; the generation clips will be upscaled by the
owner and swapped in as files (Upscaled generations); a Retina preview must
match the 1× export (the Paper and Space.js recipes draw at a fixed scale).

**Corrections, round 4 (version 3, 30 October):** _"remove the bicycle… or
the bike and the trees, and use more creatures and anime stuff across the
board"_, with the owner's new upscaled footage, and everything visible in
the Genobi Editor ([Version 3: creatures](#version-3-creatures)).

**Rules learned:** creatures and anime, never realistic footage, across the teaser and the mixes; keep the project's media under the 150 MiB project-copy limit (`PROJECT_BYTES`), so bundle only the seconds a shot plays; name only the models that made the footage (MiniMax H3 open weights, FLUX 3 video API); never claim provenance beyond that; hold readable interface beats at least 1.3 s; record the
interface at 2× the render; bundled fonts only (Instrument Sans, IBM Plex
Mono, Pixelify Sans, Nokia Cellphone FC); free Transitions.dev transitions
only, unchanged; never spend: no Generate, Submit, Approve or queued prompt
in any capture; never drive the owner's own server or ComfyUI.

**Correction, 30 October (owner):** the quote's box (`focus-66`) showed its
words too briefly; asked, the owner said "Fix it". A label counts as readable
once fully typed (a box types it from `draw` × 0.5 for 0.4 s) and until it
fades or the reveal card covers it. `focus-66` now draws in 0.1 s and the
reveal card starts on beat 70 (2 beats) instead of 69, so its label reads for
1.33 s; `focus-108`, `-164` and `-200` draw in 0.3 s (1.32 s); `focus-124`
and `-210` draw in 0.1 s and fade at their end (1.33 s). No beat moved; the
gallery card was not re-rendered.

## Re-render

1. Start your own server (above), then
   `TEASER_URL=http://127.0.0.1:4317 node scripts/render-genobi-teaser.mjs out/`
   (Chrome, FFmpeg). It opens `/director?example=genobi-teaser&workspace=editor`,
   presses **Render MP4** and saves `render.mp4` and a contact sheet.
2. For the gallery card, re-encode the 1080p render in two passes (about
   1.5 Mb/s video, 128 kb/s AAC, under 25 MiB) and take the poster from the
   GENOBI title frame (the gallery's first card shows it, and link previews
   use it): since 30 October 2026, 4.7 s into the v3 render, the wordmark
   fully drawn, a 1920 × 1080 JPEG of about 30 kB
   (`ffmpeg -ss 4.7 -i render.mp4 -frames:v 1 -q:v 3 -map_metadata -1 genobi-teaser.jpg`).
   The gallery card reads "Genobi teaser · Product teaser".

## Limits

- Nobody listened to the cut here; cut points are beat arithmetic on the
  analysed grid, checked against frames.
- The footage is a recording of a local studio with no account: the balance
  is a stub, the gallery and library show what this repository bundles, and
  the agent bubble is typed into, never started.
- Scrolls is a light paper page in a dark film: each Scrolls shot is four
  beats, zoomed onto its dark cells or camera dialog.
- The HUD says what the studio did ("CUT IN GENOBI"), not where the clips
  came from: the creature clips are the owner's MiniMax H3 outputs and the
  forest guardian a FLUX 3 run, made before this cut.
- Paper Shaders runs from the npm package `@paper-design/shaders` 0.0.81
  (Apache-2.0, pinned exactly; the newest release was under two weeks old).
- The construction end card keeps its older upstream pin; the new upstream
  `ui-generation.js` was not adopted.
