---
name: audio-visual
description: Make Genobi's Audio-visual house template (Slab light) end to end through the Genobi MCP tools - set the space, title and AKUSPACE room, quote three one-bar shots on LTX-2.5 Acoustic Space, generate only on the person's yes, and record a provenance card.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with a Comfy key, the genobi MCP server and Node 22 or later.
metadata:
  version: "0.1.0"
  template: "audio-visual"
  tier: "Open"
  tags: "agents, director, sound, ltx"
  docs: "docs/templates.md, docs/hermes-runs.md, docs/camera-wording.md"
---

# Audio-visual (Slab light)

A music-led piece in raw concrete and hard slices of white light, no people:
**Slice** (establishing, dolly in), **Rise** (wide, crane) and **Sweep** (wide,
high angle, orbit), each one bar of the track so the cuts land on the
downbeat. Every shot runs on LTX-2.5 · Acoustic Space (`ltx-2-5-akuspace`,
open weights: LTX-2.5 Fast's graph with the AKUSPACE LoRA) on Comfy Cloud, with
the chosen room as its AKUSPACE caption. 16:9 only.

| Input      | What to ask for                                    | Limit                       |
| ---------- | -------------------------------------------------- | --------------------------- |
| `subject`  | An architectural or abstract space, without people | 240 characters              |
| `title`    | The piece's title, on the last bar                 | 40 characters               |
| `bpm`      | The track's tempo                                  | 60 to 180, default 120      |
| `acoustic` | An AKUSPACE room, default Cathedral · Moderate     | see below                   |
| Track      | One audio file the person has the rights to        | the sample pulse by default |

A room is `{"mode": "room", "preset": "<preset>", "level": "<level>"}` with
`preset` one of `small_room`, `empty_club`, `medium_room` or `cathedral`, and
`level` one of `low`, `mid` or `high` (Moderate is `mid`).

Expected price at 120 BPM: about **$0.78** (three 2-second shots at $0.26).
Acoustic Space runs on Comfy Cloud GPU time; until its own cost formula lands
the studio estimates it at LTX-2.5 Fast's rate, so the confirmed cost can
differ.

Content rules: no people, no real buildings' trademarks, and only music the
person owns or has a licence for.

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.

## Steps

One tool call per step. Keep the values each step returns (after `→`). Never
skip steps 7 and 9.

1. `genobi_status {}` → `hasServerKey`. If it is false, stop: the studio needs
   a Comfy key. Note the time; it is `startedAt`.
2. Ask for the space, the title, the tempo and the room, then ask the person
   to open `/director?example=audio-visual`, set the tempo in the Director if
   it is not 120, and press **Link an agent**. They read you a code.
3. `genobi_link_project {"code": "<code>"}` → `copyId`.
4. `genobi_project {"copyId": "<copyId>"}` → `revision`, `composition.bpm`
   (the tempo the person set; the template's 120 when absent) and `cameras`:
   each shot's `camera`, keyed by its `shotId`.
5. `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-template-inputs", "inputs": {"subject": "<space>", "title": "<TITLE>", "acoustic": {"mode": "room", "preset": "<preset>", "level": "<level>"}}}}`
   → the new `revision`. The tempo is not a command input; it comes from the
   project.
6. `genobi_template_plan {"template": "audio-visual", "inputs": {"subject": "<space>", "title": "<TITLE>", "bpm": <composition.bpm from step 4>, "acoustic": {"mode": "room", "preset": "<preset>", "level": "<level>"}}, "cameras": <cameras from step 4>}`
   → `shots[]`. Each shot is generated at the shortest length that covers its
   bar and trimmed to the bar on the timeline.
7. `genobi_budget {"runs": 3, "usd": <total estimateUsd from step 6>}` →
   `fits`. If it is false, stop here, before any quote: tell the person what
   `next` says.
8. For each shot, `genobi_quote {...shots[i].quote, "projectRevision": <revision>}`
   → `quoteId` and `estimateUsd`.
9. Show the person each shot's price and the total, say the confirmed cost may
   differ (Comfy Cloud GPU time), and ask: "Generate these three shots for
   about $<total>?" Wait for a yes to this price.
10. For each accepted shot, `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "av-<shotId>-<yyyymmddhhmm>", ...the exact arguments of step 8}`
    Send every argument you quoted for that shot, `projectRevision` included.
    → job `id`.
11. `genobi_job {"id": "<id>"}` every 20 seconds until `Ready`; Comfy Cloud
    workflows take longer than Router runs. Any other final status: stop and
    tell the person.
12. `genobi_take {"id": "<id>"}` for each Ready job.
13. For each Ready shot, hand its take into the project:
    `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`
    → `assetId` and the new `revision`. Your takes live in your own studio
    session; this is how the person sees them.
14. Put it where the shot's plate stands:
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "replace-plate", "layerId": "shot-<shotId>", "assetId": "<assetId>"}}`
    → the new `revision`. The clip keeps the shot's start and length.
15. `genobi_provenance {"title": "<TITLE>: audio-visual", "jobIds": ["<slice id>", "<rise id>", "<sweep id>"], "copyId": "<copyId>", "skill": "plugins/genobi/skills/audio-visual/SKILL.md", "agent": {"harness": "<hermes, claude-code or codex>", "model": "<your model id>", "provider": "<local or nous or ...>"}, "workflows": "cloud", "hardware": "Comfy Cloud GPUs", "startedAt": "<from step 1>"}`
    → `markdown` and `badge`. Give the person the Markdown.

## If something goes wrong

- A room AKUSPACE does not offer is refused by `genobi_template_plan` and by
  the command; ask the person to pick another.
- An uncertain submission: follow the `genobi_submit` answer and resubmit only
  with the **same** key.
