---
name: product-video
description: Make Genobi's Product video house template (Plinth) end to end through the Genobi MCP tools - link the Director project, set the product and its name, quote the three shots, generate only what the person accepts, and record a provenance card.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with a Comfy key, the genobi MCP server and Node 22 or later.
metadata:
  version: "0.1.0"
  template: "product-video"
  tier: "Open"
  tags: "agents, director, mcp"
  docs: "docs/templates.md, docs/hermes-runs.md"
---

# Product video (Plinth)

A product on a plaster plinth in a seamless warm-grey studio: **Hero** 4 s
(full shot, eye level, dolly in), **Detail** 3 s (extreme close-up, pan) and
**Reveal** 4 s (low angle, pull back), named in type over the reveal. Every
shot runs on LTX-2.5 Fast (`ltx-2-5-fast`, open weights) through Comfy Router.

| Input     | What to ask for                                                | Limit                         |
| --------- | -------------------------------------------------------------- | ----------------------------- |
| `subject` | The product and its material, as you would brief a set builder | 240 characters                |
| `title`   | The product name, set in type over the reveal                  | 40 characters                 |
| `aspect`  | `16:9` (default) or `9:16`                                     | chosen when the link opens    |
| Photos    | 0 to 3 product photos, optional                                | text to video reads `subject` |

Expected price at `hd`: about **$1.42** for the three shots ($0.52, $0.39,
$0.52). `genobi_template_plan` gives the exact figure for the inputs.

Content rules: the product must be one the person owns or invented. No real
brand marks, no real people. Keep it lawful and safe for work.

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.

## Steps

One tool call per step. Keep the values each step returns (after `→`); the
next steps use them. Never skip steps 7 and 9.

1. `genobi_status {}` → `hasServerKey`. If it is false, stop: ask the person
   to restart the studio with a Comfy key. Note the time; it is `startedAt`.
2. Ask the person for the product, its name and the format, then to open
   `/director?example=product-video` (add `&aspect=9:16` for portrait) and
   press **Link an agent** under **JSON editor & agent tools**. They read you a
   code.
3. `genobi_link_project {"code": "<code>"}` → `copyId`.
4. `genobi_project {"copyId": "<copyId>"}` → `revision`, `template.inputs`
   and `cameras`: each shot's `camera`, keyed by its `shotId`.
5. `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-template-inputs", "inputs": {"subject": "<product>", "title": "<NAME>"}}}`
   → the new `revision`. On `revision_conflict`, go back to step 4.
6. `genobi_template_plan {"template": "product-video", "inputs": {"subject": "<product>", "title": "<NAME>", "aspect": "<aspect>"}, "cameras": <cameras from step 4>}`
   → `shots[]`, each with `shotId`, `quote` and `estimateUsd`, and the total
   `estimateUsd`. The cameras carry any move the person set in the project.
7. `genobi_budget {"runs": 3, "usd": <total estimateUsd from step 6>}` →
   `fits`. If it is false, stop here, before any quote: tell the person what
   `next` says. No paid run starts that the recipe cannot finish.
8. For each shot, `genobi_quote {...shots[i].quote, "projectRevision": <revision>}`
   → `quoteId` and `estimateUsd`. Keep the exact arguments you sent.
9. Show the person one line per shot (label, length, price) and the total, and
   ask: "Generate these three shots for about $<total>?" Wait for a yes to
   this price. Silence, or a yes to an earlier price, is not a yes.
10. For each accepted shot, `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "product-<shotId>-<yyyymmddhhmm>", ...the exact arguments of step 8}`
    Send every argument you quoted for that shot, `projectRevision` included.
    → job `id`. A quote lasts ten minutes; if it expired, quote that shot again
    and ask again.
11. `genobi_job {"id": "<id>"}` every 15 seconds until `status` is `Ready`.
    Any other final status: stop and tell the person; never resubmit with a
    new key.
12. `genobi_take {"id": "<id>"}` for each Ready job → its outputs and receipt.
13. For each Ready shot, hand its take into the project:
    `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`
    → `assetId` and the new `revision`. Your takes live in your own studio
    session; this is how the person sees them.
14. Put it where the shot's plate stands:
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "replace-plate", "layerId": "shot-<shotId>", "assetId": "<assetId>"}}`
    → the new `revision`. The clip keeps the shot's start and length.
15. `genobi_provenance {"title": "<NAME>: product video", "jobIds": ["<hero id>", "<detail id>", "<reveal id>"], "copyId": "<copyId>", "skill": "plugins/genobi/skills/product-video/SKILL.md", "agent": {"harness": "<hermes, claude-code or codex>", "model": "<your model id>", "provider": "<local or nous or ...>"}, "hardware": "Comfy Router (hosted)", "startedAt": "<from step 1>"}`
    → `markdown` and `badge`. Give the person the Markdown.

## If something goes wrong

- An uncertain submission: follow the `genobi_submit` answer. Check
  `genobi_jobs {}` first, and resubmit only with the **same** key.
- `quote_mismatch`: you changed an argument. Send exactly what you quoted.
- A refusal from `genobi_template_plan` names the input to fix; ask the person.
