# Genobi plugin

One package for Hermes, Claude Code and Codex: the Genobi skills and the
Genobi MCP server and terminal CLI, thin clients of the studio running locally. It reads
status, models, jobs and takes, and runs paid generation only behind a quote:
`genobi_quote` prices a run, the person agrees, and `genobi_submit` spends that
quote once with an idempotency key it never retries on its own. It also edits
the Director project the person links (`genobi_link_project`) through the
project copy on the local server, with ten Director commands sent at a
revision (`genobi_director_command`). See
[the Director bundle page](../../docs/director-bundle/README.md).

Skills load as a task needs them. `genobi_skill` (`mcp/skill-tools.ts`)
lists the skills in `skills/` with each one's description and tags, and
returns one by name. Names are checked against that list, never used as a
path, and a skill over 64 KB or linking outside the folder is not offered.
It reads the plugin's files only and never pays. A session the studio starts
gets only `genobi-studio`, whose routing table tells it what to load.

`registry.json` lists every tool and skill: kind, name, description, tags from
[the wiki's tag list](../../docs/tags.md), linked docs, for a tool whether it
is read-only or paid and which skills teach it, and for a skill which tools it
uses. `npm run registry` generates it from the tool definitions in `mcp/` (each
carries `tags` and `docs`) and each skill's `metadata.tags` and
`metadata.docs`, and renders [the registry pages](../../docs/registry.md) in
the wiki from it; `npm run check:registry` fails when either is stale or a tag
or doc does not exist. `genobi_registry` (`mcp/registry-tools.ts`) searches it
by tag, text or kind, reading that one file only. A skill teaches a tool when
its instructions name it; a row of `genobi-studio`'s tool table does not count,
and `tests/tool-registry.test.ts` fails when a tool has no skill that teaches it.

| File                         | Read by                                |
| ---------------------------- | -------------------------------------- |
| `plugin.json`, `mcp.json`    | Hermes (Agent Plugins v1), Codex       |
| `.claude-plugin/plugin.json` | Claude Code                            |
| `.mcp.json`                  | Claude Code                            |
| `skills/`                    | all three (shared Agent Skills fields) |
| `registry.json`              | `genobi_registry`; generated           |
| `capabilities.json`          | `genobi capabilities`; agents directly |
| `server/genobi-mcp.mjs`      | built by `npm run build:mcp`           |

`capabilities.json` is the capability map: one entry per feature, saying where
it is in the studio, whether it runs free on this machine, on a local open
model, on Comfy Cloud or through a paid API, which models it uses and whether
their weights are open, its tools, CLI verbs, skills and docs, and whether a
dated record shows it working. It is hand-kept; `npm run check:capabilities`
fails when a registry tool or skill is in no entry, a name or doc does not
exist, or a verified entry has no dated record, and `npm run capabilities`
renders [the capability map page](../../docs/capabilities.md) from it.

## Terminal access

`npm run build:mcp` builds both entry points. Run
`node plugins/genobi/server/genobi-cli.mjs help`, or use the package's `genobi`
executable after `npm link`. Every MCP tool has a command and exact JSON schema;
load `genobi-cli` for profiles, shared project Taste and `swords` media commands.
See [the CLI guide](../../docs/genobi-cli.md). `GENOBI_PROFILE=NAME` opts an MCP
process into the same private connection identity as the CLI. Profiles contain
connection/model preferences, never provider keys, and do not install agents.

## Skills

| Skill             | For                                                                      |
| ----------------- | ------------------------------------------------------------------------ |
| `genobi-cli`      | Terminal commands, schemas, profiles and the shared Taste workflow       |
| `genobi-studio`   | The entry skill: status, every tool, the paying rules, which skill next  |
| `genobi-director` | The main surface: a whole job in the Director, with any tool, commands   |
| `genobi-camera`   | One workflow card per runnable model: route, cost, prompt, camera words  |
| `genobi-akuspace` | Acoustic Space on LTX-2.5: presets, levels, caption, where it runs       |
| `genobi-scrolls`  | A character sheet or storyboard before the video, timed to a song        |
| `product-video`   | The Product video house template, step by step, with its provenance card |
| `character-piece` | The Character piece: a Klein still and three LTX shots                   |
| `audio-visual`    | The Audio-visual piece on LTX-2.5 · Acoustic Space, cut to the bar       |
| `falling-room`    | Falling room: a free World Builder take, its room sound, one Klein still |
| `genobi-hermes`   | The open route on Hermes, the Klein box edit and the two-pass run        |
| `genobi-machine`  | The machine check: which models run locally and which on Comfy Cloud     |
| `genobi-swords`   | Dual Swords: probe, frames, trim, join and crossfade on local ffmpeg     |

`genobi-camera` follows the model registry (`shared/registry.ts`) and the
camera wording (`shared/camera.ts`, [camera wording](../../docs/camera-wording.md));
`tests/plugin-skill-cards.test.ts` fails when a ready model has no card, a
card's request or route drifts from the registry, or the Director skill's
command table drifts from the commands the server parses. It also checks that
every link from a skill to a file in this repository resolves.

The template skills plan with `genobi_template_plan`, check the whole recipe
with `genobi_budget` before the first quote (on the studio's demo key an agent's
runs are held to three per session per day; on a key the owner saved, only
the price counts), and finish with
`genobi_provenance`, which builds the run's provenance card. See
[Hermes runs](../../docs/hermes-runs.md).

## Use it

Start the studio first: `npm run dev` (it listens on `http://127.0.0.1:4317`;
set `GENOBI_URL` in the MCP entry if you changed the port).

- **Hermes, the `genobi` profile (recommended):** `npm run agent:hermes-profile`
  creates or updates a Hermes profile named `genobi` (Hermes' own
  `hermes profile create`, then `hermes -p genobi plugins enable` and
  `config set`, in that profile only). It links this plugin, enables it for its
  skills, and replaces the plugin's MCP entry with the same server marked as an
  agent's and filtered to the tools without `genobi_submit`. It needs the
  model and provider, and pins them on every model route with fallback off:

  ```sh
  GENOBI_AGENT_HERMES_MODEL=deepseek/deepseek-v4-pro \
  GENOBI_AGENT_HERMES_PROVIDER=nous npm run agent:hermes-profile
  hermes -p genobi auth add nous --type oauth
  ```

  Then either type to it with `hermes -p genobi`, or let the studio start it
  from the Project prompt with `GENOBI_AGENT_RUNNER=hermes` and the same two
  variables. Both see the same skills, server and filter; see
  [agent sessions](../../docs/agent-setup.md#hermes).

  Hermes is the open route: DeepSeek V4 Pro (`deepseek/deepseek-v4-pro`, MIT
  open weights) is the recommended model, and `deepseek/deepseek-v4-flash` the
  cheaper one; with an API key from DeepSeek, use the provider `deepseek`
  instead (cheaper model `deepseek-flash`). A local server works too, such as
  `qwen3.5:4b` on the provider `ollama` with the profile's `model.base_url`
  pointing at it. Anthropic and OpenAI models and
  providers are refused, because Claude Code and Codex already cover them on
  the owner's subscriptions
  ([the open route](../../docs/hermes-open-route.md)).

- **Hermes, your own profile:** `hermes plugins install` takes a catalog name or
  a Git URL whose root is the plugin, so from this checkout link the folder
  instead: `ln -s "$PWD/plugins/genobi" ~/.hermes/plugins/genobi`, then
  `hermes plugins enable genobi`. This gives the plugin's MCP server unfiltered,
  `genobi_submit` included, behind its quote step.
  `hermes plugins validate plugins/genobi` checks the manifest. The MCP server
  starts with the next Hermes session.
- **Claude Code:** `claude --plugin-dir plugins/genobi`, or add it through a
  plugin marketplace.
- **Codex:** documented to read the same `plugin.json`, `mcp.json` and
  `skills/` layout; not yet tried here.

Check the plugin the way Hermes loads it, without a model call:
`python -I scripts/check-hermes-plugin.py plugins/genobi` with Hermes' own
Python, while the studio runs.

Rebuild the server after changing `mcp/`: `npm run build:mcp`. The build also
writes `server/THIRD_PARTY_LICENSES.txt` for the packages it bundles.
