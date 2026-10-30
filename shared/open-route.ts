// Hermes is Genobi's open route (owner decision, 22 October 2026): it runs
// open-weight models only. Anthropic and OpenAI models are covered by the
// owner's subscriptions through Claude Code and Codex, so Hermes never runs
// one, and never through a provider of theirs. The local runner and the
// profile setup both ask this guard before they start or configure anything.
//
// Provider ids are Hermes Agent v0.21.4's own (`hermes chat --help`,
// reference/cli-commands.md "--provider"; hermes_cli/providers.py, the alias
// table): `anthropic` (aliases `claude`, `claude-code`),
// `commandcode-anthropic`, `openai-codex` (aliases `chatgpt`,
// `chatgpt-codex`), `openai-api`, `openai` (an alias of `openrouter` in
// Hermes, refused by name all the same), `codex` (an auxiliary-task value)
// and `azure-openai`. Matching is case-insensitive.

/** Why a model or provider is refused. */
export type ClosedReason = "anthropic" | "openai" | "opaque";

/** Lower-case words of an id: `openai/gpt-5.5` is `openai`, `gpt`, `5`, `5`. */
const words = (id: string) =>
  id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const ANTHROPIC_WORDS = new Set(["anthropic", "claude"]);
const OPENAI_WORDS = new Set(["openai", "chatgpt", "codex", "gpt"]);
/** OpenAI's reasoning series as a whole word: o1, o3, o4 and later. */
const O_SERIES = /^o[1-9][0-9]*$/;

/**
 * Providers that choose or mix models Genobi cannot see, so the open rule
 * cannot be checked: `auto` (Hermes picks from whatever is signed in, Claude
 * Code's login included), `moa` (a Mixture of Agents preset runs several
 * models) and `copilot-acp` (an external agent with its own model choice).
 */
const OPAQUE_PROVIDERS = new Set([
  "auto",
  "moa",
  "copilot-acp",
  "github-copilot-acp",
]);

/**
 * The model ids Hermes takes as they are: a bare provider-native id
 * (`deepseek-flash`) or a `vendor/model` slug with an optional `:tag`
 * (`deepseek/deepseek-v4-pro`, `qwen/qwen3-coder:free`). Anything else is a
 * selector Hermes may route elsewhere, so it is refused:
 * - `moa:<preset>` switches the provider to `moa` and wins over
 *   `--provider` (cli.py, `_normalize_moa_model`; cli_init_mixin.py,
 *   `_init_model_and_provider`), and the default preset's references and
 *   aggregator are OpenAI and Anthropic models (moa_config.py).
 * - `<provider>:<model>` and `custom:<name>:<model>` name the provider in the
 *   model (hermes_cli/models.py, `parse_model_input`, through
 *   model_switch.py, `resolve_startup_model_route`).
 * - `~vendor/model-latest` is a provider-side alias whose target can move,
 *   and an id with a second `/` or other characters is no slug.
 * A `vendor/` that is itself a refused or opaque provider (`moa/…`,
 * `auto/…`) is refused too. Aliases defined in the profile (`model_aliases`,
 * `model.aliases`) are cleared by the profile pins.
 *
 * On a local provider a bare `name:tag` is the server's own id (Ollama's
 * `qwen3.5:4b`), so it runs, unless the name is `moa` (which Hermes reads
 * whatever the provider), `custom`, `local` or a refused provider. With
 * `--provider` set, Hermes does not split `provider:model`
 * (`resolve_startup_model_route` returns before `parse_model_input`).
 */
const BARE_ID = /^[a-z0-9][a-z0-9._-]*$/i;
const SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/i;
const LOCAL_TAG = /^([a-z0-9][a-z0-9._-]*):[a-z0-9][a-z0-9._-]*$/i;
const TAG_SELECTORS = new Set(["moa", "custom", "local"]);

/**
 * Providers that run a model server the person points at, here or on their
 * network: `custom` and its alias `ollama`, `local` and its aliases `vllm`,
 * `llamacpp`, `llama.cpp` and `llama-cpp`, and `lmstudio` with `lm-studio`
 * and `lm_studio` (hermes_cli/providers.py, the alias table and
 * LLAMACPP_ALIASES; runtime_provider.py, `_resolves_to_custom` and
 * `_raise_if_local_alias_missing_endpoint`; auxiliary_client.py,
 * `_LOCAL_SERVER_ALIASES`). Their endpoint is the profile's
 * `model.base_url` or a `providers.<name>.base_url`, which the profile keeps.
 */
const LOCAL_PROVIDERS = new Set([
  "custom",
  "ollama",
  "local",
  "vllm",
  "llamacpp",
  "llama.cpp",
  "llama-cpp",
  "lmstudio",
  "lm-studio",
  "lm_studio",
]);

/**
 * Hermes' aliases for the providers the guard and the probe care about
 * (hermes_cli/providers.py, `_ALIAS_GROUPS`, read by `normalize_provider`):
 * the id Hermes keys sign-ins, pools and overrides by.
 */
const ALIASES: Record<string, string> = {
  claude: "anthropic",
  "claude-code": "anthropic",
  chatgpt: "openai-codex",
  "chatgpt-codex": "openai-codex",
  "deep-seek": "deepseek",
  ollama: "custom",
  vllm: "local",
  llamacpp: "local",
  "llama.cpp": "local",
  "llama-cpp": "local",
  "lm-studio": "lmstudio",
  lm_studio: "lmstudio",
  "github-copilot-acp": "copilot-acp",
};

/**
 * A provider id as Hermes resolves it: trimmed, lower-cased, an alias
 * replaced by its provider (`Nous` is `nous`, `Ollama` is `custom`).
 */
export function canonicalProvider(provider: string) {
  const id = provider.trim().toLowerCase();
  return ALIASES[id] ?? id;
}

/** True for a provider that serves a model from an endpoint the person sets. */
export const isLocalProvider = (provider: string) =>
  LOCAL_PROVIDERS.has(provider.trim().toLowerCase()) ||
  LOCAL_PROVIDERS.has(canonicalProvider(provider));

/**
 * The vendor words alone, for a model a tool backend names in its own
 * format (`fal-ai/flux-2/klein/9b`): Anthropic's or OpenAI's words, the
 * o-series, and OpenRouter's routers (`openrouter/auto`,
 * `openrouter/pareto-code`), which pick a model per request.
 */
export function closedModelName(model: string): ClosedReason | undefined {
  const list = words(model);
  if (list.some((word) => ANTHROPIC_WORDS.has(word))) return "anthropic";
  if (list.some((word) => OPENAI_WORDS.has(word) || O_SERIES.test(word)))
    return "openai";
  if (list[0] === "openrouter" && model.includes("/")) return "opaque";
  return undefined;
}

/**
 * Why a model id Hermes routes is refused, or undefined when it may run (or
 * is unset): the vendor words, then the shape. `provider` admits a local
 * server's `name:tag` ids.
 */
export function closedModel(
  model: string,
  provider = "",
): ClosedReason | undefined {
  const id = model.trim();
  if (!id) return undefined;
  const named = closedModelName(id);
  if (named) return named;
  const tag = LOCAL_TAG.exec(id);
  const localTag =
    !!tag &&
    isLocalProvider(provider) &&
    !TAG_SELECTORS.has(tag[1].toLowerCase()) &&
    !closedProvider(tag[1]);
  if (!BARE_ID.test(id) && !SLUG.test(id) && !localTag) return "opaque";
  if (id.includes("/") && closedProvider(id.split("/")[0])) return "opaque";
  return undefined;
}

/** Why a Hermes provider id is refused, or undefined when it may run. */
export function closedProvider(provider: string): ClosedReason | undefined {
  const raw = provider.trim().toLowerCase();
  const canonical = canonicalProvider(provider);
  // The name as written and as Hermes resolves it: `openai` is refused by
  // name though Hermes reads it as OpenRouter; `Claude-Code` as Anthropic.
  return closedProviderId(raw) ?? closedProviderId(canonical);
}

function closedProviderId(id: string): ClosedReason | undefined {
  const list = words(id);
  if (id.includes("anthropic") || list.includes("claude")) return "anthropic";
  if (
    id.includes("openai") ||
    list.includes("chatgpt") ||
    list.includes("codex")
  )
    return "openai";
  if (OPAQUE_PROVIDERS.has(id)) return "opaque";
  return undefined;
}

/** Which of the pair is refused, model first; undefined when both may run. */
export function openRouteRefusal(
  model: string,
  provider: string,
): "model" | "provider" | undefined {
  if (closedModel(model, provider)) return "model";
  if (closedProvider(provider)) return "provider";
  return undefined;
}

/** The fixed sentence for a refusal: names the rule, never the value. */
export const OPEN_ROUTE_REFUSAL =
  "Hermes is Genobi's open route: it runs open-weight models only, so an Anthropic or OpenAI model or provider is refused (use Claude Code or Codex for those). Set GENOBI_AGENT_HERMES_MODEL and GENOBI_AGENT_HERMES_PROVIDER to an open model, such as deepseek/deepseek-v4-pro on nous.";
