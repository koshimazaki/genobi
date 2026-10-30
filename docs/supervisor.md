---
tags: [agents, studio]
summary: Launch local development sessions or connect an external supervisor viewer.
---

# Local agent supervisor

In the local studio, open **Project Tools → Development**. The compact header
selects Hermes, Claude Code or Codex, the **Role** (Developer, Creative, or
Developer + Creative) and a fresh or previous conversation. **Start fresh**
opens an interactive macOS Terminal window per role, Developer first. Give
each its task and reply in that harness; there is no embedded terminal or
task form in Genobi, and the two windows do not start or message each other:
the person relays briefs and failure packets between them.
The existing Genobi activity bubble remains available for studio-agent activity,
and the footer [deck](genobi-deck.md) names linked supervisor agents with a
link back to Development.

**Agent supervisor** is a collapsible, read-only live viewer. Starting a native
session starts the bundled Hermes viewer if needed and links this view automatically.
**Reconnect view** reloads the connection, while **Hermes live sessions ↗** opens
it separately. The viewer reports Hermes Developer and Creative/Genobi profiles;
Claude Code and Codex conversations remain in their own native terminals.

Starting a native session or clicking **Link view** connects the viewer. Its loopback origin is remembered in this browser
tab's session storage so reloading can reconnect. Disconnect removes it.
It accepts a separate HTTP loopback origin only. The iframe has no editing,
generation or approval authority. Disconnecting the view does not stop an
agent or cancel a submitted generation. Other browsers and projects do not
automatically share their navigation or assets.

## Run the bundled Hermes viewer

Requires Python 3 and locally installed `hermes-developer` and
`hermes-creative` profiles. From this checkout run:

```sh
npm run supervisor
```

Open `http://127.0.0.1:4329` or connect that address in Development. The
viewer reads each profile's latest saved session without changing it. Pin a
specific session with `--developer-session ID` or `--creative-session ID`;
use `npm run supervisor -- --help` for a custom Hermes root, viewer port or
studio origin. Only loopback studio origins are accepted. An agent's isolated
browser remains restricted to the studio; it need not access the supervisor.

Messages and tool names refresh every two seconds. Tool arguments, raw
results and reasoning fields are omitted; common credential patterns and URL
queries are redacted. This is a local conversation viewer, not a public log
export. “Process running” reports a matching profile process, not proof of
active work or ownership of the editor. The viewer cannot send prompts or
start agents; use their terminals for that. Development names the connected
viewer address; opening it in another tab shows the same local service.
With **Follow latest** enabled, both feeds return to the bottom when hidden
Development becomes visible and when tool visibility changes. Disable Follow
latest to read older messages without automatic repositioning.

An optional `--ledger PATH` displays a private JSON ledger with `maximum`,
`confirmedSpend`, `reserved` and `uncertain` credit amounts. It does not
charge, approve, reserve or enforce that budget. Without a ledger the viewer
says “Budget not configured”. Keep session logs and ledgers outside Git.

## Viewer protocol

The parent sends `genobi.supervisor.subscribe` with a fresh UUID `channel`
to the selected iframe origin. The viewer replies with a
`genobi.supervisor.snapshot` containing the same channel and at most eight
actors. See `shared/supervisor.ts` for bounded identity, model, state and
summary fields. No commands or control claims are accepted.

The studio verifies the exact iframe window, selected origin, channel and
schema on every reply. An external viewer must independently allow the
parent's exact studio origin before replying and permit that origin in its
`frame-ancestors` policy. Missing heartbeats clear live presence after ten
seconds. No connection credentials are stored by the studio.

Subscription messages include an optional `theme` map of resolved studio
color tokens. The studio sends changes immediately and with each heartbeat.
The viewer should accept only its known token names with valid color values.

This reports external presence separately from native studio sessions and
generation jobs. `connected` does not imply an agent is busy or owns the
editor. Live project following and acknowledged control handover are not
implemented by this viewer protocol.

## Development launcher

The local server opens a private `.command` file with macOS Terminal. A small
Node launcher gives the harness a real TTY with inherited input/output. There
is no one-shot mode, automatic user task, captured transcript or permission
bypass. The installed harness keeps its login and interactive permission prompts.
The role brief is supplied as Hermes's ephemeral system prompt, Claude
Code's appended system prompt, or Codex's developer instructions. The
Developer brief is the supervisor role: Developer and Creative/Genobi
responsibilities, repository guidance, handovers and explicit authorization
for paid generation and publication. The Creative brief is the studio
operator: scene, guidance, reviewed takes and an editable result through the
Genobi tools, quotes approved in the person's studio, failure packets under
`.local/hermes-handoffs/` for Developer. When both open, each brief names the
other window; neither may start, stop or message it.

Hermes uses the existing **hermes-developer** and **hermes-creative**
profiles; the chosen roles' profiles must already be installed and configured
([profiles](hermes-profiles.md)), and the Role menu disables a role whose
profile is missing. Fresh Hermes sessions receive a unique conversation name
(`genobi-supervisor-…` or `genobi-creative-…`). Each receipt keeps its role,
so a conversation resumes in the profile it was opened with; receipts written
before roles existed count as Developer, and a receipt whose role is not one
of the two is read as Developer too. The Creative profile's tool limits apply
on Hermes only; on Claude Code and Codex the Creative role is its brief, with
the harness's own shell and edit tools. Claude Code receives a fresh native UUID.
After a clean exit, either appears in the Session menu and can be resumed by
the same browser owner. Codex uses its native resume picker; **Choose in terminal…**
also opens Claude Code's picker. Hermes's `/sessions` can locate older sessions
that were opened outside this launcher. A receipt marked **opened** means the
terminal-open request succeeded, not that a model is running or a task completed.

**Previous handover** is optional context, collapsed beneath the header. Paste
it and enable **Include this context** when needed. It does not import native
conversation history or authorize actions. There is no duplicate last-handover
panel or output log.

Native windows belong to the user: closing Development or restarting the server
does not stop them. Exit the harness in Terminal before resuming its conversation.
The launcher refuses to resume an entry without a clean exit receipt. It does not
claim to track unrelated terminal sessions. New launches are serialized; an
uncertain launch is never retried automatically. Non-macOS hosts currently show
that native launching is unavailable rather than starting a headless substitute.

The same launcher opens Genobi's own agent sessions in Terminal
(`DevelopmentTerminal.openAgent`, [spawn the agent](agent-setup.md#spawn-the-agent)):
`hermes -p genobi chat` or `claude` with the Genobi brief, in
`.local/development-terminals/agent-<session id>/` beside the plan, with
owner-only files the plan names (Claude Code's MCP config, Hermes' first
message). The launcher drops any `GENOBI_AGENT_RUN` inherited from the shell
and passes on only one the plan sets: a Genobi session's grant, which ties the
window's quotes to its approvals in the studio. Supervisor plans set none.
These sessions leave no Session-menu receipt; the studio follows them as agent
sessions instead, and clears their folder when the receipt arrives.

Closing a Terminal window hangs up its process group (`SIGHUP`). The launcher
then writes a "closed" receipt at once and passes the hang-up to the harness,
so a closed window always leaves a receipt, for supervisor and Genobi
sessions alike.

Private plans, owner hashes and launch/exit receipts live under
`.local/development-terminals/` with restricted permissions. The Session menu
retains the latest forty receipts, scoped to the originating studio cookie.
Plans contain role/optional handover text and paths, never provider keys.
The harness's own history remains the source of conversation transcripts.

`GET/POST /api/development/terminal` requires the same-origin studio header and
rejects agent-marked callers. Browser input cannot choose executables, working
directories, native IDs, permission flags or arbitrary viewer destinations.
The viewer uses the fixed loopback port 4329 and never replaces an existing
listener. If it cannot start, the opened terminal remains successful and the UI
can reconnect after the service becomes available. A viewer started by Genobi
stops with the server; a pre-existing viewer is left alone.

### Restarting the local server

`npm run dev` runs `scripts/dev-server.mjs`, which starts the server and starts
it again when it exits with code 75. When files under `server/`, `shared/` or
`scripts/development-terminal.mjs` are newer than the running process (an
agent commit or a pull), Development shows **Restart local server**. It shuts
down the way Ctrl-C does, the supervisor starts the current code, and the page
reloads when `/api/health` answers. Native terminals are not the server's
children and stay open; recorded jobs resume polling; studio agent sessions
and headless development runs stop with the process; the studio cookie, and
with it the Session menu's receipts, is unchanged. While a submission is still
being sent (a job in `submitting`, before the provider has answered with an
id), the restart is refused with `restart_busy`: exiting then would record
that job as an error with no provider id although the provider may already
have accepted and charged it. A server started without the supervisor
(`npm start`, `tsx server/index.ts`) reports the change but refuses the
restart (`restart_manual`). A server older than this feature has no restart
route, so it must be restarted in its terminal once.

`GET /api/development/server` and `POST /api/development/server/restart` share
the development boundary: same-origin studio header, no agent-marked callers.

The earlier managed, one-shot `/api/development` endpoints remain for existing
receipts and compatibility, and run the Developer a creative Genobi session
starts (below); the Development UI no longer starts them itself. Their
owner checks, Stop handling and shutdown recovery remain unchanged. Hosted
studios do not expose either development launcher.

## Developers started by Genobi

A studio-started Genobi session may start one managed Developer with
`genobi_develop` ([the route and its rules](agent-sessions.md#genobi-starts-a-developer)).
It runs headless, with the runner the person saved in setup (Hermes in its
`hermes-developer` profile), in a fresh worktree under
`.claude/worktrees/genobi-develop-<id>/` on a `genobi/develop-<slug>-<id>`
branch made from `origin/main`. The main checkout, which the studio serves
live, is never its working directory, so a half-made change cannot break the
running studio. Development shows each such session above the supervisor:
"Started by Genobi for: <task>", runner, status, mode (diff only, or commit +
PR), branch, the pull request once the Developer prints one, its last lines or
handover, and **Stop Developer** while it runs. The Hermes live viewer
reports the `hermes-developer` profile's latest session, which is this one
while it runs. Worktrees are left in place for review; remove one with
`git worktree remove` after its branch is merged or dropped.
