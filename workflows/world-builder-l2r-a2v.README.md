# Layout-to-video: World Builder + LTX-2.5 + track

## What it makes

`world-builder-l2r-a2v.json` follows a World Builder colour take and a matching
look reference through two-stage Layout-to-Render and ×2 latent upscale.
The track enters the audio latent before both samplers with noise mask 0.
A separate CPU Acoustics/Reverb branch processes the original track, saves the
IR and wet mix, and supplies the video's soundtrack. No AKUSPACE LoRA is loaded;
the Koshi prompt node uses the scene's acoustic description.

## Inputs and placeholders

Use endpoint `layout-to-video` with the [offline materializer](README.md#fill-a-key-workflow).
All media filenames are relative to ComfyUI `input/`; upload your own files.

| Token (surrounded by `__`)                | Input                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `TAKE_WEBM`                               | Colour take: 1024 × 576, 193 frames, 24 fps                                            |
| `RECIPE_JSON`                             | Complete matching v1 recipe, encoded as a JSON string; preserve room objects/materials |
| `DEPTH_WEBM`                              | Matching depth take filename, or `""`                                                  |
| `REFERENCE_PNG`                           | Look still made at the take's first-frame camera angle                                 |
| `TRACK_AUDIO`                             | Track slice at least 193/24 seconds long                                               |
| `PROMPT`, `NEGATIVE_PROMPT`               | Scene/action/audio description and exclusions                                          |
| `SEED_STAGE_1`, `SEED_STAGE_2`            | Unsigned 64-bit JSON integers                                                          |
| `REVERB_SEED`                             | Unsigned 32-bit JSON integer                                                           |
| `IR_PREFIX`, `WET_PREFIX`, `VIDEO_PREFIX` | Relative output prefixes                                                               |

The default guide is 1280 × 704, output 2560 × 1408. The
[studio input preset](world-builder-l2r-a2v-studio.README.md) uses a
1024 × 576 guide and 2048 × 1152 output; it is the same workflow.

## Models

The shared [ltx-world-key set](../comfy-build/models/ltx-world-key.txt) pins:

- `ltx-2.5-22b-distilled-transformer-bf16.safetensors`
- `gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`
- `ltx-2.5-video-vae-bf16.safetensors`
- `ltx-2.5-audio-vae-bf16.safetensors`
- `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`
- `ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors`

Needs ComfyUI, pinned ComfyUI-LTXVideo and Koshi-Nodes, and this repo's
`director_world_builder`. Capture accepts the 193-frame take under its 2 GiB
budget; storyboard cells are 448 × 256. WebM requires FFmpeg and FFprobe.

## Recorded result

On 30 October 2026, `l2r9-party-a2v` produced the final party shot used in the
adaptive-reverb v5 cuts, using a reference without drinks. The recorded GPU
was an RTX PRO 6000, 96 GB, with ComfyUI 0.41.0. An earlier same-resolution
party run took 12.5 minutes and about 87 GB VRAM. This port has not rerun the
GPU graph or verified it on the [Developer Platform](../docs/comfy-deploy.md).

## Limits

Reference angle can override the camera path; an eye-level cathedral reference
previously made a static shot. Standing crowds can stay frozen. Late stand-in
colour blobs required trimming the final party shot to six seconds. The CPU
branch uses one static room IR per clip; its wet signal can be quiet. Use
[whole-track room reverb](room-reverb.README.md) for levelled transitions.
L2R with the AKUSPACE LoRA remains untried. Private media is not included.
These API graphs are explicit submissions, with no registered studio slots.
