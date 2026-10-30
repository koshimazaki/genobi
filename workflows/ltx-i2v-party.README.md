# LTX image-to-video rave

`ltx-i2v-party.json` is an API-format template. Reference image → two-stage LTX-2.5 sampling and ×2 latent upscale → video and generated audio.

## Inputs

Fill every token with the offline [materializer](ltx-world-builder.README.md#fill-a-template) before queueing. Seeds must become JSON numbers, not strings.

| Placeholder           | Node.input           | Required value                                                                                            |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `__PROMPT__`          | `12.text`            | Your scene/action/audio description; preserve the intended continuous camera move.                        |
| `__NEGATIVE_PROMPT__` | `13.text`            | Your exclusions, including cuts, shot changes, artefacts and unwanted figures as appropriate.             |
| `__TRACK_AUDIO__`     | `40.audio`           | Uploaded audio filename. L2R/a2v need a slice at least 193/24 seconds long; no private media is included. |
| `__SEED_STAGE_1__`    | `50.noise_seed`      | JSON integer noise seed for the first sampler.                                                            |
| `__VIDEO_PREFIX__`    | `65.filename_prefix` | Relative output prefix for the encoded video.                                                             |
| `__AUDIO_PREFIX__`    | `66.filename_prefix` | Relative output prefix for decoded model audio.                                                           |
| `__SEED_STAGE_2__`    | `80.noise_seed`      | JSON integer noise seed for the second sampler.                                                           |
| `__REFERENCE_PNG__`   | `90.image`           | Uploaded owner-supplied still; for L2R, make it from the take’s first frame at the same angle.            |

## Models and nodes

Build set: `comfy-build/models/ltx-i2v.txt`. Model filenames and all sampling/widget values from the successful graph are retained:

- `akuspace-ltx25-v0.5.safetensors`
- `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors`
- `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors`
- `ltx-2.5-audio-vae-bf16.safetensors`
- `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`
- `ltx-2.5-video-vae-bf16.safetensors`

Packs: Koshi-Nodes and ComfyUI-LTXVideo, plus ComfyUI core. Text-only graphs use core nodes only; the shared set also serves i2v. The video latent is 832 × 464, with 1664 × 928 output; 193 frames at 24 fps.

## Run evidence, 30 October 2026

The supplied GPU session’s WORKFLOWS.md lists `dive4-party` under **Worked**. The rave and vocalist image-to-video graphs made the v4a party cut. Evidence is from a rented RTX PRO 6000 (96 GB), ComfyUI 0.41.0; it has not been rerun here or on the Developer Platform. Private captures, stills and audio are not redistributed.

## Known limits

- The graph loads the AKUSPACE LoRA but space_mode is Off. It generates audio from an empty audio latent unless this is an a2v graph; the reference-audio alignment scale is 0, so a linked audio file does not make this a2v.
- A still of standing people overrode the audio in the unsuccessful party a2v tests. A good dive or dancing result is not guaranteed for a new reference.
- These are API templates for ComfyUI or the named Developer Platform deployment, not registered studio slots or proof of managed Comfy Cloud availability. L2R + AKUSPACE, cathedral a2v, Union Control and final-cut SeedVR2 upscale remain untried.

## Fixes this depends on

No Capture, Storyboard or Inputs node is in this graph, so the box’s 448 × 256 storyboard, 2 GiB Capture cap and Inputs downscale fixes do not gate it. Those fixes are included for the shared build’s L2R graphs.

## How to repeat it

Prepare the inputs above, fill the template, then follow the [shared deployment plan](../docs/comfy-deploy.md). Endpoint name: `party_i2v`. The owner starts every paid build, deploy and test generation.
