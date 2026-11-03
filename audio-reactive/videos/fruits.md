# Fruits: the robot dancing with fruits

About 24 s: three 8-second windows of one loop file. The robot dances between
two fruits, then a single fruit morphs, then the robot (or a second character)
returns on the beat.

Presets: [fruit-mecha](../presets/fruit-mecha.md),
[fruit-mecha-morph](../presets/fruit-mecha-morph.md),
[fruit-apple-banana](../presets/fruit-apple-banana.md),
[fruit-banana-apple](../presets/fruit-banana-apple.md).

## The track

The loop is built from "Dance with Fruits" (101.3 BPM, one bar 2.368 s):

- the vocal from **17.15 s** of the song,
- one beat of the drop,
- then the beat from **1:20**,

cut to a **9.0 s** loop that starts on the voice
(`mecha-fruits-9s-A2-starts-on-voice.wav`). The capture track is that loop
**tripled** (`mecha-fruits-A2-x3.wav`, 27 s), so three back-to-back windows
fit. The bar grid and the cut points are in the owner's `cuts.json` beside
the edit (`loop_voice` 16.232-18.600 s, `loop_beat` 80.180-87.285 s); those
files are not in the repository.

## Windows

| Window | Start (x3 file) | Preset                                           | Swap                                    |
| ------ | --------------- | ------------------------------------------------ | --------------------------------------- |
| w0     | 0               | fruit-mecha (explode) or fruit-mecha-morph       | robot dances, both fruits change on cue |
| w1     | 8.0417          | fruit-apple-banana or fruit-banana-apple (Rubik) | one fruit morphs on every swell         |
| w2     | 16.0833         | fruit-mecha, robot swapped by a region edit      | the robot or a second character returns |

Pick explode or morph for w0 after seeing both renders; the explode guides
(`guides-fruits-explode-g1`) and morph guides (`guides-fruits-morph-g1`) are
both captured for all three windows.

## Stitch

1. Render each window (193 frames, 2048x1152, the excerpt muxed in).
2. Cut on the window boundaries in order w0, w1, w2 (each 8.0417 s).
3. Effects to the beat on top (Genobi effects on the 101.3 BPM grid).
4. **Audio swap at the end:** replace the three muxed excerpts with the loop
   file itself (or the song edit), aligned at 0.

## Status

| What                                           | State                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| fruit-mecha, 2 November excerpt                | rendered, follow 0.86                                                           |
| fruit-mecha on the loop (vox still)            | rendered, follow 0.78: dances less, fruits too small                            |
| fruit-mecha explode w0, gain-2 take            | rendered                                                                        |
| apple-to-banana and banana-to-apple, gain 2    | rendered: shape morphs, stays red                                               |
| explode w0-w2 at gain 1, fruits at ±0.95 m     | captured, not rendered                                                          |
| morph w0-w2 at release 30, smooth 5            | captured, not rendered                                                          |
| apple-banana with Rubik flecks w0              | captured, not rendered                                                          |
| robot region swap                              | not made                                                                        |
| character renders on the explode guide (w0)    | rendered 3 Nov: gorilla, gold gundam, unicorn, pink cat, cat-mecha, ninja, pony |
| swap edit v1 (mecha, gorilla, gundam, unicorn) | cut 3 Nov, 25.08 s, `edit/fruits-swap-build.sh`                                 |

## How to repeat

```sh
TRACK='…/mecha-fruits-A2-x3.wav'
for w in "w0 0" "w1 8.0417" "w2 16.0833"; do
  read -r name start <<<"$w"
  node scripts/experiments/capture.mjs --studies fruit-mecha --track "$TRACK" --start "$start" \
    --output "GUIDES/explode/$name" --frames 193 --width 1024 --height 576 \
    --band-gain auto --band-release 12 --motion-gain 1 --stage studio
done
# morph takes: --studies fruit-mecha-morph --band-release 30 --band-smooth 5
# single fruit: --studies fruit-apple-banana --band-release 30 --band-smooth 5
```

Then per window: copy the owner's fruit-mecha still to
`LOOKS/fruit-mecha/look-first.png` (and a peak still at the closed frame for
the morphs), `scripts/vast/box/make-bundles.sh GUIDES/explode/w0 LOOKS
BUNDLES`, `run-queue.sh` on the box, contact sheet, verdict. For the robot
swap in w2, take `regions.robot` from w2's `keyframes.json` and edit only that
rectangle of the first still.

Rules learned: gain 1 (gain 2 pushed the fruits out of frame); fruits at
±0.95 m; colour every fruit voxel by its state and add the peak still, or the
first still's colour wins; morphs do not open on a clean rest fruit because
the loop's bass is high at frame 0.

## The swap edit

The viral cut is not a render: it is the character renders cut on the music.
Every character was rendered on the **same guide and the same audio window**
(`char-<name>-explode-w0`), so a cut between two of them at the same frame
keeps the pose, the fruits, the floor and the camera and changes only the
dancer. The first cut: mecha (0 to 7.7 s), card, gorilla on the loop (9.0 s),
gold gundam with the watermelon on the drop beat (13.7 s, no card, the word
typed over the picture), card, unicorn on the loop (18.0 s), outro card
(23.3 to 25.1 s). Scripts: [`edit/fruits-swap-build.sh`](../edit/fruits-swap-build.sh)
and [`edit/fruits-swap-cards.py`](../edit/fruits-swap-cards.py).

### The general rule (any dance edit on a loop)

1. **The music is the grid, measured, not assumed.** Measure the loop period
   and the beat period from the audio _in the renders_ (here loop 8.998 s,
   beat 0.592 s, 101.33 BPM, kicks from beat 8 of each loop). Every cut lands
   on a beat. The audio comes from the renders too, never from the loop file,
   which was 60 ms off.
2. **A character lands on a loop restart** (the vocal hook) **or on the drop
   beat** (beat 8). At most one character per loop plus one mid-loop swap, so
   24 s of a 9 s loop is three characters and three swaps.
3. **A swap is a hard cut at the same guide frame.** Never a crossfade: the
   pose carries across, so the dancer changes species mid-move. Window 0
   renders can be placed in any loop, because every loop is the same audio.
4. **Cards take the last two beats of a loop** (beats 13 and 14 of a 15.2-beat
   loop): word one slides in on beat 13, the character's name is typed one
   letter per frame on beat 14, and the character arrives on the loop. The
   card also hides the render seam at the 8.04 s window boundary.
5. **Mid-loop swaps get no card.** Type the word over the picture on the beat
   instead, so the dance never stops twice in one loop.
6. **Pixel ramps, four frames each way:** 16, 32, 64, 128 px blocks out of
   the picture into a card, the reverse into the next character.
7. **Typography is a 256x144 canvas scaled 8x nearest.** Nokia font
   (`nokiafc22.ttf`) for words, Retro Gaming for chrome, white on #0e0e10 with
   one accent (#c7ff00), a block cursor blinking every three frames. Nothing
   anti-aliased.
8. **Order by cleanliness, then fun:** the characters without stray limbs
   first (mecha, gorilla), the fruit change in the middle, the funniest last.
9. **End on a beat with the name:** the outro card starts on a beat, holds two
   more, fades picture and sound together.

### How to repeat the edit

The build is a template, one argument per loop (`NAME:RENDER`, `+NAME:RENDER`
for a drop-beat swap), 1 to 3 loops; see
[fruits-template.md](fruits-template.md) for the slots, the commands and
what is proven. The process log is [`../edit/LOG.md`](../edit/LOG.md).
