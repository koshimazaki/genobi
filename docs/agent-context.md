---
tags: [agents, studio]
summary: The context block a project-prompt session starts with - the person's recent picks and the composer's settings - its limits, how the server checks it, and how "my last two picks" and "these settings" are resolved to real ids before the agent reads the prompt.
---

# Picks and context

"Picks and context". The project prompt ([voice mode](voice-mode.md#the-project-prompt),
[agent sessions](agent-sessions.md)) hands what the person said to their own
agent. Without context, "use my last two picks" or "make it again with these
settings" leaves the agent guessing.

## What it holds

Every session start, spoken or typed, carries a small context block (`shared/agent-context.ts`), so the agent
reads real ids instead of guessing. `startAgentSession` adds it
(`src/agent/studio-context.ts`); it lives in the page's memory only and is
never stored or logged.

- **Picks**, newest first, at most eight, each once: a gallery take whose
  title the person chose (`take`, its job id, video or image, its description)
  and an asset selected in the Director, directly or through its clip (each explicit selection counts, choosing the same asset again included; other store updates record nothing)
  (`asset`, its asset id, kind, file name without folders, and `projectId`).
  Names are one line of at most 80 characters.
- **Settings**: the request Generate would send, taken from
  `composerInput`'s normalised fields with the upscale source App resolves
  (`upscaleSource`: the chosen clip, or the latest Ready video when none was
  chosen), so it cannot drift from a real one:
  the registry entry's generator and model (an Upscale after LTX names the
  upscale's model), and for video and upscale the duration, ratio,
  resolution, Draft, camera terms, upscale factor and creativity, an
  upscale's source id and prompt (1,200 characters), and the Acoustic Space
  treatment (`readAcoustic`: the node's spaces, presets and levels, custom
  wording within 600 characters); for images their tier, ratio, grounding,
  safety tolerance and still camera. For the agent to read, not to send:
  LTX's Light terms and filled gaps (300 characters each) and the run
  location. Not the main prompt, no image references, no key, no URL and no
  path. Each of these, plus a description, passes the server's
  `validateInput`.

The server validates the block with the same parser (`parseAgentContext`:
known fields only, ids in their formats, camera and Light terms from the
shared lists) and refuses a bad one with `400 agent_request`. The block goes
at the end of the agent's brief as one JSON line; the skills
(`genobi-studio`, "The studio's context", and `genobi-director`) tell the
agent how to read it.

## The phrases

The phrases themselves are resolved before the prompt reaches the agent,
deterministically (`shared/agent-context-phrases.ts`, no model): "my last two
picks" becomes "my last two picks [take run-1 “Penguin” (video); asset audio
“pulse.wav” (audio, project signal-studies)]", and "these settings" (or "the
same settings", "my current settings") is followed by the settings in
brackets. Counts are digits or words up to eight, or "a couple of"; asking
for more picks than there are says how many there are, and no picks or
settings says so. A bare "pick" ("pick a camera") is left alone. The session
shows the words as the person said them; only the runner's prompt carries the
brackets.

## The block

One JSON object, at the end of the agent's brief under **The studio's
context**, in a fence tagged `json genobi-context`:

```json
{
  "picks": [
    { "kind": "take", "id": "run-1", "media": "video", "name": "Penguin" },
    {
      "kind": "asset",
      "id": "audio",
      "media": "audio",
      "name": "pulse.wav",
      "projectId": "signal-studies"
    }
  ],
  "settings": {
    "generator": "video",
    "model": "ltx-2.5",
    "duration": 6,
    "aspectRatio": "16:9",
    "resolution": "hd",
    "draft": false,
    "cameraEnabled": true,
    "camera": { "shot-sizes": null, "angles": null, "movements": null },
    "light": { "lighting": "neon-glow", "palette": null, "atmosphere": null },
    "gaps": { "scene": "a wet street at night" },
    "runLocation": "local"
  }
}
```

| Field               | Bounds                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `picks`             | Newest first, each once (a take by job id, an asset by `projectId` and id), at most 8; more than 32 sent is refused                                                                                                                                                              |
| `picks[].kind`      | `take` (a gallery job id, `[A-Za-z0-9_-]{1,64}`) or `asset` (a Director id)                                                                                                                                                                                                      |
| `picks[].name`      | One line, control characters out, at most 80 characters                                                                                                                                                                                                                          |
| `picks[].projectId` | Assets only, a Director id                                                                                                                                                                                                                                                       |
| `settings`          | Generator from the four, model a lowercase id, ratio, size, booleans, duration 0 to 600 s; `imageResolution` one of `KLEIN_RESOLUTIONS` (`shared/image.ts`, 1.5k included)                                                                                                       |
| `settings.camera`   | One term per camera section from `shared/camera.ts`, or null                                                                                                                                                                                                                     |
| `settings.light`    | One term per Light group from `shared/light.ts`, or null                                                                                                                                                                                                                         |
| `settings.gaps`     | Only LTX's four gap ids, 300 characters each, empty gaps dropped                                                                                                                                                                                                                 |
| `runLocation`       | `local` or `cloud`, from the studio's settings store                                                                                                                                                                                                                             |
| `direction`         | The open project's id, its `globalPrompt` (2,000 characters, `globalPromptCut` when longer) and the selected `clip` (id, name, kind, `prompt`, `directions`); see [prompts](director-prompts.md)                                                                                 |
| `world`             | Only while World Builder is on screen: `open: true`, the `projectId` open beside it, the `preset` or named take it last loaded with that project open (40 characters) and a one-line `summary` of the set (600 characters); see [World Builder](world-builder.md#agent-hand-off) |

Anything else in the object is dropped, not passed on, so a key, URL or path
added to a pick never reaches the agent. JSON escapes newlines, so a name
cannot end the fence or start a heading in the brief. The request body limit
for a session start is 24 kB.

## What the agent may read, and where it quotes

The agent's Genobi MCP server and its browser each have a studio session of
their own, so on their own they could neither read the person's takes nor
quote under the person's run location. The session's grant joins them up:
Hermes' `GENOBI_AGENT_RUN` token (its profile already passes it to the MCP
servers), or for Claude Code a fresh 24-character token in the Genobi MCP
server's environment only. The MCP server sends it as `X-Genobi-Agent-Run`
beside the agent mark (`mcp/api.ts`); the browser is known by its ticket
session. `AgentSessions.scope` finds the running session either way
(`server/agent-scope.ts`), and only while it runs.

- **One read scope.** At start the server keeps only what the session may
  use: take picks the person owns (others are dropped from the block and
  the brackets); asset picks of the linked project only (an earlier
  project's are left out before "my last N picks" is resolved, and the
  block's `note` says so: "1 pick from another project was left out; open
  that project to use it"; project access is not extended); and the
  settings' upscale `sourceId` when the person owns it or it is a catalogue
  clip (public, so kept without a grant), left out of the settings
  otherwise; and the `direction` of the linked project only; and `world`
  only when its `projectId` is the linked project (or both are absent), since
  a recipe hand-off reaches only the World Builder beside that project. Those ids are the session's one readable set
  (`scopedContext`, `server/agent-scope.ts`). Every route that reads a job,
  take or source by id resolves the id through the same helper,
  `readerOf`, and reads it as the person's only when it is in the set; the
  list is `SCOPED_READS`:

  | Route                          | What it reads                                           |
  | ------------------------------ | ------------------------------------------------------- |
  | `GET /api/jobs/:id`            | the job, polled (`genobi_job`)                          |
  | `GET /api/takes/:id`           | the take record (`genobi_take`)                         |
  | `GET /api/clips/:id`           | the clip itself, for the agent's browser                |
  | `GET /api/media/:id/probe`     | the clip's measured streams                             |
  | `POST /api/quotes`             | an upscale's source, while pricing                      |
  | `POST /api/projects/:id/takes` | the take's or result's media (`genobi_take_to_project`) |
  | `POST /api/audio/analyze`      | a named source                                          |

  Read only: a quote stays the agent's (its budget and run location too), a
  take handed into a project goes to the agent's own link, and every write,
  cancel and submission runs in the agent's own session, where the paid
  routes refuse it. Any other job or source of the person's is a 404, as is
  everything without the grant or after Stop.

- **The person's settings.** At start the server reads the person's run
  location and workflow templates (`WorkflowSettings.snapshot`). The first
  time an agent's studio session is seen with the grant or ticket, it is
  given the same choices through `WorkflowSettings.adopt`: the same write and
  checks as the person's own controls (Local or Cloud only, templates the
  entry offers). So `genobi_quote` prices what the person sees: with the
  person on Local, an agent's workflow quote is Local and free.
  Confirm before spending
  relies on this: its approvals are refused when the two sessions differ.

## Verification

Local, 22 October 2026, no agent or provider called:

- `tests/agent-context.test.ts`: caps, ordering and de-duplication; names
  cleaned and bounded; unknown fields (a key, a URL) dropped; ids, kinds,
  terms, gaps, location and duration outside their formats refused; the
  request parser carrying and refusing a context; the block as one JSON line;
  the phrases ("my last two picks", "the latest pick", "my last 3 picks", "a
  couple of picks", more than there are, none, "these settings", "the same
  settings") and the words left alone ("pick a camera", "open the settings").
- `tests/agent-context-session.test.ts`: gallery takes and Director assets
  recorded newest first (the Director's selection followed through the
  store), an asset named by its file name only, the composer's settings
  without its prompt and with the run location, `startAgentSession` sending
  the context (and none when there is nothing), and a session on the fake
  runner whose stdin prompt carries the resolved ids and whose brief carries
  the block, while the session shows the words as said; a bad context is
  `400 agent_request`.
- `tests/agent-picks-access.test.ts`: acting as the MCP server with the grant
  the fake runner reports, a picked take is readable while an unpicked job of
  the person's and another person's job are 404, as is everything without the
  grant or after Stop, and the agent still cannot submit; with the person on
  Local, the agent's run location reads Local and its workflow quote is Local
  at $0. Both fail with the read scope or the settings handoff switched off.
- The same file hands a picked, finished take into the agent's linked copy
  of the person's project, while an unpicked one is a 404 (it failed with the
  media read in the agent's session).
- `tests/agent-picks-mcp.test.ts`: through the real Genobi MCP server, built
  with the session's mark and grant, the agent links the person's project,
  hands a picked take in with `genobi_take_to_project` and quotes its upscale
  with `genobi_quote`; an unpicked take is refused by both. It failed with
  the tool missing from `GENOBI_TOOLS` and with pricing reading the agent's
  own session.
- `tests/agent-scope-routes.test.ts`: for every route in `SCOPED_READS`, a
  picked take and the settings' source are readable; an unpicked job of the
  person's, another person's job, a request without the grant and any
  request after Stop are 404. Every route the server declares is either in
  that list or named in the test with the reason it is not, so a new route
  cannot be missed. It failed with the settings source left out of the scope
  and with `/api/clips/:id` reading only the agent's session.
- `tests/agent-context-scope.test.ts`: a library clip kept as the upscale
  source and those settings quoted by the agent (it was dropped before); a
  made-up source left out; asset picks from two projects, only the linked
  one's offered, resolved and noted, and none with no project linked (both
  projects' picks were offered before).
- The same file starts four sessions at once for one person with a
  catalogue source: exactly one launches and three are `agent_busy`; three
  more people at once get the one remaining machine slot. Every await of a
  start now comes before its capacity check (it failed before, when the
  catalogue read came between the check and the session's registration).
  `tests/agent-context-session.test.ts`: asset A, take B, then A again
  leaves A first, and unrelated store updates record nothing.
- `tests/agent-context-settings.test.ts`: FLUX, a Klein still at 1.5k, LTX,
  LTX with AKUSPACE, Upscale after LTX, Upscale with no clip chosen (the
  latest Ready video resolved) and the Local run location: each
  context's settings, plus a description, pass `validateInput`; the upscale
  names `flux-3` and its source; the AKUSPACE treatment is kept, and a bad
  level or overlong wording refused. All but one failed before.
- `tests/agent-context.test.ts` also covers one asset id in two projects kept
  as two picks, and Klein's 1.5k tier accepted (both failed before).

Not yet run: a real agent reading the block, or the voice overlay in a browser
with picks made by hand.

## Not yet

- Picks beyond gallery titles and Director assets: a take chosen in Review, a
  frame kept in Dual Swords and template inputs are not recorded as picks yet,
  and nothing is starred.
- Picks last for the page: a reload starts with none.
