# AKUSPACE: LTX-2.5 image + track to video

## What it makes

`ltx-i2v-a2v-akuspace.json` uses a reference still and track in two-stage
LTX-2.5 i2v/a2v sampling with ×2 latent upscale. The AKUSPACE acoustic-space
LoRA gives the model its learned room sound. The track is encoded into the
audio latent; mask 0.5 permits partial regeneration before both samplers.
The video and a separate FLAC contain the model's decoded audio.

## Inputs and placeholders

Use endpoint `akuspace` with the [offline materializer](README.md#fill-a-key-workflow).
All media filenames are relative to ComfyUI `input/`; supply your own media.

| Token (surrounded by `__`)     | Input                                         |
| ------------------------------ | --------------------------------------------- |
| `REFERENCE_PNG`                | Reference still for the vocalist/room         |
| `TRACK_AUDIO`                  | Track slice at least 193/24 seconds long      |
| `PROMPT`, `NEGATIVE_PROMPT`    | Scene/action/audio description and exclusions |
| `SEED_STAGE_1`, `SEED_STAGE_2` | Unsigned 64-bit JSON integers                 |
| `VIDEO_PREFIX`, `AUDIO_PREFIX` | Relative output prefixes                      |

Sampling is 832 × 464, output 1664 × 928; 193 frames at 24 fps. The tested
conditioning stays Room / small_room / Heavy / high, LoRA strength 1.0.

## Models

The shared [ltx-world-key set](../comfy-build/models/ltx-world-key.txt) pins:

- `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors`
- `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors`
- `ltx-2.5-video-vae-bf16.safetensors`
- `ltx-2.5-audio-vae-bf16.safetensors`
- `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`
- `akuspace-ltx25-v0.5.safetensors` (existing pinned Hugging Face revision and hash)

Needs ComfyUI, pinned Koshi-Nodes and ComfyUI-LTXVideo. No World Builder
Capture or CPU Reverb node is in this graph.

## Recorded result

On 30 October 2026, `a2v-vocalist-akuspace` produced the wooden-studio vocalist
turning and smiling. The CPU and AKUSPACE experiments gave the same picture;
AKUSPACE was the separate learned-audio alternative to the final v5 CPU
comparison. Evidence is from an RTX PRO 6000 96 GB, ComfyUI 0.41.0.
This port has not rerun it or verified a Developer Platform deployment.

## Limits

Mask 0.5 changes the music as well as the room sound; this is not transparent
reverb processing. Other mask strengths and L2R stacked with AKUSPACE remain
untried. The final CPU cut is not evidence that AKUSPACE made its soundtrack.
No private media is included, and this API graph is not a registered studio slot.
