---
name: character-piece
description: Make Genobi's Character piece house template (North light) end to end through the Genobi MCP tools - a character still on open FLUX 3 Image Klein, then three quoted LTX shots (arrive, turn, hold), generated only on the person's yes, with a provenance card.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with a Comfy key, the genobi MCP server and Node 22 or later.
metadata:
  version: "0.1.0"
  template: "character-piece"
  tier: "Open"
  tags: "agents, director, mcp"
  docs: "docs/templates.md, docs/hermes-runs.md"
---

# Character piece (North light)

One character across a short arc in a bare lime-washed room with one tall
window: **Arrive** 4 s (full shot, eye level, pan), **Turn** 4 s (close-up,
orbit) and **Hold** 3 s (medium shot, static, into the lens). The name enters
on the Hold. Shots run on LTX-2.5 Fast (`ltx-2-5-fast`, open weights); the
character still is made with FLUX 3 Image Klein (`flux-3-klein`, open
weights, the open workflow).

| Input     | What to ask for                                         | Limit                      |
| --------- | ------------------------------------------------------- | -------------------------- |
| `subject` | Who they are and what they wear, repeated in every shot | 240 characters             |
| `title`   | The character's name                                    | 40 characters              |
| `aspect`  | `9:16` (default) or `16:9`                              | chosen when the link opens |
| Stills    | 1 to 3 stills of the same person; step 15 can make one  | made with `flux-3-klein`   |

Expected price at `hd`: about **$1.42** for the three shots ($0.52, $0.52,
$0.39); the optional Klein still at 1K is $0.009 more, as a fourth run.

Content rules: the character must be invented. Never describe or upload a
real or famous person. Keep it lawful and safe for work.

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.

## Steps

One tool call per step. Keep the values each step returns (after `→`). Never
skip steps 7 and 9.

The studio's demo key allows three generations per agent session per day, and
the agent cannot bring a key of its own, so the recipe is the **three shots**
(on a key the owner saved, `genobi_budget` reports `uncapped` and the fourth
run fits by price alone).
The Klein still is a separate yes, made only when a fourth run fits (step 15);
otherwise the person adds a still of their own, or makes it in the studio with
their key. The shots are text to video and do not wait for it.

1. `genobi_status {}` → `hasServerKey`. If it is false, stop: the studio needs
   a Comfy key. Note the time; it is `startedAt`.
2. Ask the person for the character and their name, then to open
   `/director?example=character-piece` (add `&aspect=16:9` for landscape) and
   press **Link an agent**. They read you a code.
3. `genobi_link_project {"code": "<code>"}` → `copyId`.
4. `genobi_project {"copyId": "<copyId>"}` → `revision` and `cameras`: each
   shot's `camera`, keyed by its `shotId`.
5. `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-template-inputs", "inputs": {"subject": "<character>", "title": "<NAME>"}}}`
   → the new `revision`.
6. `genobi_template_plan {"template": "character-piece", "inputs": {"subject": "<character>", "title": "<NAME>", "aspect": "<aspect>"}, "cameras": <cameras from step 4>}`
   → `shots[]` and the total `estimateUsd`.
7. `genobi_budget {"runs": 3, "usd": <total estimateUsd from step 6>}` →
   `fits`. If it is false, stop here, before any quote: tell the person what
   `next` says.
8. For each shot, `genobi_quote {...shots[i].quote, "projectRevision": <revision>}`
   → `quoteId`, `estimateUsd`.
9. Show the person each shot's price and the total. Ask: "Generate the three
   shots for about $<total>?" Wait for a yes to this price. Silence, or a yes
   to an earlier price, is not a yes.
10. For each accepted shot, `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "character-<shotId>-<yyyymmddhhmm>", ...the exact arguments of step 8}`
    Send every argument you quoted for that shot, `projectRevision` included.
    → job `id`. A quote lasts ten minutes; if it expired, quote again and ask
    again.
11. `genobi_job {"id": "<id>"}` for each job every 15 seconds until `Ready`;
    then `genobi_take {"id": "<id>"}` for each. Any other final status: stop
    and tell the person; never resubmit with a new key.
12. For each Ready shot, hand its take into the project:
    `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`
    → `assetId` and the new `revision`. Your takes live in your own studio
    session; this is how the person sees them.
13. Put it where the shot's plate stands:
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "replace-plate", "layerId": "shot-<shotId>", "assetId": "<assetId>"}}`
    → the new `revision`. The clip keeps the shot's start and length.
14. `genobi_provenance {"title": "<NAME>: character piece", "jobIds": ["<arrive id>", "<turn id>", "<hold id>"], "copyId": "<copyId>", "skill": "plugins/genobi/skills/character-piece/SKILL.md", "agent": {"harness": "<hermes, claude-code or codex>", "model": "<your model id>", "provider": "<local or nous or ...>"}, "hardware": "Comfy Router (hosted)", "startedAt": "<from step 1>"}`
    → `markdown` and `badge`. Give the person the Markdown.
15. The still, only if the person wants one from Klein:
    `genobi_budget {"runs": 1, "usd": 0.009}` → `fits`; if it is false, say
    so and stop. Otherwise
    `genobi_quote {"generator": "image", "model": "flux-3-klein", "description": "<character>, standing in a bare room with lime-washed walls and one tall window, soft north light, a palette of chalk, oat, faded olive and ink.", "imageAspectRatio": "<aspect>", "imageResolution": "1k"}`,
    ask "Make the still for about $0.009?", wait for a yes, then
    `genobi_submit {"quoteId": "<still quoteId>", "idempotencyKey": "character-still-<yyyymmddhhmm>", ...the exact arguments of step 15}`,
    poll with `genobi_job`, read it with `genobi_take`, hand it in with
    `genobi_take_to_project {"id": "<still id>", "copyId": "<copyId>", "baseRevision": <revision>}`,
    and ask the person to mark it a reference in the project drawer. Its card is
    `genobi_provenance` with `"jobIds": ["<still id>"]`.

## If something goes wrong

- Klein's open workflow is refused or fails: tell the person. With a BFL key
  in the studio, the same model runs as `flux-3-klein-api`; quote it again.
  The LTX shots need the Comfy key, so that is a second session.
- An uncertain submission: follow the `genobi_submit` answer and resubmit only
  with the **same** key.
- The shots are text to video: the still travels in each shot's plan, and
  `subject` holds the character, word for word in every shot.
