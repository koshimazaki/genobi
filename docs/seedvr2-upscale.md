---
tags: [workflows, comfy, models, licences]
summary: SeedVR2, the open video upscaler - Comfy's core-node SeedVR2 3B template as the seedvr2-upscale workflow entry, free on a local ComfyUI, quoted on Comfy Cloud, and the Dimensions mix's optional last step.
---

# SeedVR2 open upscaler

The `seedvr2-upscale` registry entry is Genobi's open video upscaler, beside
the closed FLUX Video Upscale. It runs Comfy's official **Video Upscale:
SeedVR2 3B Int8** template on the workflow route, on a local ComfyUI or on
Comfy Cloud, wherever the session's [run location](run-location.md) points.
The graph, its slots and models are in
[the workflow README](https://github.com/koshimazaki/Genobi/blob/main/workflows/seedvr2-upscale.README.md).

- Code: `shared/comfy/seedvr2.ts` (template, slots, values, the frame
  ceiling, the Cloud estimate), `shared/registry.ts` (the entry),
  `shared/comfy/workflows.ts` (the `upscale` capability's template).
- Studio: Camera › Family › **Upscale** (the icon-only fourth family, after
  LTX, FLUX and H3) › **SeedVR2 · Video upscale**. The Upscale family lists
  SeedVR2 first, then FLUX Video Upscale; SeedVR2 is ByteDance's model, so it
  is not under FLUX. While FLUX Video Upscale is held, switch Open only on
  and it moves to SeedVR2, and the Upscale menu then lists SeedVR2 alone.
- Agents: `genobi_quote` then `genobi_submit` with `generator: "upscale"`,
  `model: "seedvr2-upscale"`, a `sourceId` and `upscaleFactor`; the
  `genobi-upscale` skill and [upscaling](upscaling.md) cover the whole process.

## What it takes

| Control        | Value                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Source clip    | An MP4 up to 50 MB and 2560 × 1440; 20 s, or 120 s on a local ComfyUI; longer in parts, below |
| Upscale amount | 1.5× to 3× (the template's `scale_multiplier`, default 2)                                     |

That is all the graph is sent: the amount and a fresh seed. SeedVR2 restores
what the clip holds, so it reads no prompt and has no Creative mode; a request
that carries either is recorded without it. The output keeps the source's fps
and sound. A frame is never more than **13.75 megapixels** (FLUX Video
Upscale's own ceiling): FLUX lowers its factor silently, but a graph is sent
exactly the amount the take records, so a source too large for the amount is
refused before the quote with the largest amount that fits (1440p at 2× is
14.7 MP: "choose 1.9× or less").

## Long clips upscaled in parts

Both upscalers take 20 s of source per run, except SeedVR2 on a local
ComfyUI, whose graph has no length cap (VRAM is the limit): the studio lets a
local SeedVR2 run take up to 120 s, and a split take a longer part length.
A longer clip is cut into 19 s parts plus the remainder, each upscaled as its
own reserved run under one quote and one approval, then joined with the
source's own sound. The whole process, the agent flow and the commands are on
[upscaling](upscaling.md).

## Where it runs and what it costs

- **Local ComfyUI: free.** ComfyUI 0.43 or later has the SeedVR2 nodes in its
  core; no custom pack. It needs the two model files (3.96 GB, below). A
  local run needs no key and is quoted at $0.
- **Comfy Cloud: a Comfy key, estimated.** Cloud bills an open graph by GPU
  time at a rate Genobi does not know, so the quote holds it at FLUX Video
  Upscale's Precise rate, as the open Klein graph is held at BFL's Klein price.
  A BFL key is refused with a pointer to a Comfy key, a local ComfyUI or FLUX.
- **The hosted studio** runs it on Comfy Cloud with the visitor's Comfy key,
  the same way it runs the H3 workflows: the clip is read from the session's
  storage after the ownership check and uploaded by the SDK.

Every run is a paid side effect wherever it goes: the reservation is stored
before submission, the job's id is the submission's idempotency key, and an
uncertain submission is recorded as an error and never resent
(`tests/seedvr2-jobs.test.ts`).

## Discovery (29 October 2026)

Read-only `comfy` CLI queries (1.23.0), nothing submitted:

- **Cloud nodes** (`comfy --json nodes search seedvr2 --where cloud`): nine.
  Five are core (`SeedVR2Preprocess`, `SeedVR2Conditioning`,
  `SeedVR2PostProcessing`, `SeedVR2TemporalChunk`, `SeedVR2TemporalMerge`);
  four are the `ComfyUI-SeedVR2_VideoUpscaler` pack v2.5.24
  (`SeedVR2LoadDiTModel`, `SeedVR2LoadVAEModel`, `SeedVR2VideoUpscaler`,
  `SeedVR2TorchCompileSettings`). None is disabled on Cloud.
- **Templates:** `utility_seedvr2_3b_int8_upscale_video` (core nodes, no
  custom pack; chosen) and `utility_seedvr2_video_upscale` (needs the pack).
- **Cloud models** (`comfy --json model search --text seedvr2 --where cloud`):
  `seedvr2_3b_int8_convrot.safetensors` (3.46 GB) and
  `seedvr2_ema_vae_fp16.safetensors` (0.50 GB) are in the catalogue, with the
  3B and 7B fp16, fp8, mxfp8, nvfp4 and int8 variants beside them.
- **Local install** (`~/ComfyUI-Installs/ComfyUI`, ComfyUI 0.43.1): the core
  nodes are present (`comfy_extras/nodes_seedvr.py`, and the bundled blueprint
  "Upscale Video (SeedVR2 3B Int8)"); no SeedVR2 model files and no SeedVR2
  custom pack are installed.
- `comfy knowledge pick "video upscale"` has no curated entry.

## Licence

The weights are ByteDance Seed's
[SeedVR2-3B](https://huggingface.co/ByteDance-Seed/SeedVR2-3B), repackaged for
ComfyUI as [Comfy-Org/SeedVR2](https://huggingface.co/Comfy-Org/SeedVR2), and
the [SeedVR code](https://github.com/ByteDance-Seed/SeedVR): all
**Apache-2.0**, not gated. Commercial use, modification and redistribution are
allowed with the licence and notices kept, and outputs carry no restriction,
so it suits the open tier and a commercial teaser alike
([LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)).
The workflow template is MIT (Comfy-Org/workflow_templates).

## The Dimensions mix's upscale step

The [Dimensions mix](dimensions-mix.md) declares one optional last step:
`mix.upscale = { entry: "seedvr2-upscale", factor: 2, optIn: true }`, the
960 × 540 render to 1920 × 1080. `optIn` is the literal `true`, so no template
can make it automatic. The simple Director shows it under the cut as
"Optional · Upscale with SeedVR2 (open)"; an agent's Regenerate prompt on the
mix project carries one line saying it runs only if the person asks, quoted
with `genobi_quote` and approved first. Nothing in the mix submits it. The
tier stays Open: `tierOf` counts the step, so a closed upscaler there would
make the mix Semi-open (`tests/dimensions-mix-upscale.test.ts`).

## Running it once on your GPU

Nothing here has run. The first local run, on a machine with an NVIDIA GPU
(24 GB or more is the comfortable size):

1. Update ComfyUI to 0.43 or later, then put the two files in its models
   folder:
   - `models/diffusion_models/seedvr2_3b_int8_convrot.safetensors` from
     <https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_3b_int8_convrot.safetensors>
   - `models/vae/seedvr2_ema_vae_fp16.safetensors` from
     <https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/seedvr2_ema_vae_fp16.safetensors>
2. Start ComfyUI, start the studio (`npm run dev`) and set the run location to
   Local ComfyUI (Studio setup, or the model menu's Local tick).
3. Optional, free: `genobi_workflows` with `checkLocal` (or the studio's
   workflow list) should report no missing node or model for
   `seedvr2-upscale`.
4. Camera › Family › Upscale › SeedVR2 · Video upscale. Choose a short clip
   (5 s, 720p is a good first test), leave the amount at 2× and press
   Generate. The quote reads $0.00 for a local run.
5. Record the result: the clip, its time, the GPU and peak VRAM, in
   [verification](verification.md). If it runs out of memory, the template's
   `split_latent` switch (`66:105.value`) is the slot to add first.

## Limits

- No run anywhere yet: not local, not Cloud. Time, VRAM and Cloud's real
  charge are unmeasured.
- One graph: the 3B int8 model, no trim, no latent split, no colour
  correction. The 7B models and the custom pack's graph are not offered.
- The Cloud estimate is FLUX's price, not Cloud's GPU time.
