---
tags: [backend, camera]
summary: Exact LTX Layout-to-Render node and model availability on Comfy Cloud, with input rules and integration gaps.
---

# LTX Layout-to-Render compatibility — 26 October 2026

The target 3D workflow is
[LTX-2.5 Layout-to-Render](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render),
using a Three.js playblast as the driver and an art-directed image derived
from its first frame. This is separate from text-to-video and from the older
pose/Union Control Gen-Mod graphs.

## Exact supplied workflow

`LTX-2.5_ICLoRA_Layout_To_Render_Two_Stage_Distilled.json` contains seven
subgraphs. After expanding their definitions and excluding editor-only notes,
reroutes and subgraph wrappers, it uses 28 execution node types.

An authenticated Comfy Cloud catalogue check on this date advertised 27 of
those types. Cloud reported ComfyUI `v0.42.5`; that does not establish the
commit of every custom node pack.

| Requirement                                                                                | Cloud catalogue result                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `LTXICLoRALoaderModelOnly`, `LTXAddVideoICLoRAGuide`                                       | Present                                                       |
| Sampling, video loading, resizing, VAE decoding and saving nodes                           | Present                                                       |
| `GemmaAPITextEncode`                                                                       | Missing; two instances in optional API text-encoding branches |
| Distilled LTX-2.5 BF16 transformer, Gemma 4 encoder, video/audio VAEs, x2 spatial upscaler | Exact filenames advertised                                    |
| `ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors`                                     | Not advertised by the IC-LoRA loader                          |

The API text-encoding branches can be removed while retaining the workflow's
existing local `CLIPTextEncode` branch. The missing Layout-to-Render adapter
still blocks this exact recipe. A catalogue miss is not a claim that the model
cannot be imported into a suitable account; custom-model import was not tested.
An older Union Control adapter is not an equivalent substitute.

## Input and execution rules

Follow the model card: a driver preferably at 24 fps, sides divisible by 64,
an aligned art-direction first frame, CFG 1, `euler_ancestral`, and the adapter
at strength 1. The supplied recipe uses eight steps at 960×544 followed by
three steps at 1920×1088, with the first-frame guide applied in both stages.

For an existing driver, trim to a valid `8n+1` frame count without inventing
extra motion: the card's 72-frame example becomes 65 frames. A newly captured
Three.js take can start with the right count. A 49-frame take at 24 fps is
about 2.04 seconds. This differs from choosing seconds for new text-to-video.

## Integration gaps

The app exports Three.js video, but has no registered Layout-to-Render run
that uploads both driver and look image, submits this graph and returns a
verified result to the linked project. The Camera **Open workflow** entry is
text-to-video; it does not implement that handoff.

The existing Docker image pins the LTX node pack to
`220e1d45aa0469f518e982102fca4dca92a61862`, matching its upstream HEAD at this
check. It still needs this adapter and a task-specific API graph. Its earlier
verification was on CPU; a GPU run on a Comfy deployment built from
`comfy-build/` (the `layout-to-render` set) is pending. No new Layout-to-Render GPU submission was made during this check.

## Worked API graphs, 30 October 2026

The later rented-GPU session succeeded with the enhancer omitted, the exact
BF16 Layout-to-Render weights and references matched to the take's angle.
The [reusable dive graph](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-l2r-dive.README.md#run-evidence-30-october-2026)
records that evidence; the [deployment plan](comfy-deploy.md) includes the
cathedral and L2R + audio-latent variants. This updates GPU-workflow status,
not the earlier authenticated Cloud catalogue result. Studio registration,
managed Cloud availability and Developer Platform execution remain unverified.
