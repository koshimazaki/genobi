---
tags: [setup, verification, comfy]
summary: Provider and workflow limitations, dated Cloud checks, and setup or recovery guides.
---

# Troubleshooting and workflow limits

These notes distinguish a model being listed from its graph running on a
particular host. Check the date and destination of each record: a successful
local ComfyUI run does not prove that the same custom nodes or model files
are available on Comfy Cloud.

## Find the right guide

| Problem                                         | Where to start                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Keys, provider choice or a disconnected session | [Getting started](getting-started.md#connect-generation)              |
| Local ComfyUI cannot find a model or node       | [Run location and model mapping](run-location.md)                     |
| Agent installation or sign-in                   | [Agent setup](agent-setup.md)                                         |
| Hosted agent connection                         | [Runner pairing](runner-pairing.md)                                   |
| Voice is unavailable or not installed           | [Voice setup](voice-setup.md)                                         |
| Which features have recorded verification?      | [Capability map](capabilities.md) and [verification](verification.md) |

Music 3 currently runs through the local studio, not the hosted Worker. Local
voice also needs its worker on your machine. See [getting started](getting-started.md)
before treating these differences as a provider error.

The checks below describe the named Cloud routes on 26 October. They do not
claim that all later external ComfyUI experiments failed or that every
account has the same model catalogue.

## Hosted links and agent startup

Public template pages open Editor from both **Make your own** and **Open**.
Generation-only cards return to Gallery. If an older tab still opens Director,
use the README’s explicit Editor link or reload after saving your project.

On Cloudflare, **Start Genobi** needs an online paired local runner. The dialog
offers local setup and pairing; status and local setup reads time out instead
of waiting indefinitely. Pairing authorizes agent inference, while voice,
local project files and paid approvals remain in the local studio.

A healthy `/api/health` verifies the studio API, not provider generation.
Local-only endpoints such as `/api/voice/status`, `/api/projects` and
`/api/settings/agent-runner` return 404 on the hosted adapter by design.

## Comfy Developer Platform status

The [worked workflow release](comfy-deploy.md) provides two GPU selectors and local CPU reverb, plus an
offline-validated shared build recipe. That does not establish a deployed GPU
service. Verify the build/release, endpoint address, model and asset loading,
FFmpeg/FFprobe and an explicitly approved test run before calling it live.
The hosted studio’s fixed workflow destination remains Comfy Cloud.

## Known issues — 26 October 2026

**3D → LTX Layout-to-Render.** The exact supplied graph needs a LoRA absent
from the authenticated Cloud model catalogue and includes an optional
`GemmaAPITextEncode` branch whose node is not advertised there. The other
execution nodes and base model files are present. Three.js capture is available;
the complete driver + look-image → generation → project handoff is not wired
yet. See the [exact workflow audit](layout-to-render-status.md). The plain
LTX Open workflow entry is text-to-video and does not provide this control.

**Klein 3 on Comfy Cloud.** Comfy provides FLUX 3 Klein text-to-image and
image-edit templates; these are still-image workflows, not video models.
During our authenticated Cloud API check, all node types in those templates
were advertised, but their Klein Base diffusion weight and two Qwen encoder
filenames were absent from the model dropdowns. Our existing distilled graph
also names a diffusion file absent from that response. This is an unresolved
API catalogue/availability discrepancy, not a claim that Klein 3 or its Comfy
templates do not exist. Recheck the intended Cloud account before a demo;
template presence alone does not verify API execution. Base and distilled
templates use different sampling settings, so changing a filename alone is
not a verified fix.

For image generation, select **FLUX 3 Image Klein → Run → API** with a connected
BFL key to use the existing direct BFL route. It keeps the selected shot size
and angle, omits camera movement, and charges the BFL account separately from
Comfy credits. Switching is explicit: an uncertain or failed Cloud submission
must not trigger an automatic paid retry on BFL. Klein's supplied image-edit
template is not yet connected to the app's open-workflow upload path; the
app's Edit mode currently runs FLUX 3 Edit.

The direct Klein image API fallback was verified on this date with three
native 2K stills: all returned 2736 × 1536 images, downloaded successfully and
decoded without errors. The submitted prompts retained shot size and angle
and contained no camera movement. This does not verify the Cloud workflow or
Klein image editing.
