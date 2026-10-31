---
tags: [agents, mcp, backend]
summary: Terminal access to the MCP tool contract, persistent private connection profiles, shared Taste and Dual Swords commands.
---

# Genobi CLI

The CLI calls the same `ToolDefinition.run` functions and Zod inputs as MCP,
through the same loopback-only `GenobiApi`. It does not duplicate generation,
Director, memory or ffmpeg logic. Each invocation returns one result; nothing
polls or retries automatically. It needs Node 22 or later.

## Start and discover

From the repository, build the two bundled agent entry points:

```sh
npm run build:mcp
node plugins/genobi/server/genobi-cli.mjs help
node plugins/genobi/server/genobi-cli.mjs tools
node plugins/genobi/server/genobi-cli.mjs schema context
```

The package declares a `genobi` executable. If you want it on your PATH, run
`npm link` from this checkout after building. Alternatively keep using the Node
entry point, or `npm run --silent genobi -- status` during development. Start the
local studio separately with `npm run dev` when API commands need it. Discovery,
skills, model catalogue and scene transformations work without a running studio.

`genobi capabilities` prints the plugin's capability map offline: every
feature with where it is, how it runs (free and local, a local model, Comfy
Cloud or a paid API), its models, commands, skills, docs and status
([the capability map](capabilities.md)).

Each MCP tool has a command: `genobi_session_checkpoint` is
`genobi session-checkpoint`, `genobi session checkpoint`, or
`genobi call genobi_session_checkpoint`. `tools` returns command names,
descriptions, paid/read-only annotations and exact JSON schemas. `schema COMMAND`
returns one entry. The command set grows automatically when a tool is added;
coverage tests require every exposed tool to have an existing teaching skill.

Use `--input @request.json`, `--input -` for stdin, or inline JSON (24 MiB maximum).
Results are JSON on stdout. Errors are `{ "error": { "code", "message", … } }`
on stderr with exit code 1. Only general help is plain text. Unknown fields,
invalid inputs, unknown options and unavailable commands fail before any API
request. Do not put provider credentials in input or profile files.

## Named connection and model profiles

```sh
genobi profile set open-local --input '{"selection":{"weights":"open-weights","execution":"local","agent":"hermes"}}'
genobi profile set subscription --input '{"selection":{"agent":"codex"}}'
genobi profile use subscription
genobi profile show
genobi models --input '{"status":"ready"}'
```

`profile schema` describes the accepted configuration. A profile contains a
loopback `url` and the existing independent model `selection` fields: family,
weights, local/cloud execution and preferred agent host. Explicit model-query
selection fields override profile defaults. Read linked project context before
choosing inputs; current instructions and project guidance outrank defaults.
Filtering is static capability matching, not proof of installed weights,
credentials or licence clearance. It never changes the studio's run location,
starts an agent or installs models. Hermes' existing isolated installer remains
`npm run agent:hermes-profile`; see [the open route](hermes-open-route.md).
Codex and Claude Code remain external harnesses; these profiles do not change
their subscription, model or permissions.

Profile choice is `--profile` → `GENOBI_PROFILE` → saved active → `default`.
URL choice is `--url` → `GENOBI_URL` → profile URL. Remote URLs, credentials,
query strings and fragments are refused. The HTTP client refuses redirects.

Private state lives in `GENOBI_CONFIG_DIR`, otherwise
`$XDG_CONFIG_HOME/genobi` or `~/.config/genobi`, with directory 0700 and files 0600 (macOS/Linux owner permissions). Broad permissions and symlinked files are refused. Safe profile listings
never include the session identity. A complete random session identity is
published atomically before an HTTP request, so concurrent first calls share
one identity. It is scoped to profile name, origin, agent mark and grant digest;
the grant itself is never stored. Changing origin/profile/mode/grant changes
ownership. Keep the same settings to recover an uncertain submission.

MCP retains its existing process-local session by default. Set `GENOBI_PROFILE`
in its environment to explicitly share the terminal's profile, config directory
and session. Agent mode/grant must match too. Neither transport automatically
shares the browser's owner session: redeem the owner's project link code with
`genobi link-project`. CLI identities are capabilities; do not export their
files or delete them while recovering a run. No provider key is saved here.

## Project memory and Taste

```sh
genobi skill --input '{"name":"genobi-taste"}'
genobi schema link-project
genobi context --input '{"copyId":"PROJECT_COPY","medium":"video","useCase":"teaser"}'
genobi schema decision
genobi schema session-checkpoint
genobi schema taste
```

Follow [shared project memory](taste-memory.md). The CLI exposes the existing
context, interpretation, reference, checkpoint and scoped proposal tools. It
adds no private terminal learning store. After actual use, an agent can base its
next suggestion on accepted examples and explicit corrections, record evidence
and propose a reusable preference. Activation remains an owner action. Reruns,
Undo and technical failures do not imply disliked style. Preferences guide
starting choices; this does not retrain a model or guarantee a prediction.

## Dual Swords and paid calls

`genobi swords probe`, `frames`, `trim`, `concat`, `crossfade`, `space` and `tools`
are aliases of the corresponding `media-*` tools. Read the input schema and
load `genobi-swords` first. They operate on sources in the session, on the local
studio with ffmpeg/ffprobe. Derived files are new sources. A video or audio
result goes into a linked project with `genobi take-to-project` and `sourceId` in
place of `id` (`genobi schema take-to-project` shows exactly one of the two). They
do not manipulate the browser's Dual Swords timeline or generate again from a
frame by ID; those remain #14 work.

## World takes into a project

A World take is neither a job nor a session source, so `take-to-project` and
`media-probe` refuse its id. Send it from the paired World tab instead, which
re-encodes it to MP4 as the take card's Send to Director does:

```sh
genobi world --input '{"action":"command","session":"SESSION_UUID","command":{"op":"send-to-project","take":"fall-wide"}}'
```

Read `result` until `done`; it gives the frame's, the video's and any audio's
`assetId`, and `genobi project` lists them with the take's name as `label`.
`recipe` reads the current recipe back and `load-preset` takes a move-library
file name (`fall-cathedral`). The CLI says it is the CLI on every request
(`X-Genobi-Client: cli`), so a World Builder hand-off it sends reports
`from: "cli"`. See [Live World sessions](world-live.md#send-a-take-to-the-project).

## Quotes and submission

`genobi quote` never generates. `genobi submit` requires its quote, matching
inputs, an idempotency key and `--confirm` after the person accepts the shown
price. The flag is not an authentication or human-approval mechanism. An uncertain
outcome returns `outcome_unknown`: read jobs first and follow the recovery
instructions, retaining the same key. No automatic retry is made.

## Project references, deployments and voice

`genobi status` includes the running adapter's capability manifest, with supported
operations, status routes and limits. This is separate from the offline
`genobi capabilities` catalogue. An older server can omit runtime capabilities;
that omission does not establish support. The CLI and stdio MCP transport connect
only to a loopback local server. Hosted REST capabilities do not imply that the
CLI can sign in to a remote hosted studio.

`genobi project` returns the complete bounded `brief` including reference labels
and asset IDs, plus each asset's bundle-relative file path and hash. For image
generation, put ordered `projectImageReferences: [{copyId, assetId}]` in the quote
and submit input. The adapter reads those files through the project's authorized
routes, verifies their hashes and image types, and supplies the bytes internally.
Do not mix this form with inline `imageReferences`. Reusing the IDs after the
owner changes an asset invalidates an older quote. Source-conditioned open Klein
uses `imageAspectRatio: "auto"` and derives its shape from the source image.

For a registered Comfy deployment, load `genobi-comfy` and inspect these schemas:

```sh
genobi schema run-location
genobi schema deployment-stage
genobi schema quote
```

An external agent can register `location: "deployment"` with `deploymentUrl`.
`deployment-stage` accepts exactly one local `filePath`, linked `projectAsset`,
or paired `worldFile`, plus the manifest's token and matching media content type.
It returns a two-hour session/endpoint-bound ticket. Put the tickets in
`deploy.assets`, along with `deploy.seed`, `deploy.negativePrompt` and the capture
recipe when required. Quote the complete input, disclose the returned GPU-time
billing, then submit only after agreement. The model catalogue exposes both
deployment models with `inputModel` and `requiresDeployment`; installation and
credentials are checked by the server. See [run location](run-location.md).

`genobi voice-status` reads local speech-to-text readiness.
`genobi voice-transcribe` accepts exactly one local `filePath`, session audio
`sourceId`, or linked audio `projectAsset`, and an optional supported `language`.
Readiness, media bytes and duration are checked before transcription. It returns
text for review, without executing the transcript, installing a model or making a
generation. Studio-started agents must use scoped assets/sources for voice and
scoped assets/World files for deployment staging; their local-path variants are
refused. See [voice mode](voice-mode.md).

`genobi job` and `genobi take` list separate deployment audio in `outputs`.
To import one, use `take-to-project` with the job `id` and the chosen output's
`assetId` as `outputId`. Omitting `outputId` imports the primary result. The server
checks job membership and source ownership before copying the media.

### Takes appear in the studio

A take you submit from the terminal shows in the studio's gallery once it is
Ready, without opening the app first (local server only, 29 October 2026).
The CLI sends `X-Genobi-Client: cli` and the MCP server `X-Genobi-Client: mcp`,
so the server records the run's `origin` (`terminal` or `agent`); the
studio's `GET /api/history` then lists that take beside its own, with
`shared: true`, and the card says **From terminal** or **From agent**. Direct
job reads keep that flag too, including a selected take outside the history
window. History keeps the newest fifty of the studio's own jobs and up to
fifty shared takes separately, so terminal activity cannot displace the
studio's running jobs. The
studio may play it, read its take for Recreate, upscale it and copy it into
the open project with **Send to Director** (+); a song arrives as an audio
asset. Only Ready takes are listed, so the page never polls a run it did not
start. Everything else stays per session: the CLI's own history lists its own
runs only, its quotes, budget and spending are its own, two studio sessions
still see nothing of each other, and an agent-marked request (`GENOBI_AGENT_SESSION=1`)
neither spends nor reads another session's takes
(`server/shared-takes.ts`). The hosted Worker shares nothing between visitors.

`GENOBI_AGENT_SESSION=1` uses the same runner allowlist as studio-started agents;
`GENOBI_AGENT_RUN` is forwarded unchanged when valid. No profile or flag removes
that mark. Submit and media writers outside that allowlist are unavailable.
The server's existing spending and ownership checks remain authoritative.

Verification covers real local HTTP routes with a fake provider, separate
terminal processes, quote ownership/replay, uncertain response recovery,
profile isolation and concurrency, MCP sharing, schemas, input bounds and skill
coverage. It does not make a paid generation or exercise a live external agent.
