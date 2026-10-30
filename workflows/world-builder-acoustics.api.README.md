# World Builder acoustics, API format

The API-format graph behind
[`custom_nodes/director_world_builder/examples/world-builder-acoustics.json`](../custom_nodes/director_world_builder/examples/world-builder-acoustics.json),
as `POST /prompt` takes it: Capture → Acoustics (room tail and impulse
response) → AKUSPACE prompt, Capture → Storyboard grid, Capture → depth and
canny previews, and a dry voice → Reverb → wet voice, peak-normalised.

## Inputs

| Node | Input                            | Value in this file                                              |
| ---- | -------------------------------- | --------------------------------------------------------------- |
| 1    | `capture_file`, `depth_file`     | `world-p03.webm`, `world-p03-depth.webm` in ComfyUI's input dir |
| 1    | `recipe_json`                    | recipe v1, 24 fps, 1024 × 576, 17 frames                        |
| 14   | `audio`                          | `dj_dry_voice.wav`, a 48 kHz PCM WAV                            |
| 4    | `source_type`, `effect_level`, … | `male spoken voice`, `mid`, `day`, `low`                        |

Replace the three filenames with your own capture and voice. The recipe must
match the capture's dimensions, 24 fps and frame count (8k + 1 frames), or
Capture refuses it.

## Run evidence, 29 October 2026

Run once on ComfyUI Desktop 2.0 (ComfyUI 0.43.1, Python 3.13, Apple MPS, no
GPU model) with the pack symlinked into `custom_nodes`, through
`POST http://127.0.0.1:8188/prompt`. Status `success`; every node executed:

| Node   | Output                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| 8      | `world-builder-room_00001.flac`, 0.71 s mono 48 kHz, the room tail                                            |
| 9      | `world-builder-ir_00001.flac`, 0.45 s, the impulse response                                                   |
| 16     | `world-builder-voice_00001.flac`, 14.0 s stereo 48 kHz, the dry voice through the room                        |
| 5      | `AKUSPACE male spoken voice outdoors in daytime, gentle open-air acoustics with continuous birdsong ambience` |
| 7      | `outdoor_day · open sky · RT60 0.4 s · IR 0.4 s`                                                              |
| 17     | `… · peak-normalised -1.4 dB`                                                                                 |
| 13     | the storyboard grid (colour, canny, depth)                                                                    |
| 10, 11 | 17 depth and 17 canny frames                                                                                  |

The recipe carried no room, so Acoustics read it as outdoors; a recipe with a
room preset (`examples/rooms/`) gives that room's tail. FFmpeg and FFprobe
were found through the pack's package-manager fallback, since Desktop's
server PATH has no Homebrew. Local evidence only: nothing paid, nothing
deployed.
