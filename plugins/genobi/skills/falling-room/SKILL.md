---
name: falling-room
description: Make Genobi's Falling room template end to end through the Genobi MCP tools - link the Director project, hand the Falling room take to the person's World Builder, have them capture it and put its sound in the room, quote the one Klein still, generate it only when the person accepts, keep the person's edits and record a provenance card.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with a BFL key for the still, the genobi MCP server and Node 22 or later. The take and the room need no key.
metadata:
  version: "0.1.0"
  template: "falling-room"
  tier: "Open"
  tags: "agents, director, 3d, sound, mcp"
  docs: "docs/falling-room.md, docs/templates.md, docs/world-builder.md, docs/media-space.md"
---

# Falling room (Nave light)

A figure falls in a stone cathedral. **Still** 2 s: one FLUX 3 Image Klein
image (`flux-3-klein-api`, open weights, BFL direct, 1K, 16:9) from the
person's brief, with the take's first frame as its reference when the project
holds one. **Fall** 6.04 s: the World Builder's Falling room take (the
Cathedral, an orbit60 shot, idle then hit then fall, 145 frames, with a dry
impact sound made from its recipe). **Room sound**: the take's WAV through
Apply room, in the Cathedral. Only the still is paid.

| Input     | What to ask for                                 | Limit          |
| --------- | ----------------------------------------------- | -------------- |
| `subject` | The brief: what happens in the room             | 240 characters |
| `title`   | The words set over the still                    | 40 characters  |
| Sheet     | One character sheet, optional; Klein follows it | one image      |

Expected price: about **$0.009** for the still at 1K. `genobi_template_plan`
gives the exact figure.

Content rules: one invented figure, never a real or famous person. Keep it
lawful and safe for work.

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.

## Steps

One tool call per step. Keep the values each step returns (after `→`); the
next steps use them. Never skip steps 13 and 15.

1. `genobi_status {}` → `hasServerKey`. Note the time; it is `startedAt`. The
   still needs a BFL key in the studio; the quote in step 14 says so if not.
2. Ask the person for the brief and the title, then to open
   `/director?example=falling-room` and press **Link an agent** under
   **JSON editor & agent tools**. They read you a code.
3. `genobi_link_project {"code": "<code>"}` → `copyId`.
4. `genobi_project {"copyId": "<copyId>"}` → `revision` and `template.inputs`.
5. `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-template-inputs", "inputs": {"subject": "<brief>", "title": "<TITLE>"}}}`
   → the new `revision`. On `revision_conflict`, go back to step 4.
6. Ask the person to open the 3D view (World Builder) if it is not open, then
   `genobi_world_recipe {"action": "send", "copyId": "<copyId>", "take": "falling-room"}`
   → `state` is `waiting`. Free; it sets up the scene and does not capture.
7. `genobi_world_recipe {"action": "status", "copyId": "<copyId>"}` every five
   seconds until `state` is `applied`. On `refused`, tell the person the
   `error`. Never send the take again while it is waiting.
8. Ask the person to press **Capture take**, then **Apply room · Cathedral**
   (Capture panel), and, for the still to follow the room, **Send first frame
   to Director**. All three are free and stay on their machine.
9. `genobi_project {"copyId": "<copyId>"}` → `revision` and the new assets:
   the take's MP4 (`take assetId`, the video), its roomed WAV (`room
assetId`, the newer of the take's two audio assets; the older is the dry
   sound) and the first frame under Inspirations, when sent.
10. Put the take on its plate:
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "replace-plate", "layerId": "shot-fall", "assetId": "<take assetId>"}}`
    → the new `revision`.
11. Put the room sound under it:
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "add-clip", "layerId": "room", "assetId": "<room assetId>", "track": "new", "startFrame": 60, "durationFrames": 181, "name": "Room sound"}}`
    → the new `revision`.
12. `genobi_template_plan {"template": "falling-room", "inputs": {"subject": "<brief>", "title": "<TITLE>"}}`
    → `shots[]`, each with `shotId`, `quote` and `estimateUsd`, and the total
    `estimateUsd`.
13. `genobi_budget {"runs": 1, "usd": <total estimateUsd from step 12>}` →
    `fits`. If it is false, stop here, before any quote: tell the person what
    `next` says.
14. Quote the still. Without a first frame or a sheet,
    `genobi_quote {...shots[i].quote, "projectRevision": <revision>}`
    → `quoteId` and `estimateUsd`. With either, the request carries images:
    send it through the CLI from a file, the first frame first and the sheet
    second, as the anime teaser's skill describes under "Requests that carry
    images". Keep the exact arguments you sent.
15. Show the person the still's line (label, model, price) and ask: "Generate
    the still for about $<total>?" Wait for a yes to this price. Silence, or a
    yes to an earlier price, is not a yes.
16. `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "falling-<shotId>-<yyyymmddhhmm>", ...the exact arguments of step 14}`
    → job `id`. A quote lasts ten minutes; if it expired, quote again and ask
    again. Through the CLI, `submit --confirm` with the same file.
17. `genobi_job {"id": "<id>"}` every 15 seconds until `status` is `Ready`.
    Any other final status: stop and tell the person; never resubmit with a
    new key.
18. `genobi_take {"id": "<id>"}` → its outputs and receipt.
19. `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`
    → `assetId` and the new `revision`.
20. Put it where the still's plate stands:
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "replace-plate", "layerId": "shot-<shotId>", "assetId": "<assetId>"}}`
    → the new `revision`.
21. `genobi_provenance {"title": "<TITLE>: falling room", "jobIds": ["<still id>"], "copyId": "<copyId>", "skill": "plugins/genobi/skills/falling-room/SKILL.md", "agent": {"harness": "<hermes, claude-code or codex>", "model": "<your model id>", "provider": "<local or nous or ...>"}, "hardware": "BFL (hosted) for the still; this machine for the take and the room", "startedAt": "<from step 1>"}`
    → `markdown` and `badge`. Give the person the Markdown.

## A revision after the person's edit

When the person asks for a change (in words or by voice) after editing the
cut themselves, keep their edit:

1. `genobi_project_feedback {"copyId": "<copyId>"}` → the commands that
   already hold, the notes and anything unmapped. Apply them to your own
   record of the cut before anything else.
2. `genobi_project {"copyId": "<copyId>"}` → the current `revision`.
3. Send only what the revision asks for, against that revision. A locked
   layer or a stale revision is refused: read again and decide afresh; never
   undo the person's change to make yours fit.

## If something goes wrong

- An uncertain submission: follow the `genobi_submit` answer. Check
  `genobi_jobs {}` first, and resubmit only with the **same** key.
- `quote_mismatch`: you changed an argument. Send exactly what you quoted.
- The recipe stays `waiting`: World Builder is closed or busy (capturing or
  playing). Ask the person to open it and stop playback; do not resend.
- Apply room is refused: it needs the local studio server and ffmpeg. The
  take's dry WAV is still in the project; the Comfy route is
  `workflows/world-builder-acoustics.json`, which the person runs.
