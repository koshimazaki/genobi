---
tags: [agents, mcp, verification]
summary: Install and maintain separate Hermes Creative and Hermes Developer terminal profiles from versioned repository sources.
---

# Hermes Creative and Hermes Developer

Two native [Hermes profile distributions](https://hermes-agent.nousresearch.com/docs/user-guide/profile-distributions)
live under `profiles/`. They keep their own skills, memory, sessions and
configuration. They are terminal roles; the studio runner still uses its
separate `genobi` profile and its existing approval flow.

| Profile            | Responsibility                                                            | Tools enabled by its distribution                                |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `hermes-creative`  | Brief, scene, guidance, comparison, editable result; report tool failures | Genobi MCP, isolated studio browser, files, skills, memory, todo |
| `hermes-developer` | Reproduce failures, patch code/skills, verify and hand back retest steps  | The same tools plus terminal/process management                  |

Both carry a `SOUL.md` and a role skill. Creative can refine its own skills
but should hand application fixes to Developer. Developer can update either
role's repository source. These are working instructions, not an OS sandbox:
file tools and the developer terminal run with the user's permissions.

## Install

Requires Node 22+, an installed Hermes with profile distributions (checked
with v0.21.4), and this repository's dependencies. Build the MCP bundle first.
The model and provider are explicit; the example uses the open agent model
already named in the Genobi run guide. Installation makes no model call.

```sh
npm ci
npm run build:mcp
GENOBI_AGENT_HERMES_MODEL=deepseek/deepseek-v4.1-flash GENOBI_AGENT_HERMES_PROVIDER=nous npm run agent:hermes-roles
```

This installs both distributions with Hermes' own `profile install`, then
uses Genobi's existing setup to configure the plugin, filtered MCP server,
agent mark, isolated browser and open-model route pins with fallback off.
It copies no credentials and changes neither the default profile nor `genobi`.
An existing role causes a refusal before either role is installed. Do not use
the repository's distribution folders themselves as `HERMES_HOME`.

Optional settings are the same as the studio profile: `GENOBI_URL` (otherwise
loopback with `PORT`, default 4317), `GENOBI_AGENT_HERMES` (binary),
`GENOBI_AGENT_HERMES_ROOT` (root containing `profiles/`), and
`GENOBI_AGENT_BROWSER=off`. Use `-- --role creative` or `-- --role developer`
to install just one. For a local model provider, use the existing
[local endpoint setup](agent-setup.md#hermes); the route probe must pass
before the profile is considered ready.

Sign in through Hermes if needed, then launch from the intended checkout:

```sh
hermes -p hermes-creative auth add nous --type oauth
hermes -p hermes-developer auth add nous --type oauth
# Start the studio in another terminal: npm run dev
hermes -p hermes-creative
# From a separate development checkout when Creative is running:
hermes -p hermes-developer
```

For a custom root, prefix Hermes commands with `HERMES_HOME=<root>`; the setup
prints correctly quoted commands. Installation does not sign in, launch an
agent or spend credits. Chat model billing is separate from generation.

The MCP excludes `genobi_submit` and sends the agent mark. These terminal
sessions cannot approve paid steps; a terminal quote is not automatically
attached to the studio bubble. Use the person's studio for generation or
the existing [studio-started approval flow](agent-approvals.md). Neither role
may remove marks or use the developer terminal as a spending workaround.
The filter includes local frame, trim and concat tools. Their writers still
require sources the calling session can resolve; linking an Arena does not
turn its media hashes into session source IDs. Missing source access and
project attachment remain limitations to report, not bypass.

## Work together

The local studio's **Project Tools → Development** opens either role, or
both at once, in native Terminal windows on these profiles
([launcher](supervisor.md#development-launcher)), and can display an optional
supervisor and its connected agent names in the footer. See the
[supervisor protocol](supervisor.md). This is read-only presence, not editor
control or a paid-approval bridge.

Keep Creative on a fixed checkout/server while it generates. Developer uses
a separate checkout, test port and private app storage. Profiles isolate
Hermes state, not the filesystem, credentials, model caches or running app.
Only one active session should write a given profile at a time.

Creative records a private failure packet under `.local/hermes-handoffs/`:
goal, source SHA, sanitized reproduction, expected/observed result, evidence,
pending operations and resume point. Developer returns a scoped diff,
verification and retest steps. Transfer it through an operator-authorized
channel; the profiles do not automatically start or message each other.

A studio-started Genobi session can also start a Developer itself with
`genobi_develop` ([Genobi starts a Developer](agent-sessions.md#genobi-starts-a-developer)).
On Hermes it runs `hermes -p hermes-developer chat --oneshot` in a fresh
worktree from `origin/main`, with a brief that adds to this role: the worktree
and branch it must stay in, the person's words verbatim, the file hints, the
repository checks to run and report (format, lint, size, types, Worker
boundary, registry, tests), files at or under 500 lines, no commit in
`change` mode, commit plus a pull request against main in `pr` mode, and never
merge, deploy, push to main or spend. Its handover is what the creative
session reads back. A standalone `hermes-creative` terminal cannot start one
(`agent_nested`) and keeps writing failure packets.

The [studio watcher](hermes-runs.md#run-cards-and-logs) observes studio-started
sessions. It does not attach to these standalone terminal chats; use their
terminal/session history and saved artifacts for supervision.

## Update from Hermes or the repository

Hermes may improve installed skills with its own skill tools. Before a profile
update, compare useful edits with the sources in `profiles/hermes-creative/`
or `profiles/hermes-developer/`, remove private details and commit the reviewed
change. Bump that distribution's version. Installed files are copies, so
editing them does not silently change the repository.

After stopping the affected session, update its shipped role text and skills:

```sh
hermes profile update hermes-creative
hermes profile update hermes-developer
```

Hermes remembers the local source directory used during install. Updates read
that checkout; they do not pull this repository for you. They replace shipped
SOUL/skills, preserve separately added skills and keep local configuration,
auth, memory and sessions. Avoid `--force-config`: the source config contains
tool defaults, not the machine-specific MCP bindings and model pins.

For profiles installed before version 0.1.1, migrate the CLI tool selection
once after stopping the role. Hermes CLI reads `platform_toolsets.cli` and
uses configured MCP names without an `mcp-` prefix:

```sh
hermes -p hermes-creative config set platform_toolsets.cli '["genobi","studio_browser","file","skills","memory","todo"]'
hermes -p hermes-developer config set platform_toolsets.cli '["genobi","studio_browser","terminal","file","skills","memory","todo"]'
```

The old top-level `toolsets` value is ignored by CLI; native profile updates
preserve configuration, and the Genobi reconfigure command refreshes MCP
filters rather than this role-specific selection. Check the distribution
shapes and optionally Hermes' installed resolver with its Python environment:
`python scripts/check-hermes-profile-toolsets.py` (requires PyYAML).

To bind an existing role to this checkout, port or a different open model,
use the same model/provider variables and `npm run agent:hermes-roles --
--role developer --configure`. This requires an existing Genobi role marker,
refreshes tools/model pins and leaves SOUL/skills alone. It does not change
the distribution's recorded update source; keep that source checkout available.
Reconfigure only the stopped role; do not repoint Creative during a run.

Raw `hermes profile install profiles/hermes-creative` installs the role text
and defaults only. Use the npm setup for complete Genobi bindings. If initial
setup fails after native installation but before the Genobi marker is written,
inspect the new profile before removing/reinstalling it; the script never
deletes an existing profile to recover automatically.
