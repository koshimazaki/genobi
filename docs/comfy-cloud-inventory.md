---
tags: [workflows, comfy, models, licences]
summary: What Comfy Cloud runs for Genobi today, what needs importing, and what stays local.
---

# Comfy Cloud inventory

Checked 20 October 2026 from Comfy's public pages and the official template
index (`Comfy-Org/workflow_templates`, `templates/index.json`, 699 templates);
the Music row was checked on 27 October 2026 against this account's own Cloud
`/api/object_info` (3,853 node classes; the ACE-Step and Stable Audio
checkpoints and diffusion models listed by their loaders). Nothing was run or
paid for. The authoritative check for a given account is the
Cloud API's `/api/object_info` and models endpoints with that account's key.

The rule: open models first; whatever does
not fit on the person's machine runs on Comfy Cloud. The [machine check](machine-check.md)
decides which, per capability, and falls back to the models below.

## Runs on Comfy Cloud today

| Need               | Model or nodes                                                                                                                                                                                                                                                    | Licence                                                                      | Official template                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Image and box edit | FLUX 3 Image Klein, distilled and base (int8); core `ReferenceMultiLatent`, `CreateBoundingBoxes`                                                                                                                                                                 | FLUX Kommunity v1.0                                                          | `image_flux3_klein_distilled_t2i`, `image_flux3_klein_distilled_image_edit`                                           |
| Video              | LTX-2.5 22B distilled int8, two-stage with `LTXVLatentUpsampler`; text, image and first/last frame                                                                                                                                                                | LTX-2.x Community                                                            | `video_ltx2_5_t2v`, `video_ltx2_5_i2v`, `video_ltx2_5_flf2v`                                                          |
| LTX add-ons        | LTX-2.3 IC-LoRAs: Union Control, Ingredients, Outpaint (community); LTX-2.5 pixel upscaler IC-LoRA                                                                                                                                                                | LTX-2.x Community                                                            | `video_ltx2_3_ic_lora`, `template_ltx2_3_ic_lora_ingredients`                                                         |
| Camera LoRA        | LTX-2 19B with Dolly-Left                                                                                                                                                                                                                                         | LTX-2 Community                                                              | `video_ltx2_t2v`                                                                                                      |
| Upscale            | SeedVR2 3B int8 (video), 7B int8 (image), native nodes; Real-ESRGAN x4plus                                                                                                                                                                                        | Apache-2.0; BSD-3                                                            | `utility_seedvr2_3b_int8_upscale_video`                                                                               |
| Masks and boxes    | SAM3 / SAM3.1 (text prompt → boxes and masks), SAM2                                                                                                                                                                                                               | SAM licence (Meta); Apache-2.0                                               | `utility_video_segment_sam3`                                                                                          |
| Character swap     | Wan2.2 Animate 14B, Wan Animate 2, SCAIL-2 character replacement, Wan 2.1 VACE                                                                                                                                                                                    | Apache-2.0                                                                   | `video_wan2_2_14B_animate`, `video_wan21_scail2_character_replacement`                                                |
| Listening          | Gemma 4 through core `TextGenerate` (audio in, transcription); Whisper packs                                                                                                                                                                                      | Apache-2.0                                                                   | Gemma 4 docs ("Run on Comfy Cloud")                                                                                   |
| Vision             | Qwen3-VL through core `TextGenerate`                                                                                                                                                                                                                              | Apache-2.0                                                                   | `llm_qwen3vl_text_gen`                                                                                                |
| Sound              | LTX audio latents (core); AKUSPACE with its imported LoRA                                                                                                                                                                                                         | LTX-2.x Community                                                            | `workflows/ltx-2-5-akuspace-t2v.json` (ours)                                                                          |
| Music              | ACE-Step 1.5 (AIO checkpoint and XL turbo/base/SFT; core `TextEncodeAceStepAudio1.5`, `EmptyAceStep1.5LatentAudio`); Stable Audio 3 medium and small music/SFX, Stable Audio Open 1.0 (core `ConditioningStableAudio`, `EmptyLatentAudio`); MiniMax Music 3; YuE2 | ACE-Step Apache-2.0; Stability and MiniMax licences to check before shipping | `audio_ace_step_1_5_checkpoint`, `audio_ace_step1_5_xl_turbo`, `audio_stable_audio_3_medium`, `audio_minimax_music_3` |

MiniMax Music 3 is the studio's first music entry: registry `minimax-music-3`
(generator `audio`) runs the official `audio_minimax_music_3` graph as
[`workflows/minimax-music-3.json`](https://github.com/koshimazaki/Genobi/blob/main/workflows/minimax-music-3.README.md),
with the weights Cloud lists (`minimax_music3_dit_fp16`, the pruned int8
ConvRot text encoder, `minimax_music3_dav`). The weights are under the
MiniMax-Music3 Community License (the Comfy-Org card's `apache-2.0` tag is the
repackager's label): commercial use allowed with "MiniMax-Music3" shown in the
interface
([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)).
Not run yet.

## Needs importing or checking

- Lightricks' In/Outpainting 0.9 and Motion Track IC-LoRAs (not in any template),
  and whether LTX-2.3 IC-LoRAs behave well on LTX-2.5.
- `LTXICLoRALoaderModelOnly`, `LTXAddVideoICLoRAGuide` (used by Cloud-only
  templates, so probably present) and `LTXVInpaintPreprocess` (not seen).
- The other six LTX-2 camera LoRAs.
- FlashVSR and Florence-2 weights; whether Qwen3-VL returns box coordinates.
- Custom Klein LoRAs.

## Not on Comfy Cloud

| Missing                    | Use instead                                |
| -------------------------- | ------------------------------------------ |
| Qwen3-Omni                 | Gemma 4 on Cloud, or Qwen3-Omni locally    |
| Grounding DINO             | SAM3 text prompts                          |
| SeedVR2 custom pack        | The native SeedVR2 nodes                   |
| 4x-UltraSharp (commercial) | Real-ESRGAN (UltraSharp is CC BY-NC-SA)    |
| Any custom node of our own | A Comfy API deployment, or a local ComfyUI |

## Account limits that shape the app

- API access needs a paid plan and spends the same credits.
- Concurrent API jobs: Standard 1, Creator 3, Pro 5, Team 25; up to 100 queued.
- Maximum run time: 30 minutes on Standard and Creator, 1 hour on Pro.
- GPU: Blackwell RTX 6000 Pro, 96 GB.
- Signed output URLs last about six hours, so outputs are copied into our own
  storage before a take counts as ready.
- Imported LoRAs (Creator, Pro and Team; public Hugging Face or Civitai links,
  safetensors, up to 100 GB) belong to the account whose key submits the run.
- Ordinary Cloud cannot add custom nodes; a Comfy API deployment can.
- Genobi reaches Cloud on its `workflow` route, through `@comfyorg/sdk` and Comfy
  API v2 ([architecture](architecture.md#routes)); Router models stay on the
  `router` route.

## Licence watch-outs

FLUX Kommunity allows commercial use of outputs only under US$5M revenue, and
derivatives only for non-commercial purposes. LTX-2.x needs a paid licence from
US$10M revenue. SAM 3 uses Meta's own licence. 4x-UltraSharp is non-commercial.
The full list, with sources, is [`LICENCES.md`](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md).
