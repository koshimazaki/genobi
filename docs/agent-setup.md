---
tags: [agents, backend, setup, studio]
summary: Setting up local agent sessions — setup's Connect step (keys, harness sign-in that re-checks fresh, Hermes' open models as a list), Set up Hermes from the studio with no script or restart and plain sentences while it runs, Hermes signing in inside its own Terminal session window, the saved runner setting, the environment variables, and Hermes' genobi profile and open route.
---

# Agent setup

Part of [agent sessions](agent-sessions.md): how the studio is set up to start
one. What a session may do, the spending guard, the routes and the
verification record are on that page.

Off unless configured, in setup or in the environment.

**From setup.** The studio's setup has a Connect step: the provider keys, one
row per harness (Claude Code, Hermes, Codex) saying whether it is installed and
signed in, and a **Sign in** button that opens the harness's own login in macOS
Terminal (`claude auth login`, `codex login`, or
`hermes -p genobi auth add <provider>`, with `--type oauth` for `nous`).
Signed-in state comes from each harness's own read-only status command
(`claude auth status --json`, `codex login status`,
`hermes -p genobi auth list <provider>`), run by the local server with a
timeout and reduced to signed in, not signed in or unknown; its output is never
logged or shown. Each read runs the commands again (`Cache-Control: no-store`
on the route, `cache: "no-store"` in the page) after finding the harnesses
again, so **Check sign-in again** and the summary's **Check again** show a
fresh answer ("Hermes: signed in · checked just now") and a harness installed
since the server started counts without a restart.

**Open only and Local from setup.** Before the Connect step, setup asks which
creative models suit you (it preselects **Open models only** for a newcomer)
and where generation should happen. The studio reads those saved answers for
the model menu's two ticks: open models tick Open only, and **Local only**
ticks Local (the session's run location, written as Both) when the session has
not chosen a location itself. See [run location](run-location.md#where-it-is-set).

Hermes' model is a short list of open models from
[LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)
(`HERMES_CHOICES` in `shared/agent-runner-setting.ts`): **DeepSeek V4.1 Flash**
(`deepseek/deepseek-v4.1-flash` on `nous`, MIT, the pair the
[run guide](hermes-runs.md) uses) first and prefilled, then Qwen3-VL 235B A22B
on Nous (Apache-2.0), then **Other open model…**, which shows the model and
provider fields. Nothing has to be typed for Sign in. The list shows while
Hermes is the chosen agent or while the server holds no Hermes provider.

Hermes signs in inside the `genobi` profile, so the profile must exist first.
When it does not, the row's button reads **Set up & sign in**: it saves the
choice, sets the profile up from the studio (below), then opens Hermes' own
sign-in. The summary offers **Set up Hermes** in the same case, with the steps'
progress in place; no command and no restart.

**Set up Hermes.** `POST /api/agent/hermes-profile` (studio header, refused to
an agent's session, rate bucket `submit`) runs the profile setup in the server
process for the saved choice: the same module as `npm run agent:hermes-profile`
(`server/agent-hermes-profile-setup.ts`), Hermes' own commands through
`execFile` with argument arrays and no shell, the binary found as the runner
finds it. It refuses with the reason before anything runs (Hermes not found, no
Hermes root, an invalid name, a closed model or provider, no model chosen),
answers `409` while one runs, and otherwise reports four steps (check, create
the profile, add Genobi's plugin, tools and model, check the open route) on
`GET`, polled by the page. A failure names its step with a fixed sentence (a
file system error, which would name a path, becomes one); Hermes' output is
never kept or logged. When it is done the runner's configuration is read again,
and `GET /api/agent/status` reads it again before every status and start, so
the next session uses the profile without a restart; a missing profile is the
one status that carries `setup: "hermes-profile"`.

While the profile is set up the summary says what is happening in plain
sentences, one at a time under the steps: the welcome first, then
`HERMES_MESSAGES` (`shared/install-messages.ts`): what the `genobi` profile
holds, what a session is ("one conversation with your agent about the project
in front of you. The mic or a project prompt starts one."), that Hermes works
the project with the Genobi tools, that anything that costs money is quoted
first and waits for approval, where Hermes and its model run, and that nothing
needs a restart. The running step carries the studio's cli-spinners frame, the
deck's Rain runs faintly behind, and the intro video card appears only when
`GENOBI_INTRO_VIDEO_URL` is set. The profile setup reports steps, not bytes,
so no figure is shown. The wait itself is described with voice's
([while it installs](voice-setup.md#while-it-installs)).

On **Sign in** and on **Continue**, the harness is saved as a server setting.
Sign in saves the harness it opens, whichever of the three, before the
Terminal opens; Continue saves whenever a runner is known: the card chosen in
this visit, else the one saved before (`saveAndSignIn` and `saveOnContinue` in
`src/setup/SetupConnect.tsx`). The setting is
`.local/agent.json` (`{ "runner": "claude" | "hermes" | "codex" | null,
"hermesModel"?, "hermesProvider"? }`, written owner-only), through
`POST /api/settings/agent-runner` (`GET` reads it back; both need the studio's
same-origin header and refuse an agent's session). The server reads it at start
and applies a new choice at once, without a restart. Each environment variable
below, when set, wins over the file: with `GENOBI_AGENT_RUNNER` set, the saved
runner is kept for later but not used. Hermes' model and provider follow the
same rule and the same checks: an Anthropic or OpenAI one is refused before the
file is written. "Decide later" with nothing saved before writes nothing. Codex is recorded
but cannot run sessions yet, so with Codex chosen `GET /api/agent/status`
answers that the runner is not supported yet rather than starting anything;
Codex works with the Genobi plugin in its own terminal.

**Setup ends by starting the agent** ([flow](voice-setup.md#setup-ends-by-starting-the-agent)):
one session through `POST /api/agent/sessions` (typed, the setup choices as
context, `setup: true`), after voice connects when it was ticked. For
`setup: true` the server adds a **Setup just finished** block to the brief
from its own state (`shared/agent-setup.ts`, `server/agent-setup-facts.ts`):
the runner, its connected key slots by name, the voice model folder it is
configured with when that folder holds a model, and the licence stance and run
location from the validated context. `setup` accepts only `true`; the page
never sends or receives a folder or a key. It is local only: the relay refuses
`setup`, and a relayed start never gets the folder. The summary starts through
the spawn action below; it cannot choose a harness or open a sign-in itself,
so without a saved runner, or with the harness signed out, it fails with the
reason and never reaches "started".

## Spawn the agent

On the hosted studio, **Start Genobi** reads the paired runner status first.
Without an online runner, its dialog offers local setup and **Pair hosted and
local Genobi** directly. It does not probe local harness settings or sign-in
routes. An online paired runner starts in the bubble, without a local project
lookup or Terminal request; project files and paid approvals remain local.
Agent status, runner settings and sign-in reads have ten-second deadlines, so
an unavailable server cannot leave the initial check waiting indefinitely.

One client action, `spawnAgent` (`src/agent/spawn.ts`), starts Genobi
wherever the studio has no session to hand work to: setup's summary, the voice
panel's **Do it in a session**, the Genobi bubble's **Start Genobi** when no
session is shown, the Director's **Start an agent here** (JSON editor &
agent tools) and the Editor's **Regenerate**
([agent tools](director-agent-tools.md#regenerate-from-the-editor)). The studio's callers share one dialog (`spawn-store.ts`,
`SpawnAgentDialog.tsx`, mounted beside the bubble); no trip back through
setup. The bubble's start takes an optional typed **Brief** above it
(`startPrompt`, at most 3,000 characters, source `typed`): the first turn is
then the brief after "Link my open Director project if there is one", and
with nothing typed it is the fixed opening (`OPEN_PROJECT_PROMPT`), so a
session can start from words without a microphone. In order, against the
local server:

1. Read `GET /api/agent/status` and `GET /api/settings/agent-runner`.
2. No runner saved (or Codex, which cannot run sessions): a small chooser
   lists the three harnesses from `GET /api/agent/sign-in`, Hermes suggested
   when installed, otherwise Claude Code, Codex listed as not supported. Hermes
   keeps an open model from the same list as setup (DeepSeek V4.1 Flash on
   Nous by default). The pick is saved with `POST /api/settings/agent-runner`.
3. Hermes' `genobi` profile missing (`setup: "hermes-profile"`): the profile
   setup above runs, its steps shown in the dialog.
4. The harness says it is signed out. Hermes started in Terminal mode signs
   in inside its own session window (below): the dialog asks Terminal or
   bubble first, then shows "Signing in and starting in Terminal…" and waits
   on nothing. Otherwise (Claude Code, or Hermes in the bubble) its own
   sign-in opens in Terminal (once) and the dialog waits for **Check sign-in
   again**, showing setup's harness rows. Setup's Connect step keeps its
   **Sign in** buttons for signing in without starting.
5. The session starts with `POST /api/agent/sessions`, with the open Director
   project's owner copy (`copyId`), so the server mints its one-use link code
   for the brief.

With a session already running, voice's **Send to agent** does not spawn: the
words go to that session as its next message
([a second message](agent-sessions.md#a-second-message)).

**Two modes.** `mode: "terminal"` opens the harness in a Terminal window the
person watches and can type into; absent (`headless`), the session runs in the
bubble as before. `GET /api/agent/status` answers `terminal: true` when the
server can open one (macOS, with the development launcher mounted); the dialog
then asks **Open in Terminal** (the default) or **Run in the bubble instead**,
explaining each choice on its own line, and setup's summary offers the same
switch. The dialog sits inside the header's wordmark, which does not wrap, so
it wraps its own text; `scripts/check-spawn-dialog.mjs` checks it has no
sideways scroll at 1440 and 390 px. Elsewhere sessions are headless.
The hosted relay refuses `mode: "terminal"`.

The window is opened by the supervisor's launcher (`DevelopmentTerminal.openAgent`,
[supervisor](supervisor.md#development-launcher)) in the checkout:

- Claude Code: `claude --disallowedTools mcp__genobi__genobi_submit
--strict-mcp-config --mcp-config <file> --append-system-prompt <skill and
brief> --session-id <new uuid> <the person's words>`.
- Hermes: `hermes -p genobi chat --no-restore-cwd -m <model> --provider
<provider> -t genobi --ignore-rules --query-file <file>`, the profile brought
  up to date and its route checked open first, the skill and brief in
  `HERMES_EPHEMERAL_SYSTEM_PROMPT`. On a real TTY `--query-file` seeds the chat
  with the person's words rather than answering and exiting.

**Hermes signs in where it runs.** A Terminal start whose Hermes the studio
read as signed out sends `signIn: true` (`shared/agent-session.ts` accepts it
only with `mode: "terminal"`). The plan then carries Hermes' own sign-in for
the saved provider, the same arguments as setup's Sign in
(`hermes -p genobi auth add <provider>`, `--type oauth` for `nous`; the
provider a checked open name, one argument), and the launcher
(`scripts/development-terminal.mjs`) runs it in the session's window before
the chat, without a shell. `hermes auth add` is not idempotent in Hermes
0.21.4: each run adds a credential to the provider's pool (`--priority`
"appends last when omitted"), and for Nous it imports or starts another
device login (`hermes_cli/auth_commands.py`). So the launcher first runs the
read-only `hermes -p genobi auth list <provider>` and skips the sign-in when a
credential is listed; when that list cannot answer it signs in, since the
studio read signed out. A sign-in that fails or is abandoned writes a
`failed` receipt and the chat never starts. One that succeeds writes
`signed-in`, and the session adds "Hermes is signed in. The chat is
starting." to its lines; the studio's next sign-in read (each one runs the
status command again) shows the new state. Claude Code keeps its own login.

The brief is the headless one without a browser, with the project's link code,
plus a note that the session stays open for the person's next message
(`server/agent-terminal.ts`). No key or token is on a command line or in the
brief. The studio still follows the session: it registers a session with a new
grant, and only the window's Genobi MCP server holds it (Claude Code's
owner-only MCP config file; for Hermes the plan's environment, which the
profile passes on as `GENOBI_AGENT_RUN`). Its requests carry
`X-Genobi-Agent-Run`, so its quotes become this session's approvals in the
bubble, exactly as a headless session's do, and it is still an agent's session
that cannot spend. The session reads as running until the launcher's receipt
says the harness exited (done, or waiting on a quoted step; failed for a
non-zero exit). Closing the window counts: the launcher writes "closed" when
the window's process group is hung up (`SIGHUP`). The receipt also removes the
session's private folder. **Stop** stops following the window, whose grant
then no longer reaches the session, and deletes the files holding the grant,
plan and prompt; the folder stays for the receipt and goes when it arrives,
and the window stays open until the person closes it. At start the server
sweeps `agent-*` folders whose receipt says closed or failed (a window closed
while it was down); folders without a receipt are windows still open and stay.
There is no time limit.

A Terminal session outlives the page. After a reload (the wordmark's included)
`GET /api/agent/sessions` answers the owner's running session, so the bubble
follows it and its approvals again. A start refused with `agent_busy` names
that session (`sessionId`); the spawn action shows it in the bubble and says
so. A start whose runner could not begin (the route answers 201 with
`failed`) is reported with its reason, never as started.

Claude Code in Terminal runs in the checkout with the person's own settings,
and its first turn and brief are on its command line, link code included.
That is deliberate: the code is one-use and ten minutes long, and no key or
grant is ever there.

The gallery's spawn (Box 2.2) will call the same action.

**From the environment.** Variables read when the server starts:

| Variable                       | Meaning                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `GENOBI_AGENT_RUNNER`          | `claude` (Claude Code) or `hermes` (Hermes in its `genobi` profile); wins over setup's choice.    |
| `GENOBI_AGENT_CLAUDE`          | Claude Code's binary, when it is not on `PATH` or in `~/.local/bin`.                              |
| `GENOBI_AGENT_HERMES`          | Hermes' binary, when it is not on `PATH` or in `~/.local/bin`.                                    |
| `GENOBI_AGENT_HERMES_MODEL`    | Required for Hermes: the open model each session runs (`-m`), such as `deepseek/deepseek-v4-pro`. |
| `GENOBI_AGENT_HERMES_PROVIDER` | Required for Hermes: the provider for that model (`--provider`), such as `nous`. Never `auto`.    |
| `GENOBI_AGENT_HERMES_ROOT`     | The Hermes root that holds `profiles/genobi`; `~/.hermes` by default.                             |
| `GENOBI_AGENT_NPX`             | `npx` for the browser, when it is not on `PATH`.                                                  |
| `GENOBI_AGENT_BROWSER`         | `off` runs sessions without a browser.                                                            |
| `GENOBI_AGENT_TIMEOUT_MINUTES` | 1 to 120; 15 by default.                                                                          |

No model is built in: with `GENOBI_AGENT_RUNNER=hermes` and no
`GENOBI_AGENT_HERMES_MODEL` or `GENOBI_AGENT_HERMES_PROVIDER`, the status route
says to set it and no session starts. An Anthropic or OpenAI model or provider
is refused the same way ([the open route](hermes-open-route.md)). The status route
answers `available`, the runner's name and a fixed sentence; never a path or a
variable's value.

The binary is found on `PATH` the way `command -v` would, without a shell, so
an interactive shell's `claude` function is never what runs. Build the MCP
server once with `npm run build:mcp`. The browser needs Google Chrome (the
Playwright MCP default); `npx` fetches the pinned package on first use.

```sh
GENOBI_AGENT_RUNNER=claude PORT=4317 npm run dev
```

**Test from a worktree of your own.** A session started from the studio runs
in the checkout the server runs from, and so do other agents' edits. When
`npm run dev` serves a checkout that other sessions edit, Vite full-reloads the
page whenever they change a file it cannot hot-swap. The studio saves the
Director's project copy before such a reload and does not ask when it is
saved ([the leave guard](director-bundle/README.md#project-copy-and-director-commands)),
but the page still reloads under you. Run the server you test with from a
separate `git worktree` that nobody else edits.

**While a session runs**, what the person says by voice goes to it as their
next message, not into the prompt on screen ([voice mode](voice-mode.md#to-a-running-session)).

## Hermes

Hermes reads MCP servers and their tool filters only from its home's
`config.yaml`. A Hermes **profile** is a home of its own,
`~/.hermes/profiles/<name>`, with its own config, `.env`, sign-in, skills,
plugins, memory and sessions; `hermes -p <name>` (or `--profile`) runs Hermes
in it by setting `HERMES_HOME` to that folder (Hermes docs,
`user-guide/profiles.md`, "How it works"; `hermes profile --help`; the
`HERMES_HOME` row of `reference/environment-variables.md`). So Genobi uses a
profile named **`genobi`**, and leaves the default profile (`~/.hermes`
itself) and every other profile alone.

**Set it up once** (Hermes Agent v0.21.4 checked). From setup, **Set up
Hermes** (above) does this. From a terminal, the same code:

```sh
npm run build:mcp
GENOBI_AGENT_HERMES_MODEL=deepseek/deepseek-v4.1-flash \
GENOBI_AGENT_HERMES_PROVIDER=nous npm run agent:hermes-profile
hermes -p genobi auth add nous --type oauth   # Hermes' own sign-in, once
```

The two variables can be left out when setup's Connect step saved Hermes'
model and provider: the script reads `.local/agent.json` the way the server
does (each variable, when set, still wins; `GENOBI_AGENT_SETTINGS_DIR` names
another `.local`). It refuses to run without both, and refuses an Anthropic or
OpenAI model or provider before it creates or changes anything.

With `GENOBI_AGENT_HERMES_ROOT` set to a root other than `~/.hermes`, Hermes
finds the profile only with `HERMES_HOME=<root>` set (Hermes' override for its
config folder; `HERMES_HOME=<root> hermes -p genobi config path` gives
`<root>/profiles/genobi/config.yaml`). The setup prints every follow-up command
that way, and the studio example keeps `GENOBI_AGENT_HERMES_ROOT`. Likewise,
when the setup found Hermes through `GENOBI_AGENT_HERMES` rather than as the
first `hermes` on `PATH`, it prints that executable (quoted) in each Hermes
command and keeps `GENOBI_AGENT_HERMES` in the studio example.

`npm run agent:hermes-profile` (`scripts/setup-hermes-profile.ts`, over
`server/agent-hermes-profile-setup.ts`) and **Set up Hermes** are safe to run
again. It creates the profile only when it is missing, with Hermes' own
`hermes profile create genobi --no-alias --no-skills` (no wrapper script in
`~/.local/bin`, no bundled skills), then sets only these keys, in that profile,
with `hermes -p genobi plugins enable genobi` and `hermes -p genobi config set`:

- `plugins/genobi` in the profile links to this checkout's `plugins/genobi`,
  and the plugin is enabled, so the profile has its five skills.
- `mcp_servers.genobi`: the Genobi MCP server with `GENOBI_URL` (the studio:
  `GENOBI_URL`, else `http://127.0.0.1:$PORT`, 4317 by default),
  `GENOBI_AGENT_SESSION=1` (every request agent-marked) and
  `tools.include` listing the Genobi tools of [agent sessions](agent-sessions.md#what-the-agent-may-do) (`GENOBI_TOOLS` in
  `server/agent-runner.ts`), without `genobi_submit`
  (`user-guide/features/mcp.md`, "Per-server filtering").
- The plugin's own MCP server, which Hermes names
  `agent-plugin-genobi-d52362ad__genobi` and which has no filter, is set to
  `enabled: false`: a `config.yaml` server of the same name replaces a
  plugin's. Its skills stay.
- `mcp_servers.studio_browser`: the isolated browser with the look-and-click
  tools of [agent sessions](agent-sessions.md#its-own-browser), its marked config and output in the profile's
  `genobi-browser/` folder (off when there is no `npx` or the browser is off).
  Not `browser`, which is a built-in toolset's name.
- `tools.tool_search.enabled: off`, so the tools stay themselves rather than
  sitting behind Hermes' `tool_call` bridge.
- Every model route Hermes has, pinned to the two variables with every
  fallback chain empty (`server/agent-hermes-pins.ts`,
  [the open route](hermes-open-route.md#every-route-pinned)).

Genobi records what it set in the profile's `genobi-profile.json`, including
both tool allowlists (`GENOBI_TOOLS`, `BROWSER_TOOLS`) and a hash of the
profile's `config.yaml` as it left it; the status route answers "not set up"
until that file exists. The studio's runner applies the same keys again before
a session when they differ (another port, a moved checkout, a tool added to or
removed from either list) or when `config.yaml` changed since (a
`hermes -p genobi fallback add`, a persisted model switch), so the pins hold,
and leaves an unchanged profile as it is. Genobi never reads, copies or writes a credential: sign-in is
Hermes' `auth add` in that profile (for Nous it can reuse an existing Nous
login through Hermes' shared sign-in, which is Hermes' own behaviour).

**Two ways in, one profile:**

- **From the studio.** `GENOBI_AGENT_RUNNER=hermes` and the model variable, then
  the Project prompt (typed or spoken). The server runs
  `hermes chat --query-file - --oneshot --format stream-json -m <model>
--provider <provider> -t genobi,studio_browser --ignore-rules
--source tool --run-budget <seconds>` with `HERMES_HOME` set to the profile,
  in a scratch folder. `-t` enables those two MCP toolsets and nothing else, so
  no terminal, file, web, memory or skill tools; `--ignore-rules` skips
  `AGENTS.md`, `SOUL.md` and memory; the `genobi-studio` skill and the brief go
  in `HERMES_EPHEMERAL_SYSTEM_PROMPT`, which Hermes adds at call time and never
  saves; `--run-budget` warns the agent at 80% of the timeout. Hermes'
  stream-JSON (`system`, `text`, `tool_use`, `tool_result`, `result`) is read
  into the same lines and endings as Claude Code's
  (`server/agent-hermes-stream.ts`).
- **From a terminal.** `hermes -p genobi`, with the studio running. The same
  plugin skills, the same Genobi server, the same tool filter and agent mark.
  Hermes' own built-in tools are whatever that profile enables; the spending
  guard still holds, because the server has no `genobi_submit` and every request
  is marked.

## The open route

Hermes is Genobi's open-source route: it runs open-weight models only, never an
Anthropic or OpenAI model or provider. [The Hermes open route](hermes-open-route.md)
has the deny lists and their sources, every Hermes route the profile pins, local
model servers such as Ollama, and why there is no fallback.
