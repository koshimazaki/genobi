---
tags: [director, sound, templates]
summary: Dance with Fruits, the character-swap mix template - 31 seconds of the owner's four LTX-2.5 Layout-to-Render (open weights) renders of one dance guide, swapped hard on the loop and the drop, with a speech-bubble title, Retro Gaming swap words baked into the media, a degrading surveillance scan and the house end card. Nothing to generate.
---

# Dance with Fruits: the swap edit

The fifth **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)),
added on 3 November 2026: a voxel dancer between two fruits, and every loop a
different character. All four renders were made on the **same guide and the
same audio window**, so a cut between two of them at the same frame keeps the
pose, the fruits, the floor and the camera and changes only the dancer. It
replaces the ffmpeg build (`audio-reactive/edit/fruits-swap-build.sh`), whose
Nokia pixel-font cards the owner turned down as "too much": this cut uses the
house recipes, like the other mix templates. In the Gallery it is the fifth
card, **Dance with Fruits · Character swap**. Version 2 (the owner's review of
v1, 3 November 2026) is described [below](#version-2).

| Piece    | Where                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Template | `shared/templates/fruits-swap.ts`                                                                             |
| Cut      | `shared/templates/fruits-swap.cut.json`                                                                       |
| Media    | `public/media/director-templates/fruits-swap/`                                                                |
| Tests    | `tests/fruits-swap.test.ts`, `tests/mix-speech-bubble.test.ts`, `tests/gallery-badges-order.test.ts`          |
| Render   | `TEASER_EXAMPLE=fruits-swap node scripts/render-genobi-teaser.mjs out/`                                       |
| Workflow | [the swap template](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits-template.md) |

## The footage

Four LTX-2.5 Layout-to-Render (open weights) renders the owner made from
window 0 of the explode guide
(`char-<name>-explode-w0`, [fruits.md](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits.md)),
each from the owner's own look still: 193 frames, 2048 × 1152, 24 fps,
8.04 s, with the loop muxed in. Only the picture is bundled, encoded once at
1920 × 1080 (libx264, CRF 19, no sound, `+faststart`), 4 to 5 MiB each:

| File                         | What it is                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `fruits-swap-mecha.mp4`      | the grey and gold mecha, 2 November render (`mecha-explode-fruit-song-w0`): the fruits burst and reassemble |
| `fruits-swap-gorilla.mp4`    | the gorilla, banana and apple, 3 November                                                                   |
| `fruits-swap-gold-ninja.mp4` | the gold ninja, banana and watermelon, 3 November, with WATERMELON baked into frames 115 to 143             |
| `fruits-swap-pink-cat.mp4`   | the pink cat girl, banana and apple, 3 November                                                             |
| `fruits-swap-card-1.jpg`     | frame 187 of the mecha, darkened, with GORILLA baked in; held by swap card 1                                |
| `fruits-swap-card-2.jpg`     | frame 187 of the ninja, darkened, with PINK CAT baked in; held by swap card 2                               |
| `fruits-swap-end-card.jpg`   | the mecha's frame 0, a centred square, on the end card                                                      |

The workflow (the LTX-2.5 22B IC-LoRA Layout-to-Render graph) has no registry
entry of its own, so the gallery badge names the open LTX-2.5 entry
(`ltx-2-5-open`): _LTX-2.5 · open weights_. Its licence is the LTX-2.x
Community License ([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md#lightricks-ltx)).

## The track

The owner's "Dance with Fruits" (music by Koshimazaki, owner-made): the 9.0 s
loop that starts on the voice (`mecha-fruits-9s-A2-starts-on-voice.wav`,
101.33 BPM, 15.2 beats a loop). The renders' own audio starts sample-aligned
with that loop (measured lag 0), so a render placed at its loop's start plays
on the music it was made for. The bundle (`fruits-swap-track.mp3`) is the loop
four times, cut at 30.6 s (three loops and a 3.6 s tail, the voice coming
round again under the end card), faded out over the last 2.4 s and raised by
a linear 0.6 dB to -14.0 LUFS (true peak -1.4 dBFS), MP3 320 kb/s. The loop
was already at -14.4 LUFS, so nothing is compressed.

## The cut

51 beats at **100 BPM** and 24 fps: 734 frames, 30.58 s. The song is
101.33 BPM, but its loop is 9.0008 s; at 100 BPM a loop is exactly 15 beats,
so the loop restarts (beats 15 and 30) land on whole beats at 9.0 s and
18.0 s. Inside a loop the grid drifts at most 0.12 s from the song's beats;
the drop-beat cut lands about 50 ms after the song's beat 8. Every shot starts its
render at the position its loop has reached in the track
(`tests/fruits-swap.test.ts` checks it to a frame), so the dancers stay on
the music.

| Beats | Seconds     | What plays                                                                       |
| ----- | ----------- | -------------------------------------------------------------------------------- |
| 0–13  | 0.00–7.79   | Mecha from the loop start (the voice); screen open, then the title bubble 2–6    |
| 13–15 | 7.79–9.00   | Swap card 1: Space.js tracks the held mecha frame, **GORILLA** on it             |
| 15–23 | 9.00–13.79  | Gorilla on the loop restart, under a surveillance scan that degrades             |
| 23–28 | 13.79–16.79 | Gold ninja on the drop (beat 8 of loop 2, render at 4.79 s), **WATERMELON**      |
| 28–30 | 16.79–18.00 | Swap card 2: Space.js tracks the held ninja frame, **PINK CAT** on it            |
| 30–43 | 18.00–25.79 | Pink cat on the loop restart                                                     |
| 43–51 | 25.79–30.58 | End card: MADE WITH / GENOBI / DANCE WITH FRUITS, as the voice comes round again |

Each render covers 8.04 s of its 9 s loop (13.4 beats), so a loop is 13 beats
of picture and a two-beat card; the card also hides the render's seam. The
swaps themselves are hard cuts: never a crossfade, the pose carries across.

## The look

Every layer is a trusted recipe. One was added for this piece:
`speech-bubble` (below).

- **Title** (`speech-bubble`): over beats 2 to 6 a comic speech bubble pops
  out up and to the left of the mecha's head, its tail on the head, saying
  DANCE WITH FRUITS in IBM Plex Mono, Signal black on white.
- **Swap cards** (`space-hud`, Space.js by Patrick Schroen): `card: true`
  layers that hold the outgoing character's last frame, with Space.js trackers
  locking onto the dancer and both fruits, `SWAP // MECHA OUT` and
  `NEXT · GORILLA`. The card stills are darkened already, so `dim` is 0.
- **Swap words, baked**: GORILLA and PINK CAT on the card stills, WATERMELON
  slammed over the ninja's drop frames (the `kinetic` slam's motion, frame by
  frame: in from 2.2×, a decaying shake, a dark flash), so the dance never
  stops twice in one loop. They are set in Retro Gaming, see
  [the typeface](#the-typeface). Everything drawn live stays in IBM Plex Mono.
- **Surveillance scan on the gorilla loop**: `crt` scanlines, the `hud`
  reading `● REC  CAM 02 // SUBJECT GORILLA`, a `ui-focus` target box on the
  dancer's middle third (measured from the gorilla's frames 0 to 176:
  x 0.30, y 0.04, 0.40 × 0.92 of the frame) for four beats, then a `scan`
  lock on the head for four. Under them the picture degrades as the loop goes:
  the `dither` filter every two beats, amount 0.4, 0.6, 0.8, 1.0 at 8, 5, 3
  and 2 levels, then `wire-scan` (a lime wireframe sweep) at 0.45 on beat 21
  and 0.9 on beat 22, just before the WATERMELON cut.
- **Cuts**: a `slice-glitch` on every cut (beats 13, 15, 23, 28, 30) and a
  `signal-wipe` into the end card, centred on beat 43.
- **End card** (`end-card-still`): the Dimensions mix's construction end
  card with the piece's own still, as Bloom closes on its character. The plain
  `end-card` shows the Dimensions creature beside the words, which the first
  render here showed was wrong for this piece. MADE WITH / GENOBI / DANCE WITH
  FRUITS, credits MUSIC · DANCE WITH FRUITS and KOSHIMAZAKI · VIDEO LTX-2.5,
  lime and lilac, the mecha beside them.

## The speech bubble recipe

`speech-bubble` (`docs/director-bundle/example/graphics/mix-speech-bubble.mjs`,
registered in the studio example `studio.json` with the other mix recipes,
since a mix takes its recipes from there) is a Canvas 2D overlay under the
`animejs` entry. A rounded bubble with a thick outline and a tail whose tip
sits just off an anchor point; it grows from the tip with an overshoot over
`duration`, then holds. Every parameter is required and schema-checked:

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

The bubble is kept inside the frame; the tail stretches to follow. Every
frame is a function of the layer's time alone (`tests/mix-speech-bubble.test.ts`:
seek order, the pop, line breaks, frame bounds, schema refusals).

## The typeface

The swap words are set in **Retro Gaming** by Daymarius (Vasily Draigo),
which the owner chose for this piece. dafont lists it as "100% Free", but the
font names "All rights reserved" and its download carries no licence text, so
there is no written grant to redistribute the font file. It is not bundled
and no recipe asks for it. It was used once, on the owner's computer, to bake
the words into three media files ([`audio-reactive/edit/fruits-swap-bake-type.py`](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/edit/fruits-swap-bake-type.py)): the two card stills and the ninja's drop frames. Those are the owner's
artwork; the font file stays on that computer. Changing a word means baking
again with the font installed.

## The rule it follows

The owner's general rule for a dance edit on a loop
([fruits.md](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits.md#the-general-rule-any-dance-edit-on-a-loop)),
kept where it does not conflict with the house look:

1. The grid is the measured loop: every cut on a beat.
2. A character lands on a loop restart or on the drop beat (beat 8).
3. A swap is a hard cut at the same guide frame.
4. Cards take the last two beats of a loop.
5. The mid-loop swap gets no card: its word is slammed over the picture.
6. Cleanest characters first (mecha, gorilla), the fruit change in the middle,
   the funniest last.
7. End on a beat with the name.

Rules 6 and 7 of the old build (pixel ramps, a 256 × 144 Nokia canvas) are
replaced by the house recipes: slice glitches and Signal type.

## How to repeat it

1. **Inputs.** Copy, never move, and rename on copy: each render to
   `fruits-swap-<character>.mp4`, the loop to `fruits-swap-track.mp3`.
   All renders must come from the same guide window.
2. **Measure, do not assume.** The loop period and the beat from the audio
   (here 9.0008 s and 101.33 BPM) and the lag between the renders' audio and
   the loop (here 0). Pick the mix tempo that puts the loop restarts on whole
   beats (15 beats a loop: 100 BPM).
3. **Encode once.** 1920 × 1080, CRF 18 to 20, no sound, `+faststart`; each
   file under 25 MiB. The track: loop × 4, cut after three loops plus the end
   card, fade, linear gain to -14 LUFS, MP3 320 kb/s.
4. **Write the cut as data.** A loop is 13 beats of shot and a two-beat card;
   a drop-beat swap starts at beat 8 of its loop with `sourceSeconds` at its
   position in its own loop. Cards hold a still of the outgoing frame (the
   frame after the slice's last). `checkMix` must pass.
5. **Bake the words** (with Retro Gaming installed): darken each card still to
   55 % and set the next name at 160 px, white over a Signal-black offset,
   without anti-aliasing; render the mid-loop word as the `kinetic` slam,
   frame by frame, and overlay it on that clip's drop frames when encoding.
6. **Render** with the in-page renderer:
   `TEASER_URL=http://127.0.0.1:4317 TEASER_EXAMPLE=fruits-swap TEASER_MBPS=16 node scripts/render-genobi-teaser.mjs out/`,
   then a gallery copy under 25 MiB, a preview and a poster from a strong
   frame.
7. **Look at the contact sheet** before calling it done.

## Version 2

From the owner's review of v1 (3 November 2026):

- **Typeface**: "Retro Gaming … was a good font for this". Baked into media,
  not bundled ([the typeface](#the-typeface)); the live `kinetic` slams are
  gone.
- **Speech bubble**: the title DANCE WITH FRUITS pops out of the mecha in a
  comic bubble (the new `speech-bubble` recipe).
- **Gorilla as a surveillance camera**: the REC HUD, focus box and head lock
  stay; the picture posterizes in steps and turns to wireframe before the drop.
- **Fruit motion**: the fruits barely moved in the 3 November mecha render,
  so the mecha is the owner's 2 November render on the same guide pose and
  loop, where the fruits burst into flying blocks and reassemble (about three
  times the fruit motion, measured). The other three characters are still
  the 3 November renders.

## Limits

- Nobody listened to the render here: the cut points are beat arithmetic on
  the measured loop, checked against frames.
- The target box is placed from contact sheets, not tracked; the gorilla
  stays in it because the dance keeps to the centre third.
- The swap cards' Space.js targets are placed by eye on the held frames.
- The baked words cannot be edited in the Director; the bubble, HUD, labels
  and end card can.
- The gorilla, ninja and pink cat renders still have the 3 November fruit
  motion; only the mecha was re-rendered.
- No showcase record yet (`docs/director-bundle/showcase/`); the cut opens
  from its gallery card and `/director?example=fruits-swap`.
