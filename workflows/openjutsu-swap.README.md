# Openjutsu character swap

`openjutsu-swap.json` swaps the person in a 5 to 15 second part of a clip for
the character in one image, keeping the scene, the performance and the clip's
own sound. It is Comfy's [Openjutsu](https://github.com/Comfy-Org/comfy-openjutsu)
graph, `workflows/swap.api.json` at commit `70ec62d` (MIT, Copyright (c) 2026
Comfy Org), copied with its content unchanged and only reformatted by
Prettier. Openjutsu's graph is itself derived from Akatz Labs'
[H3 Character Swap](https://github.com/akatz-labs/h3-character-swap-tool)
workflow at `0670e4f` (MIT, Copyright (c) 2026 Akatz Labs). Both licence
notices are in [`openjutsu-swap.NOTICE.md`](openjutsu-swap.NOTICE.md).

Genobi's template is `shared/comfy/openjutsu.ts`; how a run is made, its Klein
first frame and its hosts are in [the swap page](../docs/openjutsu-swap.md).

## Changes from Akatz's workflow

Openjutsu's own table, from its README at `70ec62d`. Genobi changes nothing
further in the graph; it fills the same inputs Openjutsu's `lib/swap.ts` does.

| Change                                                                  | Why                                                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap LoRA v1 to `h3_character_swap_v1.5`                                | Akatz's recommended release.                                                                                                                                    |
| `Video Slice` (`trim`) in front of nodes 31 and 803                     | The app chooses where the part starts.                                                                                                                          |
| The optional anchor node (309) replaced by `LoadImage` and `ImageScale` | Uploaded files fail node 309's own validation on a deployment; core `LoadImage` takes them, and `ImageScale` center-crops the first frame to the prepared size. |
| `CreateVideo` and `SaveVideo` after node 807                            | A deployment reports only standard outputs.                                                                                                                     |
| Mask preview (111, 112) removed                                         | Not needed by the app.                                                                                                                                          |

Every other setting is Akatz's: 8 steps, CFG 1, `er_sde`, 124-frame windows
with 18 frames of history, a 64 px mask expansion, and SAM finding the largest
person.

## Slots

| Slot              | Node input            | Filled with                                     |
| ----------------- | --------------------- | ----------------------------------------------- |
| `clip`            | `30.file`             | The clip, uploaded as `clip.mp4`                |
| `character`       | `9.image`             | The character, reference 1                      |
| `anchor`          | `anchor_image.image`  | The first frame, reference 2, when there is one |
| `start`           | `trim.start_time`     | `swap.start`                                    |
| `seconds`         | `trim.duration`       | `duration`                                      |
| `prepare_seconds` | `31.duration_seconds` | `duration`                                      |
| `size`            | `31.resolution`       | `swap.size`, `480` or `768` as a number         |
| `prompt`          | `801.prompt`          | The workflow's instruction, then the direction  |
| `seed`            | `801.seed`            | `swap.seed`                                     |

Without a first frame the `anchor` slot's `whenAbsent` rule deletes the
`anchor_image` and `anchor_fit` nodes and `803.anchor`, and sets
`803.use_anchor` to `false`, as Openjutsu does. The output is `SaveVideo`
node `809`.

## What it needs

ComfyUI `98cc0bf84b` (v0.41.0), Akatz Labs' `h3_character_swap` node pack at
`0670e4f` with Openjutsu's patch (GPL-3.0, both), and these model files:

| File                                                             | Folder              | Source                                                                                                    |
| ---------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| `minimax_h3_ref2va_pruned_int8_convrot.safetensors`              | `diffusion_models/` | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)                                       |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`                   | `text_encoders/`    | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)                                       |
| `minimax_h3_video_vae_fp16.safetensors`                          | `vae/`              | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)                                       |
| `minimax_h3_audio_vae_fp32.safetensors`                          | `vae/`              | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)                                       |
| `sam3.1_multiplex_fp16.safetensors`                              | `checkpoints/`      | [Comfy-Org/sam3.1](https://huggingface.co/Comfy-Org/sam3.1)                                               |
| `h3_character_swap_v1.5.safetensors`                             | `loras/`            | [akatz-ai/MiniMax-H3-Character-Swap-LoRA](https://huggingface.co/akatz-ai/MiniMax-H3-Character-Swap-LoRA) |
| `minimax_h3_fl2v_turbo_8step_v1.0_768p_comfyui_bf16.safetensors` | `loras/`            | [lightx2v/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo)                             |

Neither Comfy Cloud nor a stock ComfyUI holds the node pack, so the template
lists its own host: a Comfy deployment built with them (`comfy-build/`). No weights, node pack or example media are redistributed here. The model
licences are in [LICENCES.md](../LICENCES.md#openjutsu-character-swap).
