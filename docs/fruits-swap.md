---
tags: [director, sound, templates]
summary: Dance with Fruits, the character-swap mix template - 31 seconds of the owner's four LTX-2.5 Layout-to-Render (open weights) renders of one dance guide, swapped hard on the loop and the drop, with Signal swap words, a surveillance scan and the house end card. Nothing to generate.
---

# Dance with Fruits: the swap edit

The fifth **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)),
added on 3 November 2026: a voxel dancer between two fruits, and every loop a
different character. All four renders were made on the **same guide and the
same audio window**, so a cut between two of them at the same frame keeps the
pose, the fruits, the floor and the camera and changes only the dancer. It
replaces the ffmpeg build (`audio-reactive/edit/fruits-swap-build.sh`), whose
Nokia pixel-font cards the owner turned down as "too much": this cut uses the
house recipes and the house typeface, like the other mix templates. In the
Gallery it is the fifth card, **Dance with Fruits · Character swap**.

| Piece    | Where                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Template | `shared/templates/fruits-swap.ts`                                                                             |
| Cut      | `shared/templates/fruits-swap.cut.json`                                                                       |
| Media    | `public/media/director-templates/fruits-swap/`                                                                |
| Tests    | `tests/fruits-swap.test.ts`, `tests/gallery-badges-order.test.ts`                                             |
| Render   | `TEASER_EXAMPLE=fruits-swap node scripts/render-genobi-teaser.mjs out/`                                       |
| Workflow | [the swap template](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits-template.md) |

## The footage

Four LTX-2.5 Layout-to-Render (open weights) renders the owner made on
3 November 2026 from window 0 of the explode guide
(`char-<name>-explode-w0`, [fruits.md](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits.md)),
each from the owner's own look still: 193 frames, 2048 × 1152, 24 fps,
8.04 s, with the loop muxed in. Only the picture is bundled, encoded once at
1920 × 1080 (libx264, CRF 19, no sound, `+faststart`), 4 to 5 MiB each:

| File                         | Character                                              |
| ---------------------------- | ------------------------------------------------------ |
| `fruits-swap-mecha.mp4`      | the grey and gold mecha, banana and apple              |
| `fruits-swap-gorilla.mp4`    | the gorilla, banana and apple                          |
| `fruits-swap-gold-ninja.mp4` | the gold ninja, banana and watermelon                  |
| `fruits-swap-pink-cat.mp4`   | the pink cat girl, banana and apple                    |
| `fruits-swap-card-1.jpg`     | frame 187 of the mecha, held by swap card 1            |
| `fruits-swap-card-2.jpg`     | frame 187 of the ninja, held by swap card 2            |
| `fruits-swap-end-card.jpg`   | the mecha's frame 0, a centred square, on the end card |

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
| 0–13  | 0.00–7.79   | Mecha from the loop start (the voice); screen open over the first two beats      |
| 13–15 | 7.79–9.00   | Swap card 1: Space.js tracks the held mecha frame, **GORILLA** slammed           |
| 15–23 | 9.00–13.79  | Gorilla on the loop restart, under the CAM 02 surveillance scan                  |
| 23–28 | 13.79–16.79 | Gold ninja on the drop (beat 8 of loop 2, render at 4.79 s), **WATERMELON**      |
| 28–30 | 16.79–18.00 | Swap card 2: Space.js tracks the held ninja frame, **PINK CAT** slammed          |
| 30–43 | 18.00–25.79 | Pink cat on the loop restart                                                     |
| 43–51 | 25.79–30.58 | End card: MADE WITH / GENOBI / DANCE WITH FRUITS, as the voice comes round again |

Each render covers 8.04 s of its 9 s loop (13.4 beats), so a loop is 13 beats
of picture and a two-beat card; the card also hides the render's seam. The
swaps themselves are hard cuts: never a crossfade, the pose carries across.

## The look

Every overlay is an existing trusted recipe; nothing new was registered.

- **Swap cards** (`space-hud`, Space.js by Patrick Schroen): `card: true`
  layers that hold the outgoing character's last frame, with Space.js trackers
  locking onto the dancer and both fruits, `SWAP // MECHA OUT` and
  `NEXT · GORILLA`.
- **Swap words** (`kinetic`): GORILLA and PINK CAT on the cards, WATERMELON
  slammed over the picture on the drop, so the dance never stops twice in one
  loop. White on Signal black, in IBM Plex Mono, the studio's own face.
- **Surveillance scan on the gorilla loop**: `crt` scanlines, the `hud`
  reading `● REC  CAM 02 // SUBJECT GORILLA`, a `ui-focus` target box on the
  dancer's middle third (measured from the gorilla's frames 0 to 176:
  x 0.30, y 0.04, 0.40 × 0.92 of the frame) for four beats, then a `scan`
  lock on the head for four.
- **Cuts**: a `slice-glitch` on every cut (beats 13, 15, 23, 28, 30) and a
  `signal-wipe` into the end card, centred on beat 43.
- **End card** (`end-card-still`): the Dimensions mix's construction end
  card with the piece's own still, as Bloom closes on its character. The plain
  `end-card` shows the Dimensions creature beside the words, which the first
  render here showed was wrong for this piece. MADE WITH / GENOBI / DANCE WITH
  FRUITS, credits MUSIC · DANCE WITH FRUITS and KOSHIMAZAKI · VIDEO LTX-2.5,
  lime and lilac, the mecha beside them.

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
5. **Render** with the in-page renderer:
   `TEASER_URL=http://127.0.0.1:4317 TEASER_EXAMPLE=fruits-swap TEASER_MBPS=16 node scripts/render-genobi-teaser.mjs out/`,
   then a gallery copy under 25 MiB, a preview and a poster from a strong
   frame.
6. **Look at the contact sheet** before calling it done.

## Limits

- Nobody listened to the render here: the cut points are beat arithmetic on
  the measured loop, checked against frames.
- The target box is placed from contact sheets, not tracked; the gorilla
  stays in it because the dance keeps to the centre third.
- The swap cards' Space.js targets are placed by eye on the held frames.
- No showcase record yet (`docs/director-bundle/showcase/`); the cut opens
  from its gallery card and `/director?example=fruits-swap`.
