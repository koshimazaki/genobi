# World Builder → LTX-2.5 Layout-to-Render

`world-builder-layout-to-render.json` is a UI-format graph for the ComfyUI
editor, not a studio template. The take's colour frames are the layout video,
a reference still (the take's `first.png` or a Klein still made from it) sets
the look, and the Layout-to-Render IC-LoRA renders the take's camera and
blocking in that look: 8 s at 24 fps (193 frames), 1024×576, then ×2 to
2048×1152. Groups and Note nodes explain each branch and the optional inputs.

## Wiring reference

Lightricks' `LTX-2.5_ICLoRA_Layout_To_Render_Two_Stage_Distilled.json`, the
graph supplied with the model card (it is not among ComfyUI-LTXVideo's
`example_workflows` at `220e1d4`), flattened from its seven subgraphs:

| Supplied subgraph      | Here                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Load Models            | `UNETLoader` → `LTXICLoRALoaderModelOnly` (strength 1), `CLIPLoader` `ltxv`, `VAELoader`, `LatentUpscaleModelLoader`     |
| Source Video           | Capture `frames` (no LoadVideo) → first 193 frames → 1024×576 → `GetImageSize`                                           |
| Input Parameters       | `CLIPTextEncode` ×2 → `LTXVConditioning` (frame rate from Capture); the optional `GemmaAPITextEncode` branch is left out |
| Preprocess             | `EmptyLTXVLatentVideo`, `LTXAddVideoICLoRAGuide` layout at frame 0 (`crop` disabled), still at frame −1 (`crop` center)  |
| Sampler (8 steps)      | `RandomNoise` 42, `CFGGuider` 1, `euler_ancestral`, the supplied 8 sigmas, `LTXVCropGuides`                              |
| Upscale and re-sampler | `LTXVLatentUpsampler`, both guides again, sigmas `0.909375, 0.725, 0.421875, 0.0`, crop                                  |
| Decode                 | `VAEDecodeTiled` 512/64/128/32 → `CreateVideo` → `SaveVideo`                                                             |

The supplied graph resizes the source by its shorter side to 544 and samples
at 960×544. Here the guide is sized to 1024×576, the take's own size, so both
sides are multiples of 64 as the model card asks (`checkGuideSizes` in
`scripts/check-ui-workflows.mjs` enforces that statically). The LoRA's
safetensors header, read from Hugging Face at `bd765d5` on 29 October 2026,
carries only `license` and `model_version`, no `reference_downscale_factor`,
so `LTXICLoRALoaderModelOnly` uses factor 1 and any multiple of 32 would do;
64 leaves margin and matches the Union Control graph.

## Added for the World Builder

- **Prompt**: the AKUSPACE Prompt (scene text + the built room from
  Acoustics) is the positive prompt.
- **Sound**: Layout-to-Render writes no audio, so CreateVideo muxes the take's
  audio through World Builder · Reverb in the built room.
- **World Builder · Storyboard**: take, still and render on one sheet.
- **World Builder · Inputs**: the render back onto the World Builder screen.

## Inputs

| Node             | Value                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture          | `director/world-take.webm` and its depth, recipe 24 fps, 1024×576, 193 frames; **Send take to Comfy** fills these                                                                                                                                        |
| Reference still  | `world-p03.png`, a take's `first.png` (**Send first frame**); replace it with a Klein still of that frame                                                                                                                                                |
| LoadAudio (test) | `mix-track.mp3`: **Koshi Mosaic · Dimensions**, the first 60 s at 128 kbps with a 1.5 s fade, the World Builder's example track (`public/media/director-templates/dimensions-mix/mix-track.mp3`). Optional; not MIT: bundled with the owner's permission |

## Files ComfyUI's `input/` must hold

Copy these into the input directory before queueing (the box upload step copies the same list):

| File                             | Source                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `mix-track.mp3`                  | `public/media/director-templates/dimensions-mix/mix-track.mp3` (the test audio)         |
| `director/world-take.webm`       | **Send take to Comfy** from the World Builder (colour frames, 193 frames at 24 fps)     |
| `director/world-take-depth.webm` | the same take's depth pass                                                              |
| `world-p03.png`                  | the reference still: a take's `first.png` (**Send first frame**) or a Klein still of it |

## Models (`comfy-build/models/layout-to-render.txt`)

`ltx-2.5-22b-distilled-transformer-bf16.safetensors`,
`gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`,
`ltx-2.5-video-vae-bf16.safetensors`,
`ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` and
`ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors`. The list's audio VAE is
not needed (the supplied graph loads it and leaves it unconnected).
ComfyUI-LTXVideo `220e1d4` provides the two IC-LoRA nodes.

## Validation, 29 October 2026

- `node scripts/check-ui-workflows.mjs --object-info http://127.0.0.1:8188`:
  53 nodes, 88 links, 35 classes, no errors. ComfyUI-LTXVideo is not installed
  on the Mac, so `LTXICLoRALoaderModelOnly` and `LTXAddVideoICLoRAGuide` were
  checked against `scripts/comfy-schemas/ltxvideo-220e1d4.json`, transcribed
  from `iclora.py` at the pinned commit. Core classes were also found in
  ComfyUI `98cc0bf`.
- `tests/world-builder-workflows.test.ts` covers link integrity, the model
  lists and the IC-LoRA loader.
- The take, room and Reverb nodes are the ones queued successfully in the
  AKUSPACE graph's check (see its README).
- **No LTX render was run on the Mac** (no weights there). The graph is unrun
  on a GPU; the IC-LoRA was also not advertised by Comfy Cloud on 26 October
  ([status](../docs/layout-to-render-status.md)).
