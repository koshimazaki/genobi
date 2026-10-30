# Level and crossfade scene reverbs on CPU

`room-reverb.sh` convolves the continuous track with each exported World Builder
IR, matches each wet signal's mean level to the dry track, and crossfades room
windows. It was used for the audible room transitions in adaptive-reverb v5.
No GPU or private media is needed; install FFmpeg, `bc` and `awk`.

```sh
sh workflows/room-reverb.sh track.wav 0 8,8,6,8 /tmp/rooms.wav dry cathedral-ir.wav hall-ir.wav studio-ir.wav
```

Arguments: track, start seconds, comma-separated positive window lengths,
output WAV, then one IR filename (or `dry`) per window. Paths can contain
spaces. Environment controls: `WET=-2` (wet relative to dry in dB), `DRY=0.6`
(linear gain), `RAMP=0.6` (crossfade seconds). The helper pads the numeric
`atrim` end with a leading zero, so totals below one second work too.

Generate IRs with the [CPU template](world-builder-adaptive-reverb-cpu.README.md)
or [Layout-to-video](world-builder-l2r-a2v.README.md). The output is stereo
48 kHz with limiter and loudness normalization. This is an offline finishing
step: it overwrites the selected output and re-levels the sound. It neither
computes room geometry nor tracks a moving listener. Check the mix by ear.
