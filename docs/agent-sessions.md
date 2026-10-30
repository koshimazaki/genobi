---
tags: [agents, backend, mcp, studio]
summary: The project prompt starts a local agent session (Claude Code, or Hermes in its genobi profile) with the Genobi tools and its own browser, and further messages go to the running session; how it is set up, what it may and may not do, the spending guard and the routes.
---

# Agent sessions

The project prompt (issue #23, "One global prompt"; #14 for the agent choice)
hands what the person said or typed to **their own agent on this machine**. The
local server starts one agent session with the Genobi MCP tools and a browser
of its own; the agent works on the open project through Director commands, and
the person sees each change live. The studio shows the session's progress and
can stop it.

The contract is `shared/agent-session.ts`, copied verbatim by both builders of
#23; additions such as the header names live in `shared/agent-session-events.ts`.

## What runs where

Agent processes run locally. The hosted studio can now relay a start, progress
and Stop through [explicit runner pairing](runner-pairing.md). The Worker queues
requests; the paired local server spawns the same restricted agent session.
Project files and paid approvals remain in the local studio.

```text
studio ──POST /api/agent/sessions──▶ local server ──spawn──▶ claude -p  or  hermes chat (scratch folder)
  ▲                                     │                        ├─ Genobi MCP ──▶ /api/* (marked as an agent's)
  └── GET /api/agent/sessions/:id ◀─────┘ (lines, summary)       └─ Playwright MCP ──▶ its own headless browser
                                                                        └─ opens a one-use ticket ──▶ agent's studio session
```

- **Runner:** Claude Code in headless mode (`claude -p --input-format
stream-json --output-format stream-json --verbose`), whatever login the
  person's Claude Code already has, or Hermes in its `genobi` profile
  (`hermes chat --query-file - --oneshot --format stream-json`,
  [agent setup](agent-setup.md#hermes)). The prompt goes to its stdin, never
  on the command line: for Claude Code as a stream-JSON user turn, with stdin
  kept open for [further messages](#a-second-message); for Hermes as the one
  query, stdin then closed.
- **Working folder:** a fresh temporary folder per session, not the
  repository. It holds the session's MCP config and any screenshots, and is
  deleted when the session ends.
- **Environment:** only what the runner needs to find its own login and
  tools (`HOME`, `PATH`, locale; for Claude Code also `ANTHROPIC_*` and
  `CLAUDE_CODE_*`; for Hermes only its profile's `HERMES_HOME`, never the
  server's other `HERMES_*`). The server's provider keys (`COMFY_API_KEY`,
  `BFL_API_KEY`) and other settings stay behind.
- **Output:** stderr is discarded (it can name local paths). stdout is read
  as stream-JSON into short progress lines (the last 40, 300 characters each),
  the agent's final summary and how the run ended. Nothing is logged.
- **Ceiling:** one running session per studio session, two on the machine,
  and a timeout (15 minutes by default). Stop or the timeout sends SIGTERM to
  the session's own process group (the runner and the MCP servers it started),
  then SIGKILL five seconds later if it is still there. Hermes starts its MCP
  servers in sessions of their own, so for Hermes the server also ends every
  process group holding a process the session started
  (`server/agent-reap.ts`). Each Hermes session gets a random token,
  `GENOBI_AGENT_RUN`, in its environment; the profile passes it on to the MCP
  servers (`${GENOBI_AGENT_RUN}` in their `env`), and their children inherit
  it, so a child orphaned before anyone looked is still found by that exact
  token (`ps -E` on macOS, `/proc/<pid>/environ` on Linux). The server also
  lists the runner's descendants once a second and checks pid, group and
  command line again before a signal. Every ending reaps, including a runner
  that finishes on its own, and stopping the server stops every session the
  same way.

## A second message

Box 1.8. Voice's **Send to agent** (`src/voice/VoiceDestinations.tsx`) hands
the person's words to the session that is running, and starts one only when
none is (`sendToGenobi`, `src/agent/send.ts`). The page checks the session it
shows, then `GET /api/agent/sessions` (a reload may not know it yet), and
only then the [spawn action](agent-setup.md#spawn-the-agent).

- **Route:** `POST /api/agent/sessions/:id/messages` with `{ prompt, source }`,
  checked by `parseAgentMessage` (`shared/agent-session.ts`) with a start's
  rules: not empty, at most 4,000 characters, control characters stripped,
  `voice` or `typed`, nothing else. The same studio header, same-origin and
  ownership checks; another session's id reads as not found; an agent's own
  session is refused (`403 agent_nested`). It counts against `submit`, as a
  start does, since each turn spends the person's subscription. It never
  pushes the project copy.
- **Headless Claude Code keeps its process.** Each message is written to its
  stdin as one newline-terminated
  `{"type":"user","message":{"role":"user","content":"…"},"parent_tool_use_id":null}`
  (`userTurn`, `server/agent-runner.ts`), queued as the Agent SDK's streaming
  input queues turns. Each turn ends with a `result`, recorded as the agent's
  reply. When every turn is answered the view says `idle: true` and the
  session waits five minutes for another message (`server/agent-conversation.ts`);
  then stdin closes, Claude Code exits, and the session ends as a one-turn
  session always did (done, waiting for an approval, or failed). Stop, the
  timeout and the runner's own exit close stdin too. The ceilings stand: one
  running session per studio session, two per machine, and the 15-minute
  timeout counts from the start, across every turn.
- **No live transport:** Hermes reads its one query from stdin to the end
  (`--query-file -`) and, on a pipe, answers and exits; `--format
stream-json` needs that query (checked with Hermes v0.21.4, below). A
  Terminal window has no handle on the server, and a relayed session runs on
  another machine. Hermes and Terminal sessions get the message through
  their Genobi MCP server instead: the route queues it in memory
  (`server/agent-inbox.ts`, five unread at most, `429
agent_messages_waiting` past that), records it in the conversation with
  `pending: true` and answers 202; the MCP server collects the unread ones
  once each with its grant (`POST /api/agent/run/messages`, before the
  studio-origin check, agent mark required), which clears `pending`, and
  appends them to the agent's next Genobi tool answer (`withMessages`,
  `mcp/server.ts`). The brief tells the agent so, and that `genobi_status`
  collects any waiting. When the session ends, messages never collected keep
  `pending`, a line says "N messages were not read before the session
  ended.", and the queue goes. A relayed session has no message route: the
  studio copies the words to the clipboard and says so.
  `409 agent_no_live_transport` remains for a caller that passes no `source`
  to `AgentSessions.message`.
- **Ended:** a message for a session that has ended answers
  `409 agent_session_ended`, and the studio starts a new session with the
  words. One whose input just closed answers `409 agent_session_finishing`.

The view carries the conversation, `exchange` (the first prompt, each message
and each reply, newest 24, oldest first), `live` while it takes messages and
`idle` while it waits for one. The [bubble](agent-bubble.md) shows it.

## What the agent may do

The same tools for both runners, listed once in `server/agent-runner.ts`.
Claude Code runs with `--restricted --strict-mcp-config --tools ""
--permission-mode dontAsk`: no user or project settings, hooks or plugins, no
built-in tools (no shell, files or web fetch), and only these MCP tools, with
anything else refused without asking:

- **Genobi:** `genobi_status`, `genobi_models`, `genobi_jobs`, `genobi_job`,
  `genobi_quote`, `genobi_take`, `genobi_take_to_project` (never spends: it
  copies a take, or a media tool's result, into the linked project),
  `genobi_scrolls_panels` (never spends: text panels into the person's open
  scroll by the one-use code from a Scrolls Send, [Scrolls](scrolls.md#script-and-describe-the-video)),
  `genobi_projects`, `genobi_link_project`,
  `genobi_project`, `genobi_director_command`, `genobi_machine`,
  `genobi_registry`, `genobi_skill`, and the read-only media tools
  `genobi_media_tools` and `genobi_media_probe` (the cutting tools are left
  out; see [Dual Editor](dual-editor.md#agents)). **Not
  `genobi_submit`**, which is also passed to `--disallowedTools`.
- **Browser** (`@playwright/mcp@0.0.83`, Apache-2.0, run with `npx`):
  navigate, back, snapshot, screenshot, click, hover, type, press a key, fill a
  form, select, drag, wait, answer a dialog, resize, tabs and console messages.
  Not script evaluation, file upload or drop, network routing, cookies or
  storage, or recording.

The system prompt is the `genobi-studio` entry skill plus a short brief: the
link code, the ticket address, that it cannot spend, and to finish with what
it did and what the person has to do next. Other skills are loaded as the
request needs them, not preloaded: the entry skill's "Which skill" table, with
routing examples, tells the agent to call `genobi_skill` for the ones the task
needs before it acts (for example `genobi-director` and `genobi-camera` for a
cut with new shots, and nothing else for a request no skill covers yet). The
session has no file tools, so `genobi_skill` is how it reads them, and
`genobi_registry` searches every tool and skill by tag or text
([the registry](registry.md)).

### The studio's context

The request can carry `context`: the person's recent picks and the composer's
settings, validated by `parseAgentContext`. The server resolves "my last two
picks" and "these settings" in the prompt it writes to the runner's stdin and
appends the block to the brief; the session keeps the words as said. Take
picks the person does not own are dropped. Through the session's grant
(`X-Genobi-Agent-Run`, sent by its Genobi MCP server) or its browser's ticket
session, the agent may poll and read exactly the picked takes, and its studio
sessions take the person's run location and templates once. See
[Picks and context](agent-context.md).

### The open project

When the request names `copyId` (the open Director project's id), the server
mints a one-use link code for that copy with the project-links code
(`server/project-links.ts`), only if the person's session owns it, before
anything is spawned. The agent calls `genobi_link_project` with it and then
edits through Director commands, which the studio applies live.

### Its own browser

The browser is a fresh, isolated, headless instance (`--isolated
--headless`), never the person's Chrome profile. `--allowed-origins` names the
studio's origin only; Playwright documents that option as a convenience, not a
security boundary. Service workers and page-registered tools are off.

## The spending guard

An agent never spends. The person approves every paid step in their own
studio (**Confirm before spending**).

- **Ticket:** the brief gives the agent a one-use address,
  `/api/agent/ticket/<ticket>` (random, ten minutes, valid only while its
  session runs). Opening it sets a new studio session cookie, recorded as an
  agent's, and redirects to the studio.
- **Mark:** the agent's browser and its Genobi MCP server also send
  `X-Genobi-Agent-Session: 1` on every request (a Playwright context header and
  `GENOBI_AGENT_SESSION=1`). The header can only take spending away.
- **Refusal:** the paid routes, listed once in `PAID_ROUTES`
  (`server/agent-routes.ts`): `POST /api/jobs` (every generation),
  `POST /api/chains/:id/approve` (chain approvals), the split upscale's two
  confirms (`POST /api/upscale-parts/:id/confirm` and
  `/parts/:index/confirm`) and the person's Approve of an agent's step
  (below), answer either kind of agent
  request `403 agent_cannot_spend`: "An agent cannot spend. The person
  approves paid steps in their own studio." Quotes, reads, uploads, local media
  tools and Director commands stay open. A session that ends after such a
  refusal shows as **Waiting for you**.
- An agent's session cannot start another agent session (`403 agent_nested`),
  with one opening: it may start a Developer for a change to the studio
  ([below](#genobi-starts-a-developer)).

The agent's studio session and the person's are separate: a chain the agent
creates, its quotes, budget and uploads stay in its own session, and so does
everything it may write. Results are the exception (29 October 2026): on the
local server a Ready take that the Genobi CLI or an MCP client made in its own
session is listed in the person's gallery, marked **From terminal** or **From
agent**, and the studio may read its file, take and job
([terminal and agent takes](genobi-cli.md#takes-appear-in-the-studio)). An
agent-marked request gains nothing from this: it still reads only its scope.
A quote the agent takes is not left in
words: it appears in the person's session bubble with its plan and price, and
the person approves or declines it there.
[Confirm before spending](agent-approvals.md) has how a quote reaches the
studio, what Approve runs and every refusal.

### Recording a session

The server keeps only the last 40 lines and logs nothing, so a session that
should be reviewable afterwards is recorded from outside:
`scripts/watch-agent-session.mjs <session id>` polls
`GET /api/agent/sessions/:id` as the person's studio session (its
`camera_session` cookie in `GENOBI_STUDIO_SESSION`, the studio's header and
the agent mark), keeps every line once and in order, records each approval
and result, and writes a Markdown run log under `docs/hermes-runs/`. It only
reads. See [Run cards and logs](hermes-runs.md#run-cards-and-logs).

## Genobi starts a Developer

When the person asks the creative session to change the studio itself (its UI,
a tool, a skill, a workflow, a node), the session does not edit code or tell
them to open the repository. It calls `genobi_develop` (skill
`genobi-develop`), which starts one managed development session with the
Developer brief. This is the only path through `agent_nested`:

- **Route:** `POST /api/development/agent` with
  `{ role: "developer", task, files?, mode }` (`developRequest`,
  `shared/development-session.ts`): a task of 1 to 4,000 characters, at most
  20 repository-relative file hints (no leading `/`, no `..`), and `mode`
  `change` or `pr`. Anything else, a `runner` included, is `400
develop_request`. It answers `201` with a `DevelopReceipt`: id, runner,
  status, mode, task, branch, worktree, base commit, pull request URL and the
  Developer's summary. `GET /api/development/agent/:id` reads one the same
  session started; any other id is `404`.
- **Who may call it:** an agent-marked request whose grant resolves to a
  running, studio-started session (`locals.agentScope`). An agent-marked
  request without one, such as a standalone `hermes-creative` terminal or the
  Developer's own tools, is `403 agent_nested`; a request that is not an
  agent's (the person's browser) is `403 develop_agent_only`, since the person
  uses the Development panel. Local server only: the hosted Worker has neither
  route, and the `/api` boundary already refuses a non-loopback `Host`.
- **The runner is the person's:** `GENOBI_DEVELOP_RUNNER` (`hermes`, `claude`
  or `codex`) when set, otherwise the harness setup saved
  (`GENOBI_AGENT_RUNNER` or `.local/agent.json`), Codex included. None saved is
  `503 develop_runner`. Hermes runs in its `hermes-developer` profile, so on
  the open route (DeepSeek V4.1 Flash on Nous by default,
  [open route](hermes-open-route.md)); a missing profile is `503
development_unavailable`.
- **One at a time:** the machine's one-running-development-session ceiling
  applies (`409 development_busy`), so one Developer per studio session too.
  The session belongs to the person's studio session, so Development lists it
  with "Started by Genobi for: …", its branch, progress, pull request and
  **Stop Developer**. The receipt records the creative session's id
  (`startedBy.agentSession`). The 30-minute ceiling of managed sessions holds.
- **Its own worktree:** the server runs `git fetch origin main` and
  `git worktree add -b genobi/develop-<slug>-<id> .claude/worktrees/genobi-develop-<id> origin/main`
  (`server/development-worktree.ts`), recording the base commit; a failed fetch
  falls back to the last fetched `origin/main` and says so. The studio serves
  the main checkout live, so an edit there reaches the running app at once: a
  session's half-made edits in that checkout once broke the 3D tab for the
  person mid-session. Nothing the agent sends names a folder or branch.
- **No paid tools at all:** the Developer's Genobi tools carry the agent mark
  (`GENOBI_AGENT_SESSION=1`) with no grant, so every paid route refuses it and
  it cannot start another Developer. It does not inherit the creative
  session's budget, because there is nothing for it to spend.
- **Remote writes only in `pr` mode, only on the task branch:** in `change`
  mode the brief forbids commits and the plan allows none. In `pr` mode
  Claude Code may run only `git add`, `git commit`,
  `git push -u origin <that branch>` and `gh pr create` beyond the checks;
  Codex gets network only in `pr` mode. Never merge, deploy, push to main or
  force-push; the brief says so for every runner. Hermes and Codex rely on
  the brief and their sandbox for the push rule; Claude Code's allowlist
  enforces it.

The creative session reads the result with `genobi_develop {"id": …}` and
tells the person. This is the thin version: the two sessions do not talk to
each other live; there is no chat bridge between them.

## Routes

All are local only and need the studio's header, `X-Genobi-Agent: 1`, with a
loopback `Host`, an `Origin` (when sent) equal to the studio's, and
`Sec-Fetch-Site` (when sent) of `same-origin`. A page on another site cannot
add the header without a CORS preflight the server never grants
(`403 agent_cross_site`). Every route checks ownership by the studio session
cookie, as the other routes do; another session's id reads as not found.

| Route                                   | Answers                                                                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/agent/status`                 | `AgentRunnerStatus`: `available`, the runner's name and a fixed sentence. Never a path or a variable's value.                                                    |
| `POST /api/agent/sessions`              | `201 AgentSession` (body up to 24 kB). `400 agent_request`, `404` (copy not owned), `409 agent_busy`, `429`, `503 agent_unavailable`                             |
| `GET /api/agent/sessions/:id`           | `AgentSession`: status, prompt, lines, summary, and `approvals` when the agent quoted                                                                            |
| `POST /api/agent/sessions/:id/messages` | `202 AgentSession` with the message queued. `400 agent_request`, `404`, `409 agent_no_live_transport`, `agent_session_ended` or `agent_session_finishing`, `429` |
| `POST /api/agent/sessions/:id/stop`     | `AgentSession`, now stopping                                                                                                                                     |
| `POST …/:id/approvals/:quote/approve`   | `202 { session, job }`: the quoted run, once ([Confirm before spending](agent-approvals.md))                                                                     |
| `POST …/:id/approvals/:quote/decline`   | `AgentSession`, the step declined and its quote voided                                                                                                           |
| `GET /api/agent/ticket/:ticket`         | `303` to the studio with an agent's session cookie, or `404`                                                                                                     |
| `GET /api/agent/sign-in`                | Each harness: installed, signed in (`true`, `false` or `unknown`), and for Hermes `profile: "missing"`. Run fresh, `no-store`.                                   |
| `POST /api/agent/hermes-profile`        | `202` with the steps, or `400` with the reason before anything runs; `409` while one runs. Refused to an agent's session.                                        |
| `GET /api/agent/hermes-profile`         | `HermesProfileSetupState`: each step's outcome, `done` or `failed` with a fixed sentence                                                                         |
| `POST /api/development/agent`           | Only a running agent session's Genobi tools, without the studio header: `201 DevelopReceipt` ([above](#genobi-starts-a-developer))                               |
| `GET /api/development/agent/:id`        | The `DevelopReceipt` of a Developer this agent session started, or `404`                                                                                         |

Starts, messages, approvals and **Set up Hermes** count against the paid-write
rate limit (`submit`), Stop and Decline against `edit`, session reads against `poll`
and the status, sign-in and profile reads against `history`.

## The studio

`src/agent/` holds the client: `startAgentSession` and friends (`api.ts`),
`useAgentSession()` and `showAgentSession()` (`useAgentSession.ts`), and
`AgentSessionPanel`, mounted once in the shell. A caller (the voice overlay's
**Project prompt**) starts a session with `useAgentSession().start(request)`,
which opens the [Genobi bubble](agent-bubble.md) downward from the header mark. The
bubble moves no toolbar, hero or gallery; the owner polls while the session
runs, even when tucked away into its avatar. Its compact state shows the latest
received update or summary and **Stop session**; Activity expands the original
request and recent received lines. The displayed count is retained updates,
not completed tools. No state or count is inferred from the agent's narration.
Once a session holds a reply and a further message, the bubble shows the
conversation; a reply that arrives while it is tucked away marks the avatar.

## Set it up

Off unless configured, in setup or in the environment. [Agent setup](agent-setup.md)
covers setup's Connect step and its sign-in checks, Hermes' model list,
**Set up Hermes** from the studio, the saved runner setting, the environment
variables, and [Hermes' `genobi` profile](agent-setup.md#hermes).

## Verification

Local, 21 October 2026, Claude Code 2.1.306 on macOS:

- `tests/agent-request.test.ts`: request parsing and refusals, the status
  never naming a path, the command line, MCP config and environment, and the
  stream-JSON reader.
- `tests/agent-sessions.test.ts`: a fake runner (`tests/fixtures/agent/`)
  printing stream-JSON; the cross-site guard, ownership, one session per owner,
  Stop signalling only its own process group (the other session's process
  stays alive), the timeout, and the link code.
- `tests/agent-spend.test.ts`: each paid route refuses a ticket session and a
  marked request, and still serves the person; tickets are one use.
- One real session on `127.0.0.1:4317` with no provider key, prompt "Call
  genobi_status and report …, then open your browser ticket and report the page
  title": connected to both MCP servers, called `genobi_status` and
  `browser_navigate`, opened the ticket and read the title, and finished `done`
  in 14 seconds with no process left behind. Nothing paid was attempted.

Not yet run: a session that edits a linked Director project, the panel driven
by the voice overlay's Project prompt, or anything on Windows or Linux.

Hermes, local, 22 October 2026, Hermes Agent v0.21.4 on macOS, no model call:

- `tests/agent-hermes.test.ts`: settings and status (never a path), profile
  creation with Hermes' command, exactly the keys Genobi sets, re-applying only
  on a change, the plugin link, the command line and environment, the reader.
- `tests/agent-hermes-sessions.test.ts`: a fake Hermes
  (`tests/fixtures/agent/fake-hermes.mjs`): done, waiting on a paid refusal,
  failed, no sign-in, Stop reaching only its own groups, a SIGTERM-ignoring
  child in a session of its own ended on Stop, on a normal finish and on
  shutdown, a child orphaned the moment the runner exits found by the token
  alone (with the once-a-second look switched off) while a process with
  another token survives (the two normal-finish tests fail with the token
  switched off), the timeout, and the profile kept up to date for the studio.
- `tests/agent-reap.test.ts` (the token sweep) and
  `tests/agent-hermes-setup.test.ts` (the printed commands, default and other
  root).
- `tests/open-route.test.ts` (the allow and deny tables) and
  `tests/agent-hermes-open.test.ts`: the status sentence, no session and no
  Hermes process for a closed model or provider (the fake's profile is left
  untouched and the plan runs no command), the setup script refusing before
  it creates a profile, and the written config pinning the model and provider
  with both fallback keys empty, set again after `config.yaml` changes.
- `tests/agent-hermes-routes.test.ts`: every route pinned, the `config.yaml`
  check over block and flow YAML, and a profile pre-seeded with
  `auxiliary.compression` on Anthropic and a Codex `fallback_chain`: its routes
  are set again, and while the key is still there the session fails before
  Hermes runs a chat.
- The same scratch root pre-seeded with that compression route, a Codex
  vision route, an Anthropic `model_aliases` entry, an extra MoA preset and
  `delegation.provider: anthropic`, then `npm run agent:hermes-profile`: Hermes'
  own loader then gave all 22 auxiliary tasks on `nous` with
  `deepseek/deepseek-v4-pro` and no chain, an empty fallback chain, no aliases,
  delegation and cron inheriting, and one MoA preset on the pinned model. A
  second run left `config.yaml` unchanged. Setting every route takes about 16
  seconds, so a session start pays it only when the profile changed.
- `tests/agent-hermes-local.test.ts`: the local providers, a server's
  `name:tag` id on a local provider only, the endpoint kept for a local provider
  and checked, an Ollama profile whose session launches against the fake with
  its endpoint untouched, and `tts.provider: nous` refused. A second scratch
  root set up with `qwen3.5:4b` on `ollama`, then given
  `model.base_url http://127.0.0.1:11434/v1` and set up again, kept the
  endpoint; Hermes' own code then resolved `ollama` to `custom`, found the
  endpoint, left `qwen3.5:4b` unsplit with `--provider ollama`, and mapped
  `tts.provider: nous` to `openai`. With `tts.provider: nous` set, the setup
  refused, naming `tts.provider`.
- `tests/open-route-endpoints.test.ts` and `tests/agent-hermes-probe.test.ts`:
  an OpenAI or Anthropic host under `providers.proxy.api`, `url`, `endpoint`,
  a list, a flow mapping or the `.env`, mixed-case, trailing-dot and
  full-width hosts, all refused by key path; Ollama, LM Studio, a self-hosted
  vLLM and Nous' inference host pass; the route verdict before every session
  (closed, unresolved once signed in, open before the first sign-in), asked
  again each session.
- `tests/agent-hermes-probe-hermes.test.ts` runs the probe against this
  machine's Hermes in temporary profiles and HOMEs (skipped without Hermes, as
  in CI): the `${DOMAIN}` interpolation and a pool endpoint changed to OpenAI
  refused, a fresh Nous profile and Ollama open. `hermesPlan` with real Hermes
  in temporary roots (no chat): the interpolation case, a pool endpoint changed
  to OpenAI between two sessions, and a signed-in `zai` profile whose route
  does not resolve were refused, while the same scenarios all started on the
  previous commit (6b1845a); a fresh Nous profile and Ollama started on both.
  The probe took 0.4 to 1.1 seconds, and a session start with the profile
  already set about 0.37 seconds. `~/.hermes` kept its modification times.
- `tests/agent-hermes-probe-copy.test.ts`: the probe's copy is owner-only in
  the temp folder, points `HOME`, `HERMES_HOME` and the shared store at itself,
  leaves the real files byte-identical (modification time included) when the
  probe writes a cooldown or crashes, and is removed; a stale copy is swept.
  With real Hermes, an expired Nous sign-in probed on the previous commit
  (22dc68b) rewrote the profile's `auth.json` and created a shared store; now
  `auth.json` stays byte-identical, nothing is created, and no copy is left,
  in temporary profiles and on a scratch root (430 ms per probe). An
  interpolated `NOUS_INFERENCE_BASE_URL` (`https://api.${DOMAIN}/v1`,
  `DOMAIN=openai.com`) on an expired Nous sign-in is refused; 22dc68b let it
  through on the stored endpoint.
- After merging main again: `tests/open-route-endpoints.test.ts`,
  `tests/open-route.test.ts`, `tests/agent-hermes-probe.test.ts` and the real
  Hermes probe tests cover a TTS backend set through `${SPEECH_BACKEND}`
  (expanding to managed Nous) refused, vision failing over to OpenRouter when
  the profile holds an OpenRouter key refused (a failover onto the main
  route's own endpoint is not), and `Nous` canonicalised before the offline
  lookups. `hermesPlan` with real Hermes and the real pins: all three behaved
  the opposite way on the previous commit (c5ab85a): the TTS and vision
  cases started and `Nous` was refused; now the first two are refused and
  `Nous` starts, while lowercase `nous` and Ollama start on both.
- `npm run agent:hermes-profile` with `deepseek/deepseek-v4-pro` on `nous`
  against a scratch Hermes root (22 October 2026): Hermes' real `config set`
  wrote `fallback_providers: []` and `fallback_model: []`, its own loader gave
  an empty fallback chain and that model and provider, `fallback list` said none
  were configured, and reading the config left its hash unchanged. No model
  was called and nothing under `~/.hermes` changed.
- `npm run agent:hermes-profile` against a scratch Hermes root ran Hermes' real
  `profile create`, `plugins enable` and `config set`, twice (the second left
  `config.yaml` unchanged). Hermes' own loader then started `genobi` (10 tools)
  and `studio_browser` (16), showed the plugin's server disabled, listed the
  five plugin skills, and gave `-t mcp-genobi,mcp-studio_browser` exactly those
  26 tools, none of them built in and none `genobi_submit`. (Hermes v0.21.4
  takes the raw server names instead, `-t genobi,studio_browser`, and calls
  the prefixed ones unknown; `scripts/check-hermes-profile-toolsets.py`.) Hermes' own parser
  accepted the session's command line. Nothing under `~/.hermes` changed and no
  wrapper script was written.

A second message (Box 1.8), local, 28 October 2026, fakes only:

- `tests/agent-session-messages.test.ts`: the message's validation; a fake
  Claude Code reading `--input-format stream-json` answers the first turn,
  takes a second message as its next turn and answers it, the view's
  `exchange` growing in order; after the idle wait stdin closes and the
  session ends `done`, and a later message answers `agent_session_ended`;
  refusals (empty, too long, a bad source, another owner, a bad id, no
  studio header, an agent's request); `agent_no_live_transport` for a fake
  Hermes and a Terminal session, with nothing written; the real `launch`
  with a child that echoes stdin: one stream-JSON line per turn, stdin open
  until closed; the idle wait reset by a message, and a closed input answering
  `agent_session_finishing`.
- `tests/agent-send.test.ts`: the studio sends to the running session (also
  one found after a reload) and never starts another, starts one only when
  none runs or it has ended, copies to the clipboard for no live transport
  or a relayed session, and says a clipboard it could not write.
- Hermes, v0.21.4 on macOS, in a scratch `HERMES_HOME` (no model reached:
  the run's provider had no endpoint): `printf 'Say hi'; sleep 8; printf
'\nSecond turn\n'` piped into `hermes chat --query-file - --format
stream-json` printed its `system` event 8.5 seconds after it started, once
  stdin had closed, then one `result`, and exited. Hermes' source agrees:
  `--query-file -` is `sys.stdin.read()`, a non-TTY run is single-query, and
  `--format stream-json` without a query is refused. `hermes chat --continue
<name> --create-if-missing` (a new process per turn on a named thread) is
  the candidate transport; it was not tried, as it needs a model call.

Not yet run: a real Claude Code session taking a second message (a model
call on the person's subscription).

Setup without typing names or running scripts, local, 27 October 2026, fakes
only:

- `tests/hermes-profile-route.test.ts`: **Set up Hermes** through the route
  with a fake `hermes` on `PATH`, for the saved DeepSeek V4.1 Flash on Nous:
  four steps done, the pair pinned in the profile alone, the marker written,
  and the same configuration object's status no longer "not set up" (no
  restart); refusals before anything is created (no Hermes, a closed provider
  from the environment), `403` without the studio header and for an agent's
  session, `409` while one runs, the failed step with Hermes' fixed sentence,
  a file system error replaced by a sentence without a path, another session
  reading idle. Check again: each `GET /api/agent/sign-in` re-runs the probe
  with `Cache-Control: no-store`, a Hermes installed after the server started
  is found on the next read, and the page reads with `cache: "no-store"`.
- `tests/setup-connect.test.tsx`: the choices, every listed pair accepted by
  the server's open-route check, the default prefilled with Sign in enabled
  and no field to type, **Set up & sign in** with progress for a missing
  profile, "Checked just now". `tests/setup-agent-check.test.tsx`: the
  summary's **Set up Hermes** with no script or restart in the text, its
  progress and failure, and the harness's answer "checked just now".
  `tests/agent-hermes.test.ts` and `tests/agent-runner-setting.test.ts`: no
  status names the script or a restart, and only a missing profile carries
  `setup: "hermes-profile"`.

Not yet run: a Hermes chat, which calls a paid model, from the studio or from
`hermes -p genobi`; **Set up Hermes** and **Set up & sign in** against a real
Hermes install and a real Nous sign-in.
