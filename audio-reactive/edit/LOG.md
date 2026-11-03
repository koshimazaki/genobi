# Dance with Fruits swap edit: process log

Append-only. Times are CET, 3 November 2026. Inputs are on the owner's Mac;
the renders came from the Vast box session recorded in `~/Downloads/run2/README.md`.

## Inputs

| What                 | Where                                                                                                       | Note                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Loop                 | `~/Downloads/Dance with Fruits edit/mecha-fruits-9s-A2-starts-on-voice.mp3`                                 | 9.000 s, 101.33 BPM, voice first, kicks from beat 8                |
| Character stills     | `~/genobi-runs/2026-11-03/chars/char{1..6}.png` → `look-{1..6}.png`                                         | owner's Genobi Image stills in the mecha's pose, cropped to 16:9   |
| Guide                | `~/genobi-runs/2026-11-03/guides-fruits-explode-g1/w0` (fruit-mecha study, gain 1, release 12)              | one window, 193 frames, the same for every character               |
| Renders (red-tagged) | `~/Downloads/run3/Select/char-{cat-mecha,gold-gundam,gorilla,pink-cat,unicorn}-explode-w0-layout-audio.mp4` | LTX-2.5 Layout-to-Render, 2048x1152, the loop's first 8.04 s muxed |
| Mecha render         | `~/Downloads/run3/fruit-mecha-explodeg1-w{0,1,2}-layout-audio.mp4`                                          | the original character                                             |

## Events

```
16:05 ASK   owner (voice): the viral Fruits video; 2-3 swaps to the beat; mecha first, then gorilla; then fruits and others; loop x3 (~24 s); kinetic typography between swaps; pixel art / retro gaming / Nokia font
16:08 FIND  red-tagged clips via mdfind kMDItemUserTags == 'Red' -> run3/Select (5 characters); fonts nokiafc22.ttf and Retro Gaming.ttf in ~/Library/Fonts
16:10 FAIL  librosa on python3.11 (numpy 2 broke soxr) -> numpy-only spectral-flux onset script
16:12 MEASURE loop 8.998 s (clip audio), beat 0.5921 s; kicks on the grid from beat 8 of each loop; every character render shares window-0 audio (lag 0.000 s)
16:14 FIND  mecha-fruits-loop-x3.wav is 60 ms off the renders -> take the audio from the renders (v1) / from the 9 s mp3, which is sample-aligned (template)
16:20 DESIGN timeline: mecha 0-7.70 | card SWAP/GORILLA 7.70-9.00 | gorilla 9.00-13.74 | gundam+WATERMELON overlay 13.74-16.70 | card SWAP/UNICORN 16.70-18.00 | unicorn 18.00-23.33 | outro 23.33-25.08
16:22 BUILD cards: 256x144 canvas x8 nearest, Nokia word typed one letter per frame, block cursor blink every 3 frames, accent #c7ff00
16:28 BUILD fruits-swap-v1.mp4 (602 frames, 25.083 s); pixelize ramps 16/32/64/128 px, 4 frames each way
16:30 QC    contact sheet + frames at every cut: poses carry across each swap; seams hidden under cards; outro fades picture and sound together
16:34 OUT   ~/Downloads/genobi-run3-2026-11-03/fruits-swap-edit/fruits-swap-v1.mp4 (+ sheet, scripts); opened for the owner
16:40 RULE  the general rule written into audio-reactive/videos/fruits.md ("The swap edit")
16:50 ASK   owner (voice): record the process and the log, make it a template; user swaps fruits (voxels in Three.js), the main character (Klein, bounding box suggested by the agent), audio (MiniMax); 8 s per character, 24 s for more
16:55 FIND  capture already writes regions.robot (frame-0 rectangle of the dancer) into keyframes.json: the suggested bounding box; MiniMax Music 3 is in the registry (text to music, workflow route)
17:05 BUILD fruits-swap-build.sh parameterised: 1-3 loops, NAME:RENDER per loop, +NAME:RENDER for a drop-beat swap; audio = the 9 s mp3 tiled
17:06 FAIL  segment counter inside $(...) subshell: every segment wrote 01.mp4 (294-frame video) -> seg sets $SEG without a subshell
17:10 VERIFY 3-loop run reproduces v1's video stream byte for byte; 1-loop run = 170 frames (7.08 s)
```

## Decisions that invalidate earlier work

- 16:14 The loop wav in `Dance with Fruits edit` is not the sync reference; the renders are. Any later audio swap must be measured against a render's muxed audio first.
- 17:05 v1's `build.sh` (fixed four characters) is superseded by the parameterised script; the v1 file in the Downloads folder stays as the delivered cut.
