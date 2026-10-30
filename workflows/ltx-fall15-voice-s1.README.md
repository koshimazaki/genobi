# LTX fall with narration, candidate 1

`ltx-fall15-voice-s1.json` is an API-format template. Text → two-stage LTX-2.5 video and audio generation. The image-conditioning branches are bypassed in the tested graph; its unconnected reference loader is retained.

## Inputs

Fill every token with the offline [materializer](ltx-world-builder.README.md#fill-a-template) before queueing. Seeds must become JSON numbers, not strings.

| Placeholder           | Node.input           | Required value                                                                                 |
| --------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `__VIDEO_PREFIX__`    | `75.filename_prefix` | Relative output prefix for the encoded video.                                                  |
| `__REFERENCE_PNG__`   | `395.image`          | Uploaded owner-supplied still; for L2R, make it from the take’s first frame at the same angle. |
| `__PROMPT__`          | `398:376.value`      | Your scene/action/audio description and, for narration, the words to speak.                    |
| `__NEGATIVE_PROMPT__` | `398:373.text`       | Your exclusions, including cuts, shot changes, artefacts and unwanted figures as appropriate.  |
| `__SEED_STAGE_1__`    | `398:339.noise_seed` | JSON integer noise seed for the first sampler.                                                 |
| `__SEED_STAGE_2__`    | `398:338.noise_seed` | JSON integer noise seed for the second sampler.                                                |

## Models and nodes

Build set: `comfy-build/models/ltx-i2v.txt`. Model filenames and all sampling/widget values from the successful graph are retained:

- `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors`
- `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors`
- `ltx-2.5-audio-vae-bf16.safetensors`
- `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`
- `ltx-2.5-video-vae-bf16.safetensors`

Packs: Koshi-Nodes and ComfyUI-LTXVideo, plus ComfyUI core. Text-only graphs use core nodes only; the shared set also serves i2v.

## Run evidence, 30 October 2026

The supplied GPU session’s WORKFLOWS.md lists `fall15-voice-s1` under **Worked**. The source Worked row reports 15-second falls and a full narration read in 14.6 seconds. The source summary does not grade the candidates separately. Evidence is from a rented RTX PRO 6000 (96 GB), ComfyUI 0.41.0; it has not been rerun here or on the Developer Platform. Private captures, stills and audio are not redistributed.

## Known limits

- The shipped older text-to-video template failed without a Gemma e2b prompt-enhancer model. These successful API graphs omit that enhancer; do not add it back without its model. The source notes do not establish narration reliability for new text.
- These are API templates for ComfyUI or the named Developer Platform deployment, not registered studio slots or proof of managed Comfy Cloud availability. L2R + AKUSPACE, cathedral a2v, Union Control and final-cut SeedVR2 upscale remain untried.

## Fixes this depends on

No Capture, Storyboard or Inputs node is in this graph, so the box’s 448 × 256 storyboard, 2 GiB Capture cap and Inputs downscale fixes do not gate it. Those fixes are included for the shared build’s L2R graphs.

## How to repeat it

Prepare the inputs above, fill the template, then follow the [shared deployment plan](../docs/comfy-deploy.md). Endpoint name: `fall15_voice_s1`. The owner starts every paid build, deploy and test generation.
