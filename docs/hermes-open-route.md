---
tags: [agents, models, mcp]
summary: Hermes is Genobi's open route; which models and providers it refuses, every Hermes route the genobi profile pins, local model servers, and why there is no fallback.
---

# The Hermes open route

Part of [agent sessions](agent-setup.md#hermes): the rules the studio's
Hermes runner, setup's **Set up Hermes** and `npm run agent:hermes-profile`
(one module, `server/agent-hermes-profile-setup.ts`) hold the `genobi` profile
to.

Hermes is Genobi's open-source route (owner decision, 22 October 2026): it runs
open-weight models only. Anthropic and OpenAI models are covered by the
owner's subscriptions through Claude Code and Codex, so Hermes never runs one,
and never through an Anthropic or OpenAI provider. `shared/open-route.ts` holds
the rule; the status route, the runner (before the profile is touched or
Hermes starts), the setting saved in setup, and **Set up Hermes** and
`npm run agent:hermes-profile` (before anything is created) all refuse with one
fixed sentence that names the rule, never the value.

**In setup:** the Connect step offers open models from `LICENCES.md` as a list,
DeepSeek V4.1 Flash (`deepseek/deepseek-v4.1-flash` on `nous`) first and
prefilled, with "Other open model…" for a typed pair
([agent sessions](agent-setup.md)).

**Recommended:** `deepseek/deepseek-v4-pro` (DeepSeek V4 Pro, MIT-licensed open
weights), signed in through Nous Portal. The cheaper option is
`deepseek/deepseek-v4-flash` on Nous. Hermes also has a DeepSeek provider of
its own, `deepseek` (an API key from DeepSeek, `hermes -p genobi auth add
deepseek`, which prompts for it); Hermes strips the matching `deepseek/` prefix
for it, so `deepseek/deepseek-v4-pro` works there too, and its cheaper model is
`deepseek-flash` (`hermes_cli/model_normalize.py`; `models_catalog_static.py`).
Prices change; check the provider's page rather than this one.

**Refused providers**, matched without regard to case: any id containing
`anthropic` or `openai`, or with the word `claude`, `chatgpt` or `codex`. In
Hermes v0.21.4 (`hermes chat --help` and `reference/cli-commands.md`,
"--provider"; the alias table in `hermes_cli/providers.py`) that is
`anthropic` and its aliases `claude` and `claude-code`, `commandcode-anthropic`,
`openai-codex` and its aliases `chatgpt` and `chatgpt-codex`, `openai-api`,
`openai` (Hermes' alias for OpenRouter, refused by name all the same), `codex`
(an auxiliary-task value) and `azure-openai`. Also refused, because they choose
or mix models Genobi cannot see: `auto` (Hermes would pick from whatever is
signed in, Claude Code's login included; `hermes_cli/auth.py`,
`resolve_provider`), `moa` (a Mixture of Agents preset) and `copilot-acp`.

**Refused models**, on whole words of the id without regard to case, so
`deepseek/deepseek-v4-pro` and `qwen/qwen3-…` pass: `claude`, `anthropic`,
`openai` (so any `anthropic/…` or `openai/…`), `gpt` (`gpt-5.5`, `gpt-oss`),
`chatgpt`, `codex`, OpenAI's o-series (`o1`, `o3`, `o4` and later), and
OpenRouter's own routers (`openrouter/auto`, `openrouter/pareto-code`), which
pick a model per request. The id must also have the shape Hermes takes as
it is, a bare id (`deepseek-flash`) or `vendor/model` with an optional
`:tag`; anything else is a selector Hermes routes elsewhere and is refused:
`moa:<preset>`, which switches the provider to `moa` and wins over
`--provider` (`cli.py`, `_normalize_moa_model`; `cli_init_mixin.py`),
`<provider>:<model>` and `custom:<name>:<model>` (`hermes_cli/models.py`,
`parse_model_input`, through `model_switch.py`,
`resolve_startup_model_route`), a provider-side `~…-latest` alias, and a
`vendor/` that is itself a refused provider (`moa/…`). `tests/open-route.test.ts`
holds both tables.

## Every route pinned

A Hermes profile names models in more places than `model:`, and an explicit
entry wins over the main route. Each time the profile is set up or
`config.yaml` changes, Genobi sets every one it found in Hermes'
`config_defaults.py` and readers to the pinned provider and model, or clears
it so it inherits the main route:

| Keys                                                              | Set to                                                                                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.default`, `model.provider`                                 | The two variables. `model.openai_runtime` empty; `model.base_url` and `model.api_mode` empty, except on a [local provider](#local-models).                                                                             |
| `model.aliases`, `model_aliases`                                  | `{}`: an alias rewrites `-m`, endpoint included, even with `--provider` (`model_switch.py`, `_load_direct_aliases`).                                                                                                   |
| `fallback_providers`, `fallback_model`                            | `[]` ([no fallback](#no-fallback)).                                                                                                                                                                                    |
| `auxiliary.<task>` for all 22 tasks                               | The pinned provider and model, no `base_url`, `api_key` or `fallback_chain`. An explicit task wins (`auxiliary_client.py`, `_resolve_task_provider_model`) and walks its own chain (`_try_configured_fallback_chain`). |
| `auxiliary.openrouter_model`                                      | Empty (the auto chain's OpenRouter model).                                                                                                                                                                             |
| `delegation.provider`, `model`, `base_url`, `api_key`, `api_mode` | Empty, so sub-agents inherit the main route; `delegation.fallback_providers: []` (`tools/delegate_tool_config.py`).                                                                                                    |
| `moa.presets`, `moa.default_preset`, `moa.active_preset`          | One `default` preset with the pinned model as reference and aggregator, none active. Hermes' built-in default is OpenAI and Anthropic (`moa_config.py`).                                                               |
| `cron.provider`, `cron.model`, `cron.model_provider`              | Empty, so scheduled jobs inherit the main route.                                                                                                                                                                       |
| `stt.enabled`                                                     | `false`, see below.                                                                                                                                                                                                    |

The 22 tasks are every block under `auxiliary` in `config_defaults.py` (vision,
compression, skills_hub, approval, review, mcp, title_generation,
memory_query_rewrite, tts_audio_tags, triage_specifier, kanban_decomposer,
profile_describer, goal_judge, curator, monitor, background_review,
moa_reference, moa_aggregator), two that plugins call without a default
(`kanban_estimator`, `call`) and two legacy blocks (`web_extract`,
`session_search`). A top-level key is set with Hermes' `--force`, which it
needs to replace a mapping (`config.py`, `_guard_section_overwrite`).

Then `shared/open-route-config.ts` reads the whole `config.yaml` again and the
session refuses to start, naming the keys (never the values), while any key
still names a closed route: a `provider` or `*_provider` value the guard
refuses, a `model`, `*_model`, `model_id` or `model.default` it refuses, an
Anthropic or OpenAI endpoint under any key, a `base_url` that is not http(s),
`codex_app_server` as `model.openai_runtime` or an `api_mode`, or a tool backend
whose managed `nous` selection Hermes serves with OpenAI.

**Endpoints, whatever the key** (`shared/open-route-host.ts`). Hermes reads an
endpoint from `base_url`, `url` or `api` (`config_providers.py`;
`runtime_provider_custom.py`), and more names may follow, so the check does not
depend on the key: every value in `config.yaml`, at any depth, in lists and in
block or flow YAML, is scanned for URLs (`http(s)://`, `ws(s)://`, `//host`),
and under an endpoint-like key (`base_url`, `url`, `api`, `api_base`,
`endpoint`, `host`) a bare `host[/path]` counts too. A host is refused when it
is, or ends with, `anthropic.com`, `claude.ai`, `claude.com`, `openai.com`,
`chatgpt.com`, `openai.azure.com`, `oaistatic.com` or `oaiusercontent.com`
(Hermes' source names api.openai.com and its us./eu. hosts, auth.openai.com,
chatgpt.com, `<resource>.openai.azure.com`, api.anthropic.com,
console.anthropic.com, claude.ai and platform.claude.com), or when a label is
the word `openai`, `anthropic`, `claude` or `chatgpt`, which catches Nous'
managed `openai-audio-gateway` (`tools/managed_tool_gateway.py`,
`<vendor>-gateway`). Hosts are compared after the URL parser's IDNA
normalisation, lower-cased, with trailing dots stripped. The profile's `.env`
is read the same way, naming the variable (`OPENAI_BASE_URL`,
`CUSTOM_BASE_URL`), never its value. `model.openai_runtime` is pinned empty:
`codex_app_server` hands a turn to OpenAI's Codex app server even on a named
custom provider (`runtime_provider.py`, `_maybe_apply_codex_app_server_runtime`).

**The routes Hermes resolves, before every session.** The checks above read
names; Hermes also reads endpoints from places they cannot see, such as a
`.env` value built by interpolation (`DOMAIN=openai.com`,
`CUSTOM_BASE_URL=https://api.${DOMAIN}/v1`) or a credential-pool entry in
`auth.json`. So before every session, and at setup, Genobi asks Hermes' own
resolvers through `server/agent-hermes-probe.py`, run with Hermes' Python (the
install directory `hermes --version` prints, `venv/bin/python`, looked up once)
and the network switched off in that process. It loads the profile's
environment with the helper `hermes chat` runs at start (cli.py:
`load_hermes_dotenv(hermes_home=get_hermes_home(), project_env=<install>/.env)`,
`hermes_cli/env_loader.py`: `.env` with `${VAR}` interpolation, `.op.env`, the
managed overlay), then resolves the main route
(`runtime_provider.py`, `resolve_runtime_provider`), each auxiliary task
(`auxiliary_client.py`, `_resolve_task_provider_model`), every credential-pool
entry's `base_url` and `inference_base_url` (`hermes_cli/auth.py`,
`read_credential_pool`, read without loading or rewriting the pool) and the
stored sign-in's endpoints (`get_provider_auth_state`) and every endpoint
override set for the provider. It reports provider, scheme, host and wire mode
only, never a key or token. Nothing is cached: it takes about 0.4 to 1.1
seconds (measured on this machine; about 0.37 seconds for a whole session start
once the profile is set).

Hermes' resolvers are not read-only: picking a pool entry and failing a refresh
offline records a cooldown in `auth.json`. So the probe never runs on the real
profile (`server/agent-hermes-probe-copy.ts`). It runs on a private copy in the
OS temp folder, created owner-only (folder 0700, files 0600), holding what
routing reads: the profile's `config.yaml`, `.env`, `.op.env` and `auth.json`,
and from the Hermes root the fallback `auth.json` (`auth.py`,
`_global_auth_file_path`) and the shared Nous sign-in `shared/nous_auth.json`
(`auth_nous.py`, `_nous_shared_auth_dir`). `HOME`, `HERMES_HOME` and
`HERMES_SHARED_AUTH_DIR` point at the copy, and the probe puts the last two
back after loading the profile's `.env`. The copy is deleted when the probe
ends, crash or timeout included, never logged, and one left by a killed server
is swept on the next probe.

**Expanded configuration.** The probe also writes the profile's
`config.yaml` as Hermes reads it, every `${VAR}` expanded against the loaded
environment (`config.py`, `read_raw_config_readonly` and `_expand_env_vars`),
into its private copy, and Genobi runs the same `config.yaml` check on it
before the copy is deleted. So `tts.provider: ${SPEECH_BACKEND}` with
`SPEECH_BACKEND=nous` is judged as managed Nous speech, which is OpenAI's, and
every tool backend (TTS, STT, image generation, voice) is judged after
expansion. A reference in a routing key (a provider, model, endpoint or
runtime) that is still unexpanded is refused. The check of the raw file leaves
such references to this step; without Hermes' Python, a routing reference is
refused outright.

**No failover to another provider.** Hermes has no setting that turns off two
implicit retries in `_resolve_call_client` (`agent/auxiliary_client.py`):
vision retries with provider `auto` whenever its base URL is empty and the
pinned backend gave no client (`resolve_vision_provider_client`, then
`_vision_auto_route`: the main provider, then OpenRouter, Nous and DeepInfra),
and a text task on `auto`, `openrouter` or `custom` walks the auto chain, which
Hermes itself keeps on the main provider once one is selected. Only an
explicit base URL skips the vision retry, and that would need the endpoint and
change how credentials are found. So the probe runs Hermes' real client
resolution for every auxiliary task with the pinned backend made to fail, and
reports every client another route still yields with its endpoint. Any that is
not the main route's own endpoint refuses the session: in practice, vision
with OpenRouter or DeepInfra credentials in the genobi profile (or in the
Hermes root it falls back to). Remove those credentials from the profile to
run Hermes.

**Provider names.** The provider is lower-cased as Hermes keys it, and the
probe canonicalises it once with Hermes' own `normalize_provider` (case and
aliases, `providers.py`) before the OAuth, stored sign-in, pool and override
lookups; `shared/open-route.ts` canonicalises the same aliases for the guard.

A route on an Anthropic or OpenAI host or provider, without http(s), or on the
Codex app server refuses the session. Once the profile holds a credential for
the pinned provider, a route that does not resolve refuses it too, with a
fixed sentence; before the first sign-in nothing can resolve yet, so a fresh
profile still starts. An OAuth provider whose token is due a refresh cannot
refresh offline; its main route is then the endpoint the real chat would use
after the refresh: the first endpoint override set in the loaded environment,
else the stored sign-in, else the provider's own endpoint, and unresolved when
none can be established. The overrides, from Hermes' source:
`NOUS_INFERENCE_BASE_URL` for Nous (`auth_nous.py`,
`_nous_inference_env_override`, layered over the stored URL after every
refresh), `HERMES_XAI_BASE_URL` then `XAI_BASE_URL` for xAI OAuth
(`auth_xai.py`), `HERMES_QWEN_BASE_URL` for Qwen OAuth (`auth_qwen.py`),
`HERMES_CODEX_BASE_URL` (`credential_pool.py`) and each provider's own
`base_url_env_var` (`providers.py`). Each one set is also checked as a route of
its own. An install without that layout skips this
step and keeps the checks above.

Backends are
judged by what Hermes resolves, not by the name: `tts.provider: nous` runs
OpenAI's speech model (`tools/tts_tool.py`, `_get_provider`: "`nous` is
serviced by the OpenAI path", `gpt-4o-mini-tts` by default), and so does
`stt.provider: nous` (`tools/transcription_tools.py`, `_get_provider`), so both
are refused like `openai`; the default `edge` voices and the local engines
(`piper`, `kittentts`, `neutts`) pass. Managed image generation picks FAL, Krea
or Portal by its model (`tools/image_generation_managed.py`; FAL's
`fal-ai/flux-2/klein/9b` by default), so the model is what is checked, and
managed web search and browser are not models. That covers what Genobi does
not set: a TTS or image backend chosen as OpenAI (`tts.provider`,
`image_gen.provider` or `image_gen.model`), `voice.voice_chat_mode: gpt_live`
(OpenAI's realtime model), a plugin's own task block, `providers:` and
`custom_providers:` entries and legacy `compression.summary_*` keys. Speech to
text is switched off (`stt.enabled: false`): it auto-detects a cloud backend,
OpenAI's among them, when no local one is installed
(`tools/transcription_tools.py`, `_get_provider`), and Genobi's voice input
goes through the studio. `x_search` (xAI's Grok) is neither vendor's. It
reads names only and errs towards refusing; a key it refuses can be removed
with `hermes -p genobi config unset <key>`. The check does not see a
plugin-registered auxiliary default that never reaches `config.yaml`, or a
cron job's own stored model.

## Local models

Open models on this machine or the network, such as Qwen on Ollama, are part of
the open route. Hermes' local providers are `custom` and its alias `ollama`,
`local` and its aliases `vllm`, `llamacpp`, `llama.cpp` and `llama-cpp`, and
`lmstudio` (`hermes_cli/providers.py`, the alias table; `runtime_provider.py`,
`_resolves_to_custom`; `auxiliary_client.py`, `_LOCAL_SERVER_ALIASES`). Their
endpoint is the profile's `model.base_url` (or a `providers.<name>.base_url`);
without one Hermes stops with "has no endpoint configured"
(`runtime_provider.py`, `_raise_if_local_alias_missing_endpoint`). So for a
local provider the pins keep `model.base_url` and `model.api_mode`, and the
check holds the endpoint to http(s) off Anthropic's and OpenAI's hosts. A local
server's own `name:tag` id (Ollama's `qwen3.5:4b`) runs on a local provider:
with `--provider` set, Hermes does not split `provider:model`
(`model_switch.py`, `resolve_startup_model_route`). `moa:`, `custom:`, `local:`
and a refused provider before the colon stay refused, and `name:tag` stays
refused on a hosted provider.

```sh
GENOBI_AGENT_HERMES_MODEL=qwen3.5:4b \
GENOBI_AGENT_HERMES_PROVIDER=ollama npm run agent:hermes-profile
hermes -p genobi config set model.base_url http://127.0.0.1:11434/v1
```

## No fallback

Hermes can switch to another provider or model when the primary fails
(`user-guide/features/fallback-providers.md`): the top-level
`fallback_providers` list, the legacy `fallback_model`, and on a start-up
sign-in failure the same chain. Hermes builds that chain from both keys
(`hermes_cli/fallback_config.py`, `get_fallback_chain`, read at start by
`cli_init_mixin.py`), so the profile sets both to empty lists and a failing
provider ends the turn instead. Hermes' own loader then reports an empty chain,
and `hermes -p genobi fallback list` says "No fallback providers configured".
The rest stays on the pinned provider:

- **Credential pools** rotate keys of the same provider only, including the
  `fill_first` strategy (`user-guide/features/credential-pools.md`).
- **Each turn** runs the session's primary model and provider
  (`cli_agent_setup_mixin.py`, `_resolve_turn_agent_config`).
- **Auxiliary tasks** are pinned one by one with empty chains
  ([above](#every-route-pinned)); Hermes' built-in discovery chain, which can
  reach Codex or Anthropic, runs only when no main provider is selected, and
  the profile always selects one (fallback-providers.md, "Auto-Detection
  Chain").

Hermes' stream-JSON names only the requested model, at `init`, before sign-in
(`hermes_cli/stream_json.py`), and has no event for a switch, so the runner
cannot see a fallback in the stream; the empty chain is the guard.
