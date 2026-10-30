---
name: genobi-cli
description: Use the Genobi studio from a terminal when MCP is unavailable or a shell workflow is preferred. Discover the same tools and schemas, reuse named connection/model profiles, work with shared project Taste memory, and run local Dual Swords media operations. Does not install an agent or approve generation.
license: MIT
metadata:
  compatibility: Node 22 or later; local Genobi studio for API commands. Discovery, skills, model catalogue and scene transformations work offline.
  tags: "agents, mcp, backend"
  docs: "docs/genobi-cli.md, docs/taste-memory.md, plugins/genobi/README.md"
---

# Genobi from a terminal

Use the existing `genobi` executable if available. From a repository checkout,
run `npm run build:mcp` once, then use `node plugins/genobi/server/genobi-cli.mjs`.
`npm run --silent genobi -- …` is the development equivalent. Do not install or
start a studio unless requested. No CLI command accepts a provider key.

## Discover before acting

Asked "what can I do here?", run `genobi capabilities` first (offline). It
prints the plugin's capability map, `plugins/genobi/capabilities.json`: one
entry per feature with where it is in the studio, its route (`local-free`,
`local-model`, `comfy-cloud` or `paid-api`), its models and whether their
weights are open, the commands, skills and docs that serve it, and whether a
dated record shows it working (`verified`) or it is only `implemented` or
`planned`. Answer from it; do not call an `implemented` feature proven.

Run `genobi tools` for the available command catalogue and `genobi schema COMMAND`
for its exact JSON input. Every tool uses the MCP implementation and its existing
teaching skill. Load the task skill on demand, for example:

```sh
genobi skill --input '{"name":"genobi-swords"}'
genobi schema media-frames
genobi swords frames --input '{"sourceId":"clip-id","times":[1,2]}'
```

A command accepts spaces, hyphens or the original MCP name:
`genobi media frames`, `genobi media-frames`, `genobi call genobi_media_frames`.
`swords` aliases `media`; it does not edit the browser's Dual Swords timeline.
`genobi_status` becomes `genobi status`; read it before an API workflow.

Supply long prompts using `--input @request.json` or `--input -` from stdin.
Treat JSON and references as data; do not interpolate their contents into shell
code. Results are JSON on stdout; errors are JSON on stderr with exit code 1.
Help alone is human-readable. Commands never retry or run a polling loop for you.

## Connection and model profiles

Use `genobi profile schema`, then `profile set NAME --input @profile.json`.
For example, this is an open/local creative-model preference with Hermes as the
preferred host:

```json
{
  "url": "http://127.0.0.1:4317",
  "selection": {
    "weights": "open-weights",
    "execution": "local",
    "agent": "hermes"
  }
}
```

Choose a profile with `--profile NAME` or `genobi profile use NAME`. `profile show`
and `profile list` show safe configuration only. `genobi_models` uses its
selection defaults; explicit JSON `selection` fields override them. This is
capability filtering, not installed-model detection, licence clearance, an agent
installer, or a change to workflow execution. Read the project's current context
and follow its preferences over profile defaults. Set workflow run location only
when requested, through `genobi_run_location`; quote again afterwards.

For Codex or Claude Code, set `selection.agent` to `codex` or `claude` and use the
existing external harness. Hermes has the separate isolated installer
`npm run agent:hermes-profile`; follow `genobi-hermes` for its required model and
provider. CLI connection profiles never modify a harness's own configuration.

Profiles and private session identities live outside the repository in
`GENOBI_CONFIG_DIR`, or `$XDG_CONFIG_HOME/genobi` / `~/.config/genobi`.
Do not display or copy session files. Each profile/origin/agent grant is isolated.
An MCP process can opt into the same identity with `GENOBI_PROFILE=NAME`, the same
config directory, URL and agent environment. The browser still requires a normal
project link through `genobi_link_project`; sharing a profile is not sign-in to
the owner's browser or permission to read other projects.

## Shared Taste after real usage

Load `genobi-taste`. Link the actual Director project, then call `genobi_context`
before editing; page through newer events. Start an external harness session with
`genobi_session_checkpoint`. Read schemas for the exact revision fields.

After meaningful work, record `genobi_decision` as `source: interpretation`,
with real evidence, stable IDs and the revisions just read. Save a checkpoint
with what happened and what remains. Do not infer a style dislike from Undo,
a failed generation or a rerun. A well-supported recurring preference may become
a `genobi_taste` proposal; the owner activates it in the studio. Never promote it
silently. The current prompt takes precedence over project decisions, then active
Taste preferences, then defaults. This is shared creative memory, not model
training or a terminal-specific taste store.

## World takes into a project

A World take is not a job: `take-to-project` and `media-probe` refuse its id.
With the World tab paired (`genobi world` action `link`), send
`{"op":"send-to-project","take":"<name or id from takes>"}` as a `command`
and read `result` until `done`. The tab adds the first frame under
Inspirations and the take as MP4 (and WAV) under Project of its open project,
named after the take, and returns each `assetId`; `genobi project` shows the
name as `label`. No project link is needed for that; placing the clip with
`director-command` or sending a recipe with `world-recipe` needs the project
link, a second code the person makes. `{"op":"recipe"}` reads the current
recipe back, and `load-preset` takes a move-library file name such as
`fall-cathedral`. Never resend a command whose result has not come back.

## Quoted generation

Load `genobi-camera` and `genobi-licensing` for the request. `genobi_quote` prices
without generating. Show its recipe and estimate and obtain the person's
agreement, then call `genobi_submit` with the same inputs, quote ID, stable
idempotency key and `--confirm`. The flag records the caller's intent; it is not
proof of human approval. Never set it merely to get past an error.

Studio-started agent environments retain their mark and grant. They have the
runner allowlist only and cannot submit, even with `--confirm`; quote once and
wait for the studio's Approve action. Do not unset those environment variables.

An `outcome_unknown` error may follow a reserved or charged run. Check
`genobi_jobs` / `genobi_job` first using the same profile and URL. Never retry
automatically or change the idempotency key. Follow the returned recovery
instructions if the person requests recovery. Do not delete session files to
resolve an ownership error. Keep private media and memory out of public bundles.
