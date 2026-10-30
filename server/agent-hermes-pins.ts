// Every route in Hermes' config.yaml that names a model or provider, pinned
// to the open model and provider the `genobi` profile runs (shared/
// open-route.ts), with every fallback chain empty. Checked against Hermes
// Agent v0.21.4: the defaults in hermes_cli/config_defaults.py and the
// readers named beside each key. After the pins, the whole config.yaml is
// read again (closedConfigPaths) and a session refuses to start while any
// key still names an Anthropic or OpenAI model, provider or endpoint.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isLocalProvider } from "../shared/open-route";
import { closedConfigPaths, closedEnvNames } from "../shared/open-route-config";

/**
 * Hermes' auxiliary tasks: every block under DEFAULT_CONFIG["auxiliary"]
 * (config_defaults.py), the two that plugins call without a default
 * (`kanban_estimator`, plugins/kanban/dashboard/plugin_api.py; `call`,
 * plugins/teams_pipeline/pipeline.py), and the two legacy blocks Hermes
 * still tolerates (`web_extract`, `session_search`). An explicit task
 * block wins over the main route (agent/auxiliary_client.py,
 * `_resolve_task_provider_model`) and walks its own `fallback_chain`
 * (`_try_configured_fallback_chain`), so each one is set to the pinned
 * provider and model with no endpoint, key or chain.
 */
export const AUXILIARY_TASKS = [
  "vision",
  "compression",
  "skills_hub",
  "approval",
  "review",
  "mcp",
  "title_generation",
  "memory_query_rewrite",
  "tts_audio_tags",
  "triage_specifier",
  "kanban_decomposer",
  "kanban_estimator",
  "profile_describer",
  "goal_judge",
  "curator",
  "monitor",
  "background_review",
  "moa_reference",
  "moa_aggregator",
  "call",
  "web_extract",
  "session_search",
] as const;

export interface Pinned {
  model: string;
  provider: string;
}

/**
 * The `config set` key and value pairs that pin every route. A top-level key
 * that may already hold a mapping (`model_aliases`, a legacy single-dict
 * `fallback_model`) needs Hermes' `--force` to be replaced
 * (config.py, `_guard_section_overwrite`); the caller adds it.
 */
export function pinnedRoutes({ model, provider }: Pinned): [string, unknown][] {
  const route = { provider, model };
  const task = {
    ...route,
    base_url: "",
    api_key: "",
    api_mode: "",
    fallback_chain: [],
  };
  return [
    // The main route. An unset provider would let Hermes pick from whatever
    // is signed in (hermes_cli/auth.py, `resolve_provider`); a leftover
    // `model.base_url` or `api_mode` would send a hosted provider's requests
    // elsewhere (config.py, `set_config_value`). A local server's endpoint
    // is its `model.base_url` (runtime_provider.py,
    // `_raise_if_local_alias_missing_endpoint`), so it stays, and the
    // config.yaml check holds it to http(s) off Anthropic's and OpenAI's
    // hosts.
    ["model.default", model],
    ["model.provider", provider],
    // `codex_app_server` hands the turn to OpenAI's Codex app server, a
    // named custom provider included (runtime_provider.py,
    // `_maybe_apply_codex_app_server_runtime`).
    ["model.openai_runtime", ""],
    ...(isLocalProvider(provider)
      ? []
      : ([
          ["model.base_url", ""],
          ["model.api_mode", ""],
        ] as [string, unknown][])),
    // Aliases rewrite `-m` before the provider sees it, endpoint included,
    // even with `--provider` (model_switch.py, `_load_direct_aliases`,
    // `resolve_startup_model_route`).
    ["model.aliases", {}],
    ["model_aliases", {}],
    // No cross-provider fallback: the chain is both keys merged
    // (fallback_config.py, `get_fallback_chain`; cli_init_mixin.py).
    ["fallback_providers", []],
    ["fallback_model", []],
    // Auxiliary tasks, one block each (a dotted key replaces that block),
    // and the auto-detection chain's OpenRouter model cleared
    // (config_defaults.py, "auxiliary").
    ["auxiliary.openrouter_model", ""],
    ...AUXILIARY_TASKS.map((name): [string, unknown] => [
      `auxiliary.${name}`,
      name === "title_generation"
        ? { ...task, prefer_fast_model: false }
        : task,
    ]),
    // Sub-agents inherit the parent's route; `[]` disables their fallback
    // (tools/delegate_tool_config.py; fallback-providers.md, "Delegation").
    ["delegation.provider", ""],
    ["delegation.model", ""],
    ["delegation.base_url", ""],
    ["delegation.api_key", ""],
    ["delegation.api_mode", ""],
    ["delegation.fallback_providers", []],
    // Mixture of Agents: the built-in default preset is OpenAI and Anthropic
    // (hermes_cli/moa_config.py, DEFAULT_MOA_REFERENCE_MODELS and
    // DEFAULT_MOA_AGGREGATOR), and `/moa` runs it. One preset, the pinned
    // model as reference and aggregator, none active.
    ["moa.default_preset", "default"],
    ["moa.active_preset", ""],
    [
      "moa.presets",
      { default: { reference_models: [route], aggregator: route } },
    ],
    // Speech to text auto-detects a cloud backend, OpenAI's among them, when
    // no local one is installed (tools/transcription_tools.py,
    // `_get_provider`); Genobi's voice input goes through the studio, so the
    // profile has none.
    ["stt.enabled", false],
    // Scheduled jobs inherit the main route (config_defaults.py, "cron").
    ["cron.provider", ""],
    ["cron.model", ""],
    ["cron.model_provider", ""],
  ];
}

/** Thrown when the profile still names a closed route after the pins. */
export class OpenRouteError extends Error {}

/**
 * Refuses when the profile's config.yaml or .env still names an Anthropic or
 * OpenAI model, provider or endpoint anywhere (keys only in the message).
 */
export async function assertOpenProfile(home: string) {
  const read = (file: string) =>
    readFile(path.join(home, file), "utf8").catch(() => "");
  const closed = [
    ...closedConfigPaths(await read("config.yaml")),
    ...closedEnvNames(await read(".env")).map((name) => `.env ${name}`),
  ];
  if (closed.length)
    throw new OpenRouteError(
      `Hermes is Genobi's open route, but the genobi profile still names an Anthropic or OpenAI model, provider or endpoint at ${closed.slice(0, 5).join(", ")}. Remove it (\`hermes -p genobi config unset <key>\`, or the line in the profile's .env), then try again.`,
    );
}
