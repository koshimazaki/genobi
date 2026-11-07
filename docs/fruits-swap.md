---
tags: [director, sound, templates]
summary: Dance with Fruits, the content-swap mix template - 33 seconds of the owner's four LTX-2.5 Layout-to-Render (open weights) renders of one dance guide, opened by a splash of flying pixel fruit and a typed title, swapped hard on the loop and the drop, every word and icon a live layer in the Director, a neon-pink surveillance scan confined to the gorilla and the house end card. The clips are included, so it opens ready to edit at no cost.
---

# Dance with Fruits: the swap edit

The fifth **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)),
added on 3 November 2026: a voxel dancer between two fruits, and every loop a
different character. All four renders were made on the **same guide and the
same audio window**, so a cut between two of them at the same frame keeps the
pose, the fruits, the floor and the camera and changes only the dancer. It
replaces the ffmpeg build (`audio-reactive/edit/fruits-swap-build.sh`), whose
Nokia pixel-font cards the owner turned down as "too much"; this cut uses the
house recipes and six it added ([its recipes](fruits-swap-recipes.md)). In
the Gallery it is the fifth card, **Dance with Fruits · Content swap**.
[Versions](#versions) lists what each review changed.

| Piece    | Where                                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template | `shared/templates/fruits-swap.ts`                                                                                                                                       |
| Cut      | `shared/templates/fruits-swap.cut.json`                                                                                                                                 |
| Media    | `public/media/director-templates/fruits-swap/`                                                                                                                          |
| Recipes  | [typewriter, sprite swarm and shower, box scan, scan lock, speech bubble](fruits-swap-recipes.md)                                                                       |
| Media    | [`audio-reactive/edit/fruits-swap-media.py`](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/edit/fruits-swap-media.py): plain encodes and stills        |
| Tests    | `tests/fruits-swap.test.ts`, `tests/mix-live-words.test.ts`, `tests/mix-pixel-recipes.test.ts`, `tests/mix-speech-bubble.test.ts`, `tests/gallery-badges-order.test.ts` |
| Render   | `TEASER_EXAMPLE=fruits-swap node scripts/render-genobi-teaser.mjs out/`                                                                                                 |
| Workflow | [the swap template](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits-template.md)                                                           |

## The footage

Four LTX-2.5 Layout-to-Render (open weights) renders the owner made from
window 0 of the explode guide
([fruits.md](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits.md)),
each from the owner's own look still: 193 frames, 2048 × 1152, 24 fps,
8.04 s, with the loop muxed in. Only the picture is bundled, encoded once at
1920 × 1080 (libx264, CRF 19, no sound, `+faststart`), 4 to 5 MiB each:

| File                         | What it is                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `fruits-swap-splash.mp4`     | the splash, 2.5 s of Signal black for the pixel-fruit shower to fly over ([the opening](#the-opening)) |
| `fruits-swap-mecha.mp4`      | the mecha on the fruit loop with cue swaps, 2 November (`mecha-fruit-song-vox`), plain                 |
| `fruits-swap-gorilla.mp4`    | the gorilla, banana and apple, 3 November                                                              |
| `fruits-swap-gold-ninja.mp4` | the gold ninja, banana and watermelon, 3 November, plain                                               |
| `fruits-swap-pink-cat.mp4`   | the pink cat girl, banana and apple, 3 November                                                        |
| `fruits-swap-card-1.jpg`     | frame 187 of the mecha, darkened, no words; held by swap card 1                                        |
| `fruits-swap-card-2.jpg`     | frame 187 of the ninja, darkened, no words; held by swap card 2                                        |
| `fruits-swap-end-card.jpg`   | the mecha's clean frame 0, a centred square, on the end card                                           |

The workflow (the LTX-2.5 22B IC-LoRA Layout-to-Render graph) has no registry
entry of its own, so the gallery badge names the open LTX-2.5 entry
(`ltx-2-5-open`): _LTX-2.5 · open weights_. Its licence is the LTX-2.x
Community License ([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md#lightricks-ltx)).

## What made each shot

Each dancer slot records what made it (`mix.recipes` in
`shared/templates/fruits-swap.ts`), so **Make my version** shows the still
beside the slot and **Recreate in Camera** restores it
([Recreate in Camera](director-generate.md#recreate-in-camera)). The stills
are the owner's look stills, the first frame each LTX-2.5 Layout-to-Render
take started from, 1360 × 765, encoded once as JPEG quality 90 into
`public/media/director-templates/fruits-swap/stills/`:

| Slot                     | Still                               | Size    | Preset                               | Still prompt                  | Render prompt           |
| ------------------------ | ----------------------------------- | ------- | ------------------------------------ | ----------------------------- | ----------------------- |
| `fruits-swap-mecha`      | `stills/fruits-swap-mecha.jpg`      | 181 KiB | `fruit-mecha`                        | the owner's, given 7 November | not tied with certainty |
| `fruits-swap-gorilla`    | `stills/fruits-swap-gorilla.jpg`    | 187 KiB | `char-gorilla-explode`               | the owner's, given 4 November | executed, 3 November    |
| `fruits-swap-gold-ninja` | `stills/fruits-swap-gold-ninja.jpg` | 226 KiB | `char-gold-ninja-watermelon-explode` | not recorded                  | executed, 3 November    |
| `fruits-swap-pink-cat`   | `stills/fruits-swap-pink-cat.jpg`   | 199 KiB | `char-pink-cat-explode`              | not recorded                  | executed, 3 November    |

A record's `prompt` is the still's own prompt, which Camera restores; a
prompt not written down is listed in `missing` and Camera says it is not
stored. The three character stills were made in Genobi Image (a FLUX 3 Klein
edit) with the mecha's still as a **shape guide only**, so their records
carry that still as `guide`, and Camera receives both images, the guide
first, then the character's still. The gorilla's still prompt, as the owner
wrote it:

> voxel gorilla standing on the floor dancing human size making dance moves
> with vox banana floating on one side and vox apple on the other vox fruits
> advert studio shot, cinematic view, wide angle lens use image 1 for shape
> guide only, its floating in the air

The mecha's own still prompt, as the owner wrote it (given 7 November), is the
same shape with the mecha as the subject. The image 1 it names, the mecha
picture it was made from, is not kept, so its record lists the shape guide as
missing and Camera says so:

> voxel mecha standing human size making dance moves with vox banana floating
> on one side and vox apple on the other vox fruits advert studio shot,
> cinematic view, wide angle lens use image 1 for shape guide only, its
> floating in the air

`renderPrompt` is the video prompt each take's render bundle executed,
quoted exactly from the run's workflow (`char-gorilla-explode-w0`,
`char-gold-ninja-watermelon2-explode-w0`, `char-pink-cat-explode-w0`); Camera
does not restore it. The mecha's clip is the 2 November render; the
fruit-mecha preset page's render prompt is not what the 2 November bundles
executed (they read "each fruit changes into another fruit"), and which of
them made this clip is not recorded, so the mecha has no render prompt.

Each still was compared with the bundled clip's first frame and chosen by the
take's own name in the run (for the gold ninja, the watermelon look, near
identical to the plain gold ninja's). The mecha's still is the same file as
the fruit-mecha preset's owner still. No take records which Camera model or
settings would make it again.

## The track

The owner's "Dance with Fruits" (music by Koshimazaki, owner-made): the 9.0 s
loop that starts on the voice (`mecha-fruits-9s-A2-starts-on-voice.wav`,
101.33 BPM, 15.2 beats a loop). The renders' own audio starts sample-aligned
with that loop (measured lag 0). The bundle (`fruits-swap-track.mp3`) opens on
the loop's last 2.4 s (its last four beats at 100 BPM, a pickup under the
splash), then plays the loop from the voice at 2.4 s, round and round, cut at
33.0 s, faded over the last 2.4 s and raised by a linear 0.6 dB to -14.0 LUFS
(true peak -1.4 dBFS), MP3 320 kb/s. The loop was already at -14.4 LUFS, so
nothing is compressed. The cut's `inPointSeconds` (6.5998) is where the
bundle starts in the loop.

## The cut

55 beats at **100 BPM** and 24 fps: 792 frames, 33.0 s. The song is
101.33 BPM, but its loop is 9.0008 s; at 100 BPM a loop is exactly 15 beats,
so with four splash beats the loop restarts land on beats 4, 19 and 34
(2.4 s, 11.4 s, 20.4 s). Inside a loop the grid drifts at most 0.12 s from
the song's beats; the drop-beat cut lands about 50 ms after the song's beat 8.
Every dance shot starts its render at the position its loop has reached in
the track (`tests/fruits-swap.test.ts` checks it to a frame).

| Beats | Seconds     | What plays                                                                   |
| ----- | ----------- | ---------------------------------------------------------------------------- |
| 0–4   | 0.00–2.40   | Splash: pixel fruit fly across Signal black, thickening on beat 2            |
| 4–17  | 2.40–10.20  | Mecha on the loop restart; the title types; a fruit swarm rides its shoulder |
| 17–19 | 10.20–11.40 | Swap card 1: Space.js tracks the held mecha frame, **GORILLA** on it         |
| 19–27 | 11.40–16.20 | Gorilla on the loop restart, under the surveillance scan; its box degrades   |
| 27–32 | 16.20–19.20 | Gold ninja on the drop (beat 8 of loop 2, render at 4.79 s), **WATERMELON**  |
| 32–34 | 19.20–20.40 | Swap card 2: Space.js tracks the held ninja frame, **PINK CAT** on it        |
| 34–47 | 20.40–28.20 | Pink cat on the loop restart; from beat 45 pixel fruit flood the frame       |
| 47–55 | 28.20–33.00 | End card, already built: MADE WITH / GENOBI / DANCE WITH FRUITS              |

Each render covers 8.04 s of its 9 s loop (13.4 beats), so a loop is 13 beats
of picture and a two-beat card; the card also hides the render's seam. The
swaps are hard cuts, never crossfades, each marked by a `slice-glitch`.

## The opening

Since version 5 (the owner: "this is cool, love icons") the splash is the
pixel fruit alone and the typed line on the mecha is the only title.

- **The splash** is four beats of Signal black (a plain shot) with
  `sprite-shower` flying pixel fruit across it: 50 sprites, then 90 from
  beat 2.
- **The title types on the grid** (`typewriter`): DANCE WITH FRUITS in
  Press Start 2P, two characters every eighth note (0.3 s), a neon-pink block
  cursor after it that blinks on the eighth, over the mecha's first seven
  beats.
- **A swarm of the same pixel fruit rides the mecha's right shoulder.** It
  covers a known defect of the opening render, the mannequin-hand bug: in its
  first 2.3 s a third hand shows near the right shoulder (frames 36 to 54,
  x 0.42 to 0.65, y 0 to 0.35 of the frame). The swarm is a layer
  (`sprite-swarm`, 180 sprites): the fruit fly in along their own rays from
  clip frame 19, settle within half a second into a swirling disc (radius
  0.172 of the frame's width, centred on x 0.535, y 0.21) that bobs on the
  beat, and burst outward at clip frame 60, once the clip is clean. The
  render was checked at full resolution over clip frames 36 to 54. This hides the defect; it does not fix it. The fix is a
  re-render with exactly the same character as the still.

Versions 3 and 4 opened on an apple-logo splash, the voxel apple cut from the
render and DANCE WITH FRUITS landing on beats 2 and 3 (ordering (a) of the
owner's two), and the apple flew onto the mecha's shoulder to cover the hand.

## The look

- **Swap cards** (`space-hud`, Space.js by Patrick Schroen): `card: true`
  layers that hold the outgoing character's last frame, with Space.js trackers
  on the dancer's head and both fruits, `SWAP // MECHA OUT` and
  `NEXT · GORILLA`, in the cut's pink (Space.js draws its readout text in
  the same colour as its lines). The stills are darkened already, so `dim`
  is 0.
- **One pink**: every line and plate is neon pink `#ff4dff` and every word
  white (version 5; brighter in version 6). No pink token exists in the studio's themes
  (`src/motion/motion-theme.css` holds only Signal lime), so the value is the
  cut's own.
- **Words, live**: the typed title (`typewriter`), GORILLA and PINK CAT
  slammed over the held cards and WATERMELON over the drop (`kinetic`), in
  Press Start 2P, see [the typeface](#the-typeface). The readouts and the end
  card keep the studio's IBM Plex Mono.
- **The gorilla as a surveillance camera**: `crt` scanlines over the frame,
  the `hud` (`● REC  CAM 02 // SUBJECT GORILLA`), a `ui-focus` target box on
  the dancer's middle third (x 0.30, y 0.04, 0.40 × 0.92, measured from the
  gorilla's frames, no tag: the HUD names the subject) for four beats, then
  a lock on the head (`scan-lock`): ACQUIRING GORILLA, then the plate turns
  pink and reads GORILLA SALSA / DANCE UNLOCKED, under
  light `crt` scanlines. Only that box takes a surveillance look, with
  `box-scan`, kept subtle so the gorilla still reads as the gorilla:
  posterize on brightness alone (no colour shift) at 0.2, 0.3, 0.4 and 0.5
  with 8, 7, 6 and 6 steps every two beats, then the wireframe at 0.25 and
  0.5 over the last two beats before the WATERMELON cut, the box's edge
  softened over 0.06 of the frame. The fruits and the studio outside it stay
  clean.
- **Into the end card**: pixel fruit thicken from beat 45 (`sprite-shower`,
  120 then 380 sprites, flying up) until they flood the frame, and the end
  card comes up under them already built: its layer starts its recipe 4 s in
  (`offsetSeconds`, the layer's `animationOffsetFrames`), so the card's
  dot-matrix construction is skipped.
- **End card** (`end-card-still`): MADE WITH / GENOBI / DANCE WITH FRUITS,
  credits MUSIC · DANCE WITH FRUITS and KOSHIMAZAKI · VIDEO LTX-2.5, the
  title white and the subtitle pink, the mecha beside them.

## The typeface

The pixel words are set in **Press Start 2P** (CodeMan38, SIL OFL 1.1),
bundled at `public/motion/fonts/press-start-2p/` with its `OFL.txt` and
registered with the Director's faces ([fonts](motion-fonts.md)), so every
browser draws it and any recipe's `font` can ask for it. It was chosen as the
closest OFL face to **Retro Gaming** by Daymarius, the owner's pick in
versions 2 to 6, which cannot ship: the font names "All rights reserved" and
its download carries no licence text. Retro Gaming was compared against Press
Start 2P and Silkscreen on one image and is not used anywhere in the cut.

## Changing the words and icons

Every word and icon is a layer: select it on the timeline, edit its recipe
controls in the inspector, and drag or trim the clip to change when it plays.

| Layer                                       | Recipe                        | What to change                                                                                 |
| ------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Title · DANCE WITH FRUITS, typed            | `typewriter`                  | `text`, `font`, `size`, `x`/`y`, `chars` a step and `division` (steps a beat), the colours     |
| Swap word · GORILLA / WATERMELON / PINK CAT | `kinetic`                     | `text`, `font`, `size`, `beats` held                                                           |
| Pixel fruit · swarm over the shoulder       | `sprite-swarm`                | `x`/`y`, `radius`, `count`, `size`, `gather`, `burst` (seconds from its start), `swirl`, `bob` |
| Pixel fruit · the splash, the flood         | `sprite-shower`               | `density`, `speed`, `direction`, `size`, `seed`                                                |
| Scan · gorilla head, salsa unlocked         | `scan-lock`                   | `text` while acquiring, `locked` once locked (" / " breaks a line), the target                 |
| Surveillance HUD, target box, box scan      | `hud`, `ui-focus`, `box-scan` | the readout, the box, the posterize and wireframe steps                                        |
| Swap card · … out, … next                   | `space-hud`                   | the label and credit, the targets                                                              |
| End card · Genobi · Dance with Fruits       | `end-card-still`              | eyebrow, title, subtitle, both credits                                                         |

## The rule it follows

The owner's general rule for a dance edit on a loop
([fruits.md](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/videos/fruits.md#the-general-rule-any-dance-edit-on-a-loop)):
the grid is the measured loop and every cut is on a beat; a character lands
on a loop restart or on the drop beat (beat 8); a swap is a hard cut at the
same guide frame; cards take the last two beats of a loop; the mid-loop swap
gets no card, its word slammed over the picture; cleanest characters first,
the fruit change in the middle, the funniest last; end on a beat with the
name. The old build's pixel ramps and 256 × 144 Nokia canvas are replaced by
the house recipes.

This template is also the reference for the house's layers rule: templates and
versions ship layers, not baked video. Its clips are plain encodes, and every
word, icon and HUD is a live recipe layer
([changing them](#changing-the-words-and-icons)); a new version changes those
layers, never the footage ([templates](templates.md#mix-templates)).

## How to repeat it

1. **Inputs.** Copy, never move, and rename on copy: each render to
   `fruits-swap-<character>.mp4`, the loop to `fruits-swap-track.mp3`. All
   renders must come from the same guide window. Check the opening render for
   defects frame by frame before cutting.
2. **Measure, do not assume.** The loop period and the beat from the audio
   (here 9.0008 s and 101.33 BPM) and the lag between the renders' audio and
   the loop (here 0). Pick the mix tempo that puts the loop restarts on whole
   beats (15 beats a loop: 100 BPM). Open the track on the loop's last beats
   when the cut needs beats before loop 1.
3. **Encode** with the 2048 × 1152 sources in `.local/fruits-swap/tmp`
   (`<name>-source.mp4`, `vox-source.mp4` for the mecha):
   `python3 -I audio-reactive/edit/fruits-swap-media.py`. Plain encodes, the
   darkened card stills, the end card's still and the splash; no words.
4. **Write the cut as data.** A loop is 13 beats of shot and a two-beat card;
   a drop-beat swap starts at beat 8 of its loop with `sourceSeconds` at its
   position in its own loop. `checkMix` must pass.
5. **Render** with the in-page renderer:
   `TEASER_URL=http://127.0.0.1:4317 TEASER_EXAMPLE=fruits-swap TEASER_MBPS=16 node scripts/render-genobi-teaser.mjs out/`,
   then a gallery copy under 25 MiB, `node scripts/encode-gallery-previews.mjs`
   and a poster (the splash's full title, 2.3 s).
6. **Look at the contact sheet and keyframes** before calling it done.

## Versions

All 3 November 2026, from the owner's reviews.

- **v1**: the cut on house recipes, Signal `kinetic` slams in IBM Plex Mono.
- **v2**: Retro Gaming words baked into the media; a `speech-bubble` title;
  the gorilla posterized and wireframed (over the whole frame); the 2 November
  mecha with more fruit motion.
- **v3**: the apple-logo title splash before loop 1 and the title typed on
  the beat (the bubble is no longer in the cut; the recipe stays);
  `mecha-fruit-song-vox` as the opening clip, its third hand covered by the
  apple; pixel fruit (`sprite-shower`) across the splash and flooding into the
  end card instead of its dot-matrix build; the gorilla's treatment confined
  to its box (`box-scan`), because over the whole frame it "gets weird".
- **v4**: the gorilla "can be more subtle effects … looks overdone": the box
  treatment halved, posterized on brightness alone so nothing shifts colour,
  a softer box edge and lighter scanlines.
- **v5**: "this is cool, love icons". The splash is the pixel fruit alone and
  the typed title is the only title (apple logo and splash words removed); a
  fruit swarm covers the opening's third hand; every lime line and plate is
  now neon pink `#ff2bd6` with white words; the head lock reads GORILLA SALSA
  DANCE UNLOCKED (`scan-lock`).
- **v6**: "I think we need brighter pink there." The pink goes from `#ff2bd6`
  to `#ff4dff`, brighter and more luminous, everywhere it is used (the HUD,
  focus box, lock reticle and plate, wireframe, swap-card lines, the baked
  typed cursor, the end-card subtitle). The lighter candidate, `#ff5ce6`,
  went pastel on the lock plate.
- **v7**: "everything is baked in, all the icons and text; we want to have
  them separate." Nothing is baked any more: the clips are plain encodes, the
  card stills are darkened frames, and every word and icon is a live layer
  ([changing them](#changing-the-words-and-icons)). The title is a
  `typewriter` layer, the swap words are `kinetic` slams, the shoulder swarm
  is a `sprite-swarm` layer. The words are in Press Start 2P, the closest
  OFL face to Retro Gaming, which cannot ship.

## Limits

- Nobody listened to the render here: the cut points are beat arithmetic on
  the measured loop, checked against frames.
- The opening mecha's third hand is covered, not fixed.
- The target box is placed from contact sheets, not tracked; the gorilla
  stays in it because the dance keeps to the centre third.
- Press Start 2P is wider than Retro Gaming; the slams fit the frame by
  their own sizing, the typed title is set at 72 px.
- The swarm's fly-in crosses the typed title for a few frames.
- The gorilla, ninja and pink cat renders still have the 3 November fruit
  motion.
- No showcase record yet (`docs/director-bundle/showcase/`); the cut opens
  from its gallery card and `/director?example=fruits-swap`.
