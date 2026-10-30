# Dual Editor media fixtures

These small synthetic clips were generated for packet-copy and native-resolution
regressions. No third-party footage is included. Native video is 2176 × 928,
24 fps, two seconds, teal, H.264 with B-frames and a 12-frame keyframe interval.
The audio fixtures are 320 × 180 blue with 440 Hz AAC at 48 kHz.
`native-audio.mp4` uses 24 fps / keyframes every 12 frames;
`aligned-audio.mp4` uses 25 fps / keyframes every 8 frames, so a 0.32-second
cut aligns to both a video GOP and 15 audio packets.

Generate with FFmpeg (`color` / `sine` lavfi inputs, `libx264 -g 12 -keyint_min 12
-sc_threshold 0 -bf 2`). Tests use the checked-in clips and Mediabunny; CI does
not need FFmpeg or a GPU.

`short-metadata.mp4` is a generated black 16 × 16 H.264 clip with 97 frames
at 30 fps. Its version-0 `mdhd` duration is deliberately shortened to
`floor(3.233008 × timescale)` while sample timing remains intact, reproducing
the Comfy export metadata discrepancy without including generated artwork.

`upscale-part-4s.mp4` and `upscale-part-19s.mp4` are generated black 16 × 16
H.264 clips at 24 fps, 99 and 456 frames: the lengths of a manual split's
tail and body part, for the upscale duration regression
(`tests/upscale-duration.test.ts`).
