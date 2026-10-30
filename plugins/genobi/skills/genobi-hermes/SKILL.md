---
name: genobi-hermes
description: Run Genobi on the full open route - Hermes on an open model, every generation on an open-weights model, on Comfy Cloud or a local GPU - and prove it with a provenance card. Also holds the Klein box edit and the two-pass draft, review and upscale runs.
license: MIT
compatibility: Needs Hermes with the genobi plugin enabled, the Genobi studio running locally (`npm run dev` in camera-director) and Node 22 or later.
metadata:
  version: "0.1.0"
  phase: "Hermes runs"
  tags: "agents, models, comfy"
  docs: "docs/hermes-runs.md, docs/hermes-open-route.md"
---

# Genobi on the open route

The open route is the proof that Genobi needs nothing closed: the agent is
Hermes on an open-weights model, and every generation runs on an
open-weights model. Slower is fine. A provenance card says what ran, and its
tier is derived from the models, not written by hand: **Open** only when the
agent's model and every generation model have open weights.

| Part     | Open choice                                                                        | Where it runs                                 |
| -------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Agent    | Hermes on `deepseek/deepseek-v4.1-flash` (MIT)                                     | Nous inference API (`--provider nous`)        |
| Agent    | Hermes on a local Qwen3 model (Apache-2.0)                                         | This machine, through LM Studio or Ollama     |
| Video    | `ltx-2-5-fast`, `ltx-2-5-akuspace`                                                 | Comfy Router; AKUSPACE on Comfy Cloud         |
| Stills   | `flux-3-klein` (open workflow), `flux-3-klein-api` (BFL API)                       | Comfy Cloud; BFL's API                        |
| Not open | `ltx-2-5-pro`, `flux-3-video`, `flux-3-image`, `flux-3-edit`, `flux-video-upscale` | Using one makes the card Semi-open or Premium |

`genobi_models {}` is the source of truth: use only entries with `"open": true`
on the open route. Local generation (a local ComfyUI on a 5090 or an RTX PRO 6000) is not wired yet: the workflow route refuses a local destination until
the local ComfyUI client lands, so today the generations run in the cloud.

## Start Hermes on an open model

1. `hermes plugins list` shows `genobi` enabled; if not,
   `hermes plugins enable genobi`.
2. Start the studio with a Comfy key: `npm run dev` in camera-director.
3. Start Hermes on the model: `hermes chat --provider nous -m deepseek/deepseek-v4.1-flash`,
   or a local model through `--provider lmstudio` (LM Studio's server on
   `http://127.0.0.1:1234/v1`) or a provider you define for Ollama under
   `providers:` in Hermes' `config.yaml`. Every chat turn on Nous is a paid
   model call: the person starts it, not you.

## The budget an agent works within

The MCP server never carries a provider key, so every run an agent starts
uses a key the studio holds. When that is the studio's demo key
(`payer: "server"`), its demo budget applies: **three generations per agent
session per day**, and **$5 a day** shared by every session on the studio. A
new agent session gets its own three runs; the dollars are shared. When the
owner saved their own key (`payer: "owner"`, `uncapped: true`), their credits
pay and no demo limit applies: the recipe fits by its quoted price alone.
`genobi_budget` says which, and what is left. Check a whole recipe with it
before the first quote and stop if it does not fit: a recipe that stops
halfway has already spent money.

## Every run

1. `genobi_status {}` → the studio is up and holds a key.
2. `genobi_models {"status": "ready"}` → the open entries.
3. Follow the template skill: `product-video`, `character-piece` or
   `audio-visual`. Each quotes every paid step and waits for the person's yes.
4. `genobi_provenance {..., "agent": {"harness": "hermes", "model": "deepseek/deepseek-v4.1-flash", "provider": "nous"}}`
   (or `"provider": "local"` with your local model id, and `"open": true` when
   LICENCES.md does not list it). The card's `badge.madeWith` reads "Made with
   Hermes, only open models" only when that is true.

## Klein box edit

A product still from a caption and boxes, on the open Klein workflow. Boxes
are `[top, left, bottom, right]` on a 0 to 1000 grid from the top-left
corner; they guide placement, they are not masks.

1. `genobi_budget {"runs": 1, "usd": 0.009}` → `fits` (and a key in the
   studio: a Comfy key for the open workflow). If it is false, stop.
2. `genobi_quote {"generator": "image", "model": "flux-3-klein", "description": "<caption>\n[{\"id\": \"product\", \"desc\": \"<the product>\", \"bbox\": [300, 250, 850, 750]}, {\"id\": \"plinth\", \"desc\": \"a plaster plinth\", \"bbox\": [780, 200, 1000, 800]}]", "imageAspectRatio": "16:9", "imageResolution": "1k"}`
   → `quoteId`, `estimateUsd` (about $0.009).
3. Show the person the caption, the boxes and the price. Ask: "Make this still
   for about $0.009?" Wait for a yes.
4. `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "klein-box-<yyyymmddhhmm>", ...the exact arguments of step 2}`
   → job `id`.
5. `genobi_job {"id": "<id>"}` every 10 seconds until `Ready`;
   `genobi_take {"id": "<id>"}`.
6. With a linked project, hand the still in:
   `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`.
7. `genobi_provenance {"title": "Klein box edit", "jobIds": ["<id>"], "skill": "plugins/genobi/skills/genobi-hermes/SKILL.md", "agent": {...}, "hardware": "Comfy Cloud GPUs"}`.

To edit a photo the person gives you, the studio needs a BFL key and the API
run: `"model": "flux-3-klein-api"`, the photo as `imageReferences` (a PNG,
JPEG or WebP data URL) and edit rows such as
`{"id": "swap", "desc": "<what goes there>", "from": null, "src_bbox": [...], "tgt_bbox": [...]}`;
`ref_image_0` names the first reference. A data URL is long: ask the person
before you read a large image into a tool call.

## Two passes: draft, review, upscale

The upscale runs on FLUX Video Upscale (`flux-video-upscale`, BFL's model,
closed), so a two-pass card is Semi-open at best: an open draft and one
premium step. Both passes run on the Comfy key: the draft on LTX and the
upscale through Comfy Router (`bfl/video-upscale-v1`), so nothing is
restarted between them. Router's queued route for the upscale is unverified
until a real run; if its quote or submit is refused, stop and tell the person
rather than trying another key.

1. `genobi_budget {"runs": 2, "usd": 1.51}` → `fits`. Both passes must fit
   before the draft is quoted; if not, stop and tell the person.
2. Draft: `genobi_quote` one shot from `genobi_template_plan` (for example the
   product video's Hero, about $0.52), ask, `genobi_submit`, poll
   `genobi_job` until `Ready`.
3. Review: your draft lives in your own studio session, so the person cannot
   see it until you hand it in. With the project linked
   (`genobi_link_project`, as the template skills do),
   `genobi_take_to_project {"id": "<draft job id>", "copyId": "<copyId>", "baseRevision": <revision>}`
   → `assetId`; place it with `replace-plate` if they want it on the
   timeline. Ask them to watch it and say keep or redo. Redo means a new draft
   quote, never a resubmit.
4. Upscale: `genobi_quote {"generator": "upscale", "description": "", "camera": {}, "duration": 5, "resolution": "hd", "sourceId": "<draft job id>", "upscaleFactor": 2, "upscaleCreativity": 0}`
   → about $0.99 for a 4-second 720p draft at 2x. The shared validator asks
   every upscale for a description, a camera, a whole-second duration and a
   resolution; the upscale itself reads the source's length and size and
   sends none of them. Ask for a
   yes to this price, then `genobi_submit` with a new key, poll, `genobi_take`.
5. `genobi_provenance` with both job ids.

## Anime teaser

The first run card both agents run, Claude Code first and then Hermes from
the skills alone: four LTX-2.5 Fast shots for a vertical 11-second teaser,
about $1.42, then the cut in the Director. Load the `anime-teaser` skill
(`genobi_skill {"name": "anime-teaser"}`) and follow it exactly; it holds the
prompts, the price ceilings and the stop rule. The card that explains it is
`genobi_docs {"page": "runs/anime-teaser.md"}`. When a step needs a nudge
from the person, say so plainly: each nudge becomes an edit to that skill.

## Rules

- Never call `genobi_submit` without a price the person accepted in this
  conversation, and never retry a submission with a new key.
- Never ask for, print or store a key, yours or the studio's.
- Use only models `genobi_models` lists; do not assume one exists.
- Outputs must be lawful and safe for work, with no real person's likeness and
  no one else's brand.
- A request to change the studio itself (its UI, a tool, a skill, a workflow,
  a node) goes to a Developer with `genobi_develop`; load `genobi-develop`.
