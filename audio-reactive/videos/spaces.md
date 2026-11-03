# Spaces: Adaptive Reverb

About 32 s on "Adaptive Reverbv2": four acoustic spaces, one per window, the
walls or buildings closing on the bass while the reverb follows the room.
Voice 2-6 s and 9-13 s, the beat from 14 s.

Presets: [towers-descent](../presets/towers-descent.md),
[cathedral-gallery](../presets/cathedral-gallery.md) (slide) and
[cathedral-gallery-grow](../presets/cathedral-gallery-grow.md),
[party-walls](../presets/party-walls.md), [studio-walls](../presets/studio-walls.md).

## Windows

| Window | Start   | Preset                       | Note                                                          |
| ------ | ------- | ---------------------------- | ------------------------------------------------------------- |
| w0     | 0       | towers-descent               | rendered                                                      |
| w1     | 8.0417  | cathedral-gallery (or -grow) | slide and grow both captured                                  |
| w2     | 15.6916 | party-walls (hall)           | quiet start within 0.6 s of 16.0833                           |
| w3     | 23.6083 | studio-walls (booth)         | quiet start; opens at 0.60; a 9-13 s vocal window opens fully |

The hall and booth starts are the quietest low-band frames near the cut, so
frame 0 is open and matches the still. Keep each window 193 frames inside the
32.4 s track.

## Reverb under each window

Each capture writes `room-wet.wav`, the CPU reverb of the same room, already
shrinking with the walls. Mix it under the dry excerpt:

```sh
ffmpeg -i clip.mp4 -i control.wav -i room-wet.wav -filter_complex \
  "[1:a]volume=0.9[d];[2:a]volume=0.7[w];[d][w]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k clip-room-reverb.mp4
```

Optional: duck the wet signal under the bass to 15 percent so the hits stay
dry (the `-ducked-reverb` mix of the towers). The exact ducking filter of that
mix is not recorded; a sidechain compressor keyed on the low band is the
equivalent.

## Stitch

1. Render w0-w3 (193 frames each), mix the room reverb under each.
2. Cut on the window boundaries in order towers, cathedral, hall, booth.
3. Effects to the beat on top.
4. **Audio swap at the end:** lay the full track (dry 0.9) over the cut with
   each window's wet reverb (0.7) at its start time.

## Status

| What                                 | State                                                    |
| ------------------------------------ | -------------------------------------------------------- |
| towers-descent w0                    | rendered, follow 0.87, plus room and ducked reverb mixes |
| towers-descent w1 (release 12 and 6) | captured and bundled, not rendered                       |
| cathedral-gallery w0, w1             | captured; w0 submitted when the box shut, not rendered   |
| cathedral-gallery-grow               | captured, not rendered                                   |
| party-walls `w-open2` (15.6916)      | captured, not rendered                                   |
| studio-walls `w-open2` (23.6083)     | captured, not rendered                                   |

## How to repeat

```sh
TRACK='…/Adaptive Reverbv2.mp3'
cap() { node scripts/experiments/capture.mjs --studies "$1" --track "$TRACK" --start "$2" \
  --output "GUIDES/$3" --frames 193 --width 1024 --height 576 \
  --band-gain auto --band-release 12 --motion-gain 1 --stage studio; }
cap towers-descent 0 w0
cap cathedral-gallery 8.0417 w1
cap party-walls 15.6916 w2
cap studio-walls 23.6083 w3
```

Owner stills go to `LOOKS/<study>/look-first.png` (exactly 16:9), then
`make-bundles.sh` per window folder and `run-queue.sh` on the box. Check each
`frame-0000.png` against its still with a 50 percent blend before bundling.

Rules learned: gain 1 for every wall study (the towers w0 take was gain 2 and
worked, but gain 2 saturates the blends); start the hall and booth on quiet
frames; the camera holds and the walls move.
