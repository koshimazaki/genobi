# seedvr2-upscale

The workflow behind **SeedVR2 · Video upscale** (registry entry
`seedvr2-upscale`, route `workflow`, model `workflow/seedvr2-upscale`), the
open upscaler beside FLUX Video Upscale. See
[the SeedVR2 page](../docs/seedvr2-upscale.md) for how it runs in the studio.

## Source

Comfy's official template **Video Upscale: SeedVR2 3B Int8**,
`templates/utility_seedvr2_3b_int8_upscale_video.json` in
[Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates/blob/e7cd011d4ded3411c2f481200544f0be6fdc962e/templates/utility_seedvr2_3b_int8_upscale_video.json)
(MIT, commit `e7cd011`, 28 September 2026). `comfy templates fetch` returned
the same bytes on 29 October 2026. It was converted to API format by
comfy-cli 1.23.0 (`comfy run --workflow … --where cloud --print-prompt`,
which converts against Comfy Cloud's live `object_info` and sends nothing),
so the one subgraph, "Upscale Video (SeedVR2 3B Int8)", is flattened into
nodes `66:*` and every widget value is the template's. Nothing was wired by
hand. The template's two Markdown notes are dropped by the conversion.

| Node    | Change from the template                                                   |
| ------- | -------------------------------------------------------------------------- |
| `73`    | `LoadVideo` file is a placeholder; the studio uploads the source (`video`) |
| `76`    | `SaveVideo` prefix `video/Genobi_SeedVR2`                                  |
| `66:54` | Seed is a slot; the template's fixed seed is not kept                      |

The graph uses core ComfyUI nodes only (`comfy_extras/nodes_seedvr.py`, added
by [ComfyUI PR #14424](https://github.com/Comfy-Org/ComfyUI/pull/14424)):
`SeedVR2Preprocess`, `SeedVR2Conditioning`, `SeedVR2PostProcessing`,
`SeedVR2TemporalChunk` and `SeedVR2TemporalMerge`, with `UNETLoader`,
`VAELoader`, `VAEEncodeTiled`, `VAEDecodeTiled`, `KSampler` (one step),
`ResizeImageMaskNode`, `Video Slice`, `ComfySwitchNode`, `PrimitiveBoolean`,
`GetVideoComponents`, `CreateVideo` and `SaveVideo`. The fps, audio and bit
depth of the output are wired from `GetVideoComponents`, so the source's own
frame rate and sound come back.

Comfy's other SeedVR2 template, `utility_seedvr2_video_upscale`, needs the
`ComfyUI-SeedVR2_VideoUpscaler` custom pack (`SeedVR2LoadDiTModel`,
`SeedVR2VideoUpscaler`); this one needs no pack, which is why it was chosen.

## Slots

| Slot        | Path                           | Value the studio sends                                                      |
| ----------- | ------------------------------ | --------------------------------------------------------------------------- |
| `video`     | `73.file`                      | The source MP4, uploaded to the destination before the run                  |
| `scale`     | `66:57.resize_type.multiplier` | The upscale amount, 1.5 to 3 (the template's `scale_multiplier`, default 2) |
| `seed`      | `66:54.seed`                   | A fresh random seed                                                         |
| `unet_name` | `66:52.unet_name`              | Only on a local ComfyUI, from its model map                                 |
| `vae`       | `66:51.vae_name`               | Only on a local ComfyUI, from its model map                                 |

The template also exposes `trim_video` (`66:81.switch`), `trim_start_time` and
`duration` (`66:79`), `split_latent` (`66:105.value`) and its overlap
(`66:99.temporal_overlap`), `sampler_name`, `scheduler`, `denoise` and
`color_correction_method` (`66:59`). The studio leaves every one at the
template's value: no trim, no latent split, Euler / simple at denoise 1, no
colour correction. The template's own tip for a long clip on a small GPU is to
turn on `split_latent`; that is the first slot to add if a local run runs out
of memory.

## Models

| File                                  | Folder             | Size    |
| ------------------------------------- | ------------------ | ------- |
| `seedvr2_3b_int8_convrot.safetensors` | `diffusion_models` | 3.46 GB |
| `seedvr2_ema_vae_fp16.safetensors`    | `vae`              | 0.50 GB |

Both come from [Comfy-Org/SeedVR2](https://huggingface.co/Comfy-Org/SeedVR2)
(commit `df48879`), Comfy's repackaging of ByteDance Seed's
[SeedVR2-3B](https://huggingface.co/ByteDance-Seed/SeedVR2-3B). Both
repositories, and the [SeedVR code](https://github.com/ByteDance-Seed/SeedVR),
are **Apache-2.0**: commercial use, modification and redistribution are
allowed with the licence and notices kept; outputs carry no restriction
([LICENCES.md](../LICENCES.md)). Neither repository is gated.

Comfy Cloud's asset catalogue lists both files under these names
(`comfy model search --text seedvr2 --where cloud`, 29 October 2026), so the
graph keeps them. A local ComfyUI downloads them into the folders above, or
names its own files through `GENOBI_LOCAL_MODELS`
([run location](../docs/run-location.md#the-local-model-map)).

## VRAM and time

Comfy publishes no VRAM figure for this template. The ComfyUI-SeedVR2 pack
documents 12 to 16 GB for its 3B FP8 build, with tiling; this graph already
encodes and decodes tiled (512 px tiles, 64-frame temporal tiles). On a 24 GB
or larger NVIDIA card a 5 s clip at 2× is expected to fit without the latent
split. The model is one-step, so time grows with output pixels × frames;
**no run has been timed**, here or on Cloud. A first local run records it.

## Checks

`tests/seedvr2-workflow.test.ts` checks the links, node classes, models,
slots, the output node (`76`) and the untouched template values. Nothing has
run: no Cloud or local submission, no upscaled video.
