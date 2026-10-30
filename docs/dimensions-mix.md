---
tags: [director, sound]
summary: The Dimensions mix, the first mix template - a 23-second Supernatural Creatures teaser cut from three bundled clips to the owner's track at 140 BPM, with Signal overlays, a construction end card and nothing to generate.
---

# Dimensions mix

The first **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)):
a finished 23-second teaser, "Supernatural Creatures", cut from three bundled
clips to the owner's track "Dimensions" (Koshimazaki Mix, Bob Macc master),
with the Signal look on top. Nothing
is generated, quoted or paid. It is the second card in the Gallery (after the Genobi teaser), read
"Dimensions mix · Anime teaser" since 30 October 2026, when it replaced the
Anime teaser card, and the first
template in the Director's list; `/director?example=dimensions-mix` opens it
and `&workspace=editor` opens the cut as lanes. A generated version comes
later as its own template.

The composition opens at **1920 × 1080**. Resolution also offers 540p, 720p
and Match assets. The bundled 720 px creature squares, recorded showcase
projects and existing 540p gallery preview keep their original sizes.
See [composition resolution and monitors](director-resolution.md).

- Data: `shared/templates/dimensions-mix.cut.json` (the cut), `dimensions-mix.ts`
  (the template and its media), `mix.ts` (`checkMix`, `mixProject`).
- Director: `src/director/mix-template.ts` builds the bundle; `MixPlan.tsx`
  shows the cut in the simple Director; `TemplateCards.tsx` lists it first.
- Gallery: the drawer shows the preview and the cut, and offers Take it to
  Director and Take it to the editor, never Generate (`MixFields.tsx`).
- Media: `public/media/director-templates/dimensions-mix/`; preview:
  `public/media/template-gallery/dimensions-mix.mp4` and `.jpg`: since 30
  October 2026 the owner's upscaled render at 1920 × 1080 (two-pass H.264,
  8 Mb/s, its continuous audio unchanged, 24 MB), at the quality the
  teaser's interface takes are recorded from; it needs a size pass before
  the Cloudflare deploy.

**One optional step after it.** Once the cut is rendered, the person may
upscale it 2× (the current 1920 × 1080 composition to 3840 × 2160) with SeedVR2, the open upscaler
(`mix.upscale` in `dimensions-mix.ts`; [SeedVR2](seedvr2-upscale.md)). It is
opt-in, quoted and confirmed like any run, never automatic, and the tier
stays Open. The simple Director shows it under the cut, and an agent's
Regenerate prompt on this project names it as optional.

The cut is data: re-timing a slice, renaming a creature or moving an overlay is
an edit to `dimensions-mix.cut.json`, which `checkMix` holds to the grid.

Its history, version by version, is a [showcase project](director-bundle/showcase/dimensions-mix/README.md): each version opens in the Editor from the gallery card's **How it was made** list.

## The beat

Measured on 29 October 2026 from the MP3 with ffmpeg and a short NumPy pass
over low-passed PCM (no listening; the owner's ear decides):

- **Tempo: 140 BPM.** Correlating the low band 4 to 20 bars apart gives 139.93
  to 140.40, 140.0 on average; bar onsets at 27.32, 29.04, 30.75, 32.46 and
  34.17 s are 1.712 s apart.
- **In-point: 25.55 s.** The track falls almost silent at 25.54 s (peak
  0.0004), the drop's attack starts at 25.549 s and peaks about 25.575 s. That
  is the first downbeat of the full-energy loop (low band about -24 dB before
  20 s, -6 dB from 26 s). The strong low hit at 21.935 s, after a short gap,
  is the start of a build (rolls from 23 to 25.3 s) and is 8.49 beats before
  the drop, off its grid: opening there instead is an option, with a beat offset.
- **Grid:** composition frame 0 is that downbeat (`beatOffsetSeconds` 0), four
  beats a bar. The cut is 54 beats (13.5 bars): 12 bars of creatures and a
  10-beat end card that holds to the last frame. At 24 fps a beat is 10.2857
  frames and cuts round to the nearest frame: 555 frames, 23.125 s.
- **A mix takes its fps from its clips.** The sources are 24 fps, so the
  composition is 24 fps and no frame is repeated. The cut file stores beats
  and source seconds only; `mixProject` derives every frame from the fps, so
  changing it is one number.
- **Audio:** the excerpt 25.55 to 48.75 s (23.2 s), 48 kHz 16-bit WAV, a 1.6 s
  fade under the held end card, -6.41 dB of plain gain to -14.1 LUFS (peak
  -3.8 dBFS). The master
  measures -7.6 LUFS with true peaks over 0 dBTP, so dynamic loudness
  normalisation was not used.

## The slices

Clips are the owner's three 1440 px square, 24 fps MiniMax outputs, kept at
24 fps as 720 px squares, sound removed, about 2 to 3 MB each. A slice covers the 16:9 frame (scale 1920/1080)
and is moved so its window starts `cropY` pixels down the 1440 px square:
cropped per slice, not letterboxed. The cut stores beats and source seconds;
the frames here are derived at 24 fps.

| #   | Clip              | Source (s) | Beats | Timeline s (frames at 24 fps) | Bar.beat | Action                              |
| --- | ----------------- | ---------- | ----- | ----------------------------- | -------- | ----------------------------------- |
| 1   | C (forest)        | 0.30       | 0–4   | 0.00–1.71 (0–41)              | 1.1      | Nocthorn · slash on the drop        |
| 2   | A (lake)          | 1.00       | 4–8   | 1.71–3.42 (41–82)             | 2.1      | Mirebloom · splash                  |
| 3   | B (desert plinth) | 1.29       | 8–14  | 3.42–6.00 (82–144)            | 3.1      | Duneward · eyes ignite (scan)       |
| 4   | C (forest)        | 2.20       | 14–16 | 6.00–6.88 (144–165)           | 4.3      | Nocthorn · belt flare               |
| 5   | A (lake)          | 4.00       | 16–20 | 6.88–8.58 (165–206)           | 5.1      | Mirebloom · core opens              |
| 6   | B (desert plinth) | 5.00       | 20–24 | 8.58–10.29 (206–247)          | 6.1      | Duneward · parts fly                |
| 7   | C (forest)        | 4.00       | 24–28 | 10.29–12.00 (247–288)         | 7.1      | Nocthorn · orb head                 |
| 8   | A (lake)          | 6.00       | 28–32 | 12.00–13.71 (288–329)         | 8.1      | Mirebloom · bursts apart            |
| 9   | A (lake)          | 7.92       | 32–36 | 13.71–15.42 (329–370)         | 9.1      | Mirebloom · reassembled (title hit) |
| 10  | B (desert plinth) | 8.00       | 36–40 | 15.42–17.12 (370–411)         | 10.1     | Duneward · robed form               |
| 11  | C (forest)        | 9.00       | 40–42 | 17.12–18.00 (411–432)         | 11.1     | Nocthorn · red-ring head            |
| 12  | B (desert plinth) | 12.00      | 42–44 | 18.00–18.88 (432–453)         | 11.3     | Duneward · final form               |
| 13  | End card (layer)  | –          | 44–54 | 18.88–23.12 (453–555)         | 12.1     | End card · produced by Genobi 2026  |

The creatures are named in the cut, and the owner can rename them: **Nocthorn**
(forest, horned), **Mirebloom** (lake, flower) and **Duneward** (desert plinth).
The structure is a cold open on the drop, the creature beats, the title slam on
the biggest hit (bar 9: the reassembled form lands on the downbeat) and the end
card on the last bar, then black. Row 13 is not a slice: since 29 October 2026
the end card is the `end-card` recipe layer ([below](#the-end-card)), and
`checkMix` lets the shots stop where one opaque graphics layer holds to the
end of the cut.

## The recipes

Eight new recipes in the trusted registry (`docs/director-bundle/example/studio.json`),
each a file under `graphics/` with its SHA-256, every parameter required and
nothing else accepted, checked on import, on the project copy and on every
command. Each frame is a function of the layer's time alone. They follow the
Signal theme's look ([construction motion](construction-motion.md)): Signal
black `#0c0e0c`, paper `#eaf2df`, lime `#d5ff70`, lilac `#e6a1ff`, muted
`#98aa84`, IBM Plex Mono readouts. They are our own code, not the upstream effect; the end card loads that effect unchanged.

| Recipe         | Mode    | Parameters                                                                                                         | In the cut                                                                                                                                      |
| -------------- | ------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `screen-open`  | overlay | `color`, `matte`, `duration` 0.1–8 s, `glyphs` 0–64, `seed`                                                        | A line draws across a matte, then opens to the frame over seeded glyph rain; bar 1                                                              |
| `build-panel`  | overlay | `side` left or right, `title`, `lines` (`/` separated), `color`, `muted`, `accent`, `bpm`, `duration`              | A dotted panel traces itself, skeleton bars resolve into words, a step dot pulses; names each creature                                          |
| `scan`         | overlay | `color`, `accent`, `text`, `x`, `y` 0–1, `bpm`                                                                     | Dotted corner marks, a dotted reticle that locks on the beat, a dotted leader to the name on a dark plate at the frame edge; Duneward, bars 3–4 |
| `wire-scan`    | filter  | `color`, `amount`, `sweep` s, `trail`                                                                              | A sweep line with the picture's Sobel edges as a wireframe in its wake; under the scan                                                          |
| `kinetic`      | overlay | `text` (`/` breaks), `font` (a CSS family stack), `weight`, `color`, `accent`, `bpm`, `size`, `beats`              | Flash, slam from oversize with a decaying shake, beat pulse, snap shut; IGNITE, SHIFT and the title                                             |
| `hud`          | overlay | `color`, `accent`, `bpm`, `text`, `credit`, `seconds`                                                              | Dotted side rails lit on the beat, bar readout, `MUSIC / DIMENSIONS` credit, dotted progress                                                    |
| `slice-glitch` | filter  | `amount`, `slices`, `seed`, `duration` s                                                                           | Bands jump sideways with an RGB split and decay; on seven hits                                                                                  |
| `end-card`     | overlay | `eyebrow`, `title`, `subtitle`, `credit1`, `credit2`, `font`, `color`, `accent`, `steps`, `done`, `duration` 1–8 s | The construction effect builds the card on the last bar and it holds ([the end card](#the-end-card))                                            |

**Readouts** (HUD, build panels, scan) are near-white mono (`#f6f8f2`, muted
`#c9d2c0`); lime is kept to the screen open, the wireframe, the scan's lock
and the title's fill. The slams (IGNITE, SHIFT) and the title's offset block
are the same near-white: they were lilac `#e6a1ff` until the owner's note of
29 October 2026 ("change the popping up stuff from pink to white"). Build panels are plain dotted boxes at the frame's edge, so a
creature's name sits beside it, never over it.

**Fonts.** `kinetic` and `end-card` take a CSS family stack. The slams
(IGNITE, SHIFT), the title slam and the end card's title use one bundled
pixel face: `"Nokia Cellphone FC", "Pixelify Sans", monospace`.

- Nokia Cellphone FC (Zeh Fernando) is bundled as
  `public/motion/fonts/nokia-fc/nokiafc22.woff2` with its notice
  `nokiafc22.txt`, which says "distribute as you wish to who you wish" and
  "Do NOT sell this font" ([fonts](motion-fonts.md)). `mix-fonts.css`,
  loaded by `mix-recipes.ts`, registers it wherever a mix can preview or
  export, and the end card's frame loads the same file, so every browser
  draws the same face, Brave and Safari included. Pixelify Sans 700 (SIL OFL
  1.1) stays as the fallback.
- On the owner's decision of 29 October 2026 the mix no longer uses
  Explorers (proprietary; web use needs Studio Innate's Extended Licence) or
  Retro Gaming (the font file says "All rights reserved" and its archive has
  no licence, so it is not bundled). Before that the slams and title used
  `"Retro Gaming", "RetroGaming", "Pixelify Sans", monospace` and the end
  card's title Explorers, which only Chrome on a machine with those fonts
  installed could show.
- The HUD, build panels and scan stay in IBM Plex Mono: those are the Signal
  look's readouts and their recipes take no font. The end card's other lines
  are IBM Plex Mono too.

The live preview and Render MP4 run the same renderer in the same page and
resolve the stack the same way, so they agree; with every face bundled, a
preview in Brave or Safari now draws what a render in Chrome draws. The clip
inspector says which face is drawn
([fonts in the Director](motion-fonts.md#fonts-in-the-director)). The bundled
gallery preview was rendered before these changes, so it still shows the
older faces and the old credit until it is rendered again (see
[How it was made](#how-it-was-made)).

## The end card

The last bar is the Signal theme's construction effect, Jakub Antalik's
**UI generation / skeleton-texts** from Transitions.dev, building an original
card: a still of the forest clip, "PRODUCED BY", "GENOBI 2026",
"SUPERNATURAL CREATURES" and the track credit ("MUSIC · DIMENSIONS",
"KOSHIMAZAKI MIX"). The build takes about 2.8 s (a
2.6-second drawing; the effect's run is 1.09 times that) and the finished
card holds to the last frame, with no fade to black; the music fades under it.

**It is a layer you can edit, not a video.** Until 29 October 2026 the card
was `mix-end.mp4`, a frame-by-frame capture of a local page; its words were
pixels, so a credit could not be changed without the page. The card is now
the `end-card` recipe (`docs/director-bundle/example/graphics/mix-end-card.mjs`,
registered in `studio.json`) on the `end-card` layer, frames 453 to 555, below
the filters so the bar-12 glitch still runs over it. Its words are
parameters:

| Parameter            | Default                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `eyebrow`            | `PRODUCED BY`                                                                     |
| `title`              | `GENOBI 2026` (set smaller when longer than the card)                             |
| `subtitle`           | `SUPERNATURAL CREATURES`                                                          |
| `credit1`, `credit2` | `MUSIC · DIMENSIONS`, `KOSHIMAZAKI MIX`                                           |
| `steps`, `done`      | `Finding the signal / Assembling the form / Bringing it into focus`, `First look` |
| `font`               | `"Nokia Cellphone FC", "Pixelify Sans", monospace` (the title)                    |
| `color`, `accent`    | `#d5ff70` (title), `#e6a1ff` (subtitle)                                           |
| `duration`           | `2.6` s, the drawing; the build is 1.09 times it                                  |

To change the text, select **End card · produced by Genobi 2026** in the
Editor and edit the fields in the inspector, or have an agent send
`set-parameters {layerId: "end-card", parameters: {credit2: "…"}}`
(`genobi_project` lists the names, types and limits). The preview and Render
MP4 redraw the build with the new words; everything else is the same.

How it draws: the recipe loads the effect unchanged from
`public/motion/construction/` into a private 960 × 540 frame with the
capture page's own layout and Signal colours, runs its `generate()` on the
effect's injectable clock, and rasterises the frame into the layer's canvas
through an SVG image, the way the capture took a screenshot per frame. A frame
is reached by building once and advancing the clock, so the same parameters
give the same pixels in any seek order. The frame ignores the viewer's
reduced-motion and dark-scheme settings, so preview and export agree. It
is checked in Chrome, which Render MP4 needs anyway; every face it uses is
bundled. The capture set its title in
Explorers at 57 px; the recipe sets it in Nokia Cellphone FC at 48 px, on that
face's 8 px grid, so the title is the one deliberate difference from the capture. The still (`end-card.jpg`, 300 px) is the capture's own: a
frame of the forest clip (`mix-03`, about 11.2 s) cropped to the creature.

The capture page (`end.html`, 29 October) was recovered and is the recipe's
layout. With the capture's own words and Explorers title it matched frames of
the old capture within H.264 noise (mean difference about 2 of 255); the
defaults now read "KOSHIMAZAKI MIX" with the title in the bundled pixel face. The template no longer ships `mix-end.mp4`.

### Projects saved before the editable card

A project saved before 30 October 2026 carries the card as that video: a
`shot-13` layer on asset `mix-end` (`media/mix-end.mp4`), frames 453 to 555.
Opening the Dimensions mix opens the saved project copy rather than the
template, so such a project never got the editable card. On the owner's own
copy (revision 79) an agent had hidden the capture (opacity 0) because its
baked credit was wrong, and the overlays it added in its place were later
removed, so frames 453 to 555 showed only the background: card 13 was
missing in the Editor.

Now a Dimensions mix (its id, or a showcase version's, and the template's
three clips and track at their bundled hashes) with a `mix-end` video layer
and no `end-card` layer is upgraded as it opens; any other project, even one
with a file of that name, is left as it is. It runs on the project copy and on Open bundle
(`shared/templates/mix-end-card-upgrade.ts`, `src/director/upgrade-bundle.ts`):

- The `end-card` recipe layer is added over the same frames, right above the
  old layer, with the cut's words (credit "KOSHIMAZAKI MIX"); its subtitle is
  the project's title slam on one line when it fits.
- The old video layer stays where it was, its opacity untouched: nothing is
  dropped. The opaque card covers it; delete it when you no longer want it.
- It is an ordinary edit on top of the copy: the notice says so, Undo goes
  back to the copy as saved, and the next push saves the upgrade, so an agent
  reading the copy afterwards sees the card too.
- It runs once: the upgrade adds the `end-card` recipe to the project, and a
  project that has it is never upgraded again, so a card the person deletes
  stays deleted.
- It is the studio's edit, not the person's: if an agent writes to the copy
  first, the studio takes the agent's revision (and upgrades that), without
  offering to put "your version" back over it.

A second fault hid the whole picture, card included: Program stayed blank
after Gallery › Take it to the editor, or after switching from the Director
to the Editor. The Editor wraps Program in its row and the simple Director
does not, so the switch mounts a new canvas, and the renderer kept drawing
into the old one. The stage now reports each canvas it mounts and the
renderer is rebuilt on the one showing (`DirectorStage.tsx`,
`useDirectorRuntime.ts`).

The effect keeps its own licence and credit
([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md#motion-effect-and-hackathon-disclosure)):
the recipe is Genobi integration code that loads it, not a copy of it.

## How it was made

1. ffmpeg conformed the clips and the track excerpt; frame sheets placed the
   hits.
2. The cut was written as data and opened in the Director from a bundle.
3. The Director's own renderer (Render MP4, headless Chrome) rendered
   `/director?example=dimensions-mix`. Since 30 October 2026 the gallery card
   plays the owner's upscaled render instead: 1920 × 1080, two-pass H.264 at
   8 Mb/s, its continuous audio copied unchanged (24 MB), ending on the
   editable KOSHIMAZAKI MIX card. **Pending:** a 720p, detail-preserving size
   pass before the Cloudflare deploy.

To refresh the preview (every face is bundled now, so any machine gives the
same frames):

1. `npm run dev`, then open
   `/director?example=dimensions-mix&workspace=editor` in Chrome or Edge.
2. Edit the end card's words in the inspector if wanted, press **Render MP4**
   and download the video (or run `node --import tsx scripts/check-end-card.mjs`,
   which renders it to `.local/end-card/render.mp4`).
3. Upscale it if wanted, then re-encode for the card at 1920 × 1080:
   `ffmpeg -y -i render.mp4 -c:v libx264 -preset slow -b:v 8000k -pass 1 -an -f mp4 /dev/null`
   and `ffmpeg -i render.mp4 -c:v libx264 -preset slow -b:v 8000k -pass 2 -c:a copy -movflags +faststart dimensions-mix.mp4`
   (under the 25 MiB Pages limit; `tests/dimensions-mix.test.ts` holds it
   to that, and the watch page reports 1920 × 1080).
4. Take the poster at 8 s:
   `ffmpeg -ss 8 -i dimensions-mix.mp4 -frames:v 1 -q:v 3 dimensions-mix.jpg`,
   and replace both files in `public/media/template-gallery/`.

## Checks

`tests/dimensions-mix.test.ts`: each recipe's hash, required parameters and
refusals; the cut's grid, tiling and refusals; the bundle is deterministic and
valid; the template is a mix the planner refuses, first in the gallery and the
Director, with a watch page. `tests/dimensions-mix-copy.test.ts`: the bundle
round-trips through the local server's project copy route.
`tests/dimensions-mix-end-card.test.ts`: the end card's registration,
defaults and refusals, its place in the project, `set-parameters` on its
words, and a project saved with `mix-end.mp4` still building and validating.
`tests/dimensions-mix-old-copies.test.ts`: such a project gets the editable
card over its baked one with nothing dropped, once; and the owner's saved copy
opens upgraded as an undoable edit that the next push saves.
`tests/director-stage-remount.test.tsx`: the stage reports the canvas the
Editor mounts. `node scripts/check-editor-program.mjs` (Chrome, against the
local server): Gallery › Take it to the editor draws card 13 at frames 500
and 554, and Director › Editor keeps Program drawing.
`tests/dimensions-mix-end-card-lifecycle.test.ts`: disposing the layer mid-build
leaves no frame in the page, and a lone UTF-16 surrogate in the words is drawn
as U+FFFD rather than breaking every render.
`node --import tsx scripts/check-end-card.mjs` (Chrome, against Vite, FFmpeg
and git): the old bundle opens upgraded and Undo restores it; frames 453, 520
and 554 are the same in any seek order, are saved
beside the same frames of the cut with the baked capture, the inspector's
title field re-renders the card, and Render MP4 keeps 555 frames.

## Limits

- Nobody listened to the cut here; cut points are beat arithmetic checked
  against onsets and frames.
- The template opens as it is: there is no drop zone for your own clips yet.
- The upscale step is described, not wired to a button: the person renders
  the MP4 and takes it to Camera › Upscale (or asks the agent). No upscale of
  the mix has run.
- Tier reads Open: the mix generates nothing, and its clips are the owner's
  MiniMax H3 (open weights) outputs;
  they carry MiniMax's disclosure duty. They can be upscaled on Comfy with the
  open SeedVR2 step ([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)).

An imported bundle upgrade is applied only while that exact opened revision is
still current. An edit or saved-copy reload during recipe loading takes precedence.
