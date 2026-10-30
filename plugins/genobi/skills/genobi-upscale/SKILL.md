---
name: genobi-upscale
description: Upscale a video in Genobi from start to finish - inspect the clip, choose SeedVR2 (open, free on a local GPU) or FLUX Video Upscale (API), run one upscale up to 20 s or plan a longer clip in 19 s parts behind one combined quote and one approval, wait while the parts are upscaled and joined with the clip's own sound, then report the joined clip and every part's state. Never resends an uncertain part.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with ffmpeg for a split, the genobi MCP server or CLI, and Node 22 or later.
metadata:
  version: "0.1.0"
  phase: "1 - quoted generation"
  tags: "agents, workflows, models, mcp"
  docs: "docs/upscaling.md, docs/seedvr2-upscale.md, docs/run-location.md"
---

# Genobi upscale

The whole process for upscaling a video. The reference is
[upscaling](https://github.com/koshimazaki/Genobi/blob/main/docs/upscaling.md);
model specifics are on the SeedVR2 page. Every paid step waits for the
person: you never spend on your own.

## 1. Inspect the clip

`genobi_media_probe {"sourceId": "<sourceId>"}` gives its duration, frame rate,
size and whether it has sound. An upscale takes an MP4 up to 50 MB and
2560 × 1440. Note the duration: it decides one run or parts.

## 2. Choose the upscaler

| Upscaler                                | Use it for                                            | Where and who pays                                                            |
| --------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| SeedVR2, `"model": "seedvr2-upscale"`   | Open weights; restores what the clip holds; no prompt | Local ComfyUI: $0, no key. Comfy Cloud: a Comfy key, held at FLUX's rate      |
| FLUX Video Upscale, `"model": "flux-3"` | BFL's model, an optional prompt, Creative mode        | Comfy Router (Comfy key) or BFL direct (BFL key), per output megapixel-second |

Ask the person when they have not said, recommending SeedVR2 when their run
location is a local ComfyUI. `genobi_run_location` reads where runs go.

## 3. One run, up to 20 s

A clip of 20 s or less (or any clip up to 120 s for SeedVR2 on a local
ComfyUI) is one upscale: price it with `genobi_quote`, as the genobi-camera
skill's upscale cards show. In a studio agent session that quote is a step the
person approves; otherwise ask them, and only after they agree call
`genobi_submit`.

## 4. Longer: plan the parts

Plan the split. It is free: the clip is cut on frame boundaries (local
ffmpeg) and every part is quoted.

`genobi_upscale_parts_plan {"generator": "upscale", "description": "", "camera": {}, "duration": 5, "resolution": "hd", "sourceId": "<sourceId>", "model": "seedvr2-upscale", "upscaleFactor": 2}`

- Parts are full 19 s chunks plus the remainder (23.125 s at 24 fps:
  frames 0–455 and 456–554). A tail under 1 s joins the part before it.
- On a local NVIDIA GPU you can raise the part length for SeedVR2 with
  `partSeconds` (1 to 120, or 0 for the whole clip in one part). VRAM is the
  limit: start with 19 s, and raise it if it fits. FLUX Video Upscale and
  Comfy Cloud take 19 s parts only.
- The answer is the plan (each part's frames and seconds), `estimateUsd`
  (the sum of the parts' quotes; $0 for a local SeedVR2 set), a `setId` and
  one `quoteId`. The same request again reopens that set; a changed prompt
  or setting plans a new one.

## 5. Ask once

Show the person the parts and the combined price.

- **In a studio agent session** the plan is already ONE step waiting for
  their approval in the studio. Tell them it is there and what it costs. You
  cannot confirm it yourself (`agent_cannot_spend`).
- **Outside the studio**, only after they agree, call
  `genobi_upscale_parts_confirm` with the `setId` and `quoteId` (the CLI needs
  `--confirm`).

## 6. Wait

Once approved, every part runs as its own reserved run, sent once, and the
studio joins them when all are ready: in order, at the source's frame count,
with the source's own sound. Read `genobi_upscale_parts` with the `setId`
about once a minute; do not poll faster.

**Joining parts by hand** (parts upscaled outside the studio) follows the same
order: drop every part's sound, join the pictures, then lay the original
clip's full, unsplit sound over the result from its first frame (hold the last
frame if the sound runs longer). Never join the parts' own sound. Each part's
audio is encoded separately with its own padding, so the joins click: a seam
too short to see is still easy to hear. The command is in `docs/upscaling.md`
under "Joining parts by hand".

## 7. Report

When `status` is `joined`, report `joined`: its label, size
(width × height), duration, `frames` and that the sound is the source's own,
and each part's state. `genobi_take_to_project` with `joined.sourceId` places
the clip in a linked Director project.

## When something fails

- **Uncertain part** (`uncertain: true`): it may already have been charged.
  Never resend it. Tell the person which part, and ask them to check their
  usage before anything else.
- **Failed or refused part:** the finished parts are kept. Retry only that
  part, and only with the person's agreement to its own new price:
  `genobi_upscale_parts_retry` prices it, then
  `genobi_upscale_parts_retry_confirm` sends it with the `retryQuoteId`.
  `part_busy` means a retry of that part is already being sent: wait.
- **Failed join:** `genobi_upscale_parts` with `rejoin: true` tries it again,
  free.
- **Declined:** the person said no. Nothing of the set runs; plan again only
  if they ask.

## CLI equivalents

`genobi media-probe`, `genobi upscale-parts-plan`, `genobi upscale-parts`,
`genobi upscale-parts-confirm --confirm`, `genobi upscale-parts-retry` and
`genobi upscale-parts-retry-confirm --confirm`, each with
`--input @request.json`. `genobi schema upscale-parts-plan` prints the input.
