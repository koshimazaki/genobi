// Reads a Hermes config.yaml as text and lists every place that still names
// an Anthropic or OpenAI model, provider, backend or endpoint
// (shared/open-route.ts). The `genobi` profile pins every route Hermes
// documents, then this check runs over what remains (another plugin's block,
// a TTS backend, a custom provider entry, a local server's endpoint), so a
// session refuses to start rather than trust a key Genobi does not set. It
// reads names only: no YAML parser, no values in what it returns, and it errs
// towards refusing.
import { closedModel, closedModelName, closedProvider } from "./open-route";
import { ENDPOINT_KEY, closedEndpoint } from "./open-route-host";

/** `provider`, `model_provider`, `summary_provider`: a provider id. */
const PROVIDER_KEY = /(^|_)provider$/i;
/** `model`, `default_model`, `summary_model`, `model_id`, `model.default`. */
const MODEL_KEY = /(^|_)model$|^model_id$/i;
/** `voice.voice_chat_mode: gpt_live` runs OpenAI's realtime model. */
const MODE_KEY = /^voice_chat_mode$/i;
/** `base_url`, `summary_base_url`: an endpoint that must be http(s). */
const URL_KEY = /(^|_)base_url$/i;
/**
 * `model.openai_runtime: codex_app_server` and an `api_mode` of the same
 * name hand the turn to OpenAI's Codex app server, whatever the provider
 * (runtime_provider.py, `_maybe_apply_codex_app_server_runtime`).
 */
const RUNTIME_KEY = /^(openai_runtime|api_mode)$/i;

/**
 * Tool backends whose managed `nous` selection is OpenAI's: text to speech
 * (tools/tts_tool.py, `_get_provider`: "`nous` is serviced by the OpenAI
 * path", `gpt-4o-mini-tts` by default) and speech to text
 * (tools/transcription_tools.py, `_get_provider`: `nous` becomes `openai`).
 * Managed image generation picks FAL, Krea or Portal by the model
 * (tools/image_generation_managed.py), so its model is checked instead, and
 * managed web search and browser are not models.
 */
const MANAGED_OPENAI: Record<string, string[]> = {
  tts: ["nous"],
  stt: ["nous"],
};

const withoutComment = (value: string) => value.replace(/\s+#.*$/, "").trim();
const unquote = (value: string) =>
  withoutComment(value)
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();

interface Pair {
  path: string[];
  key: string;
  value: string;
}

/** True when a pair names a closed model, provider, backend or endpoint. */
/** A key that routes a request: provider, model, endpoint or runtime. */
const routingKey = (key: string, path: string[]) =>
  PROVIDER_KEY.test(key) ||
  MODEL_KEY.test(key) ||
  MODE_KEY.test(key) ||
  RUNTIME_KEY.test(key) ||
  ENDPOINT_KEY.test(key) ||
  (key === "default" && path.join(".") === "model");

/** `${VAR}` or `${env:VAR}`: an environment reference Hermes expands. */
const ENV_REF = /\$\{[^}]*\}/;

function closedPair(
  { path, key, value }: Pair,
  mainProvider: string,
  expanded: boolean,
) {
  if (!value) return false;
  if (key && ENV_REF.test(value) && routingKey(key, path))
    // Expanded, a reference still there was not resolved: refused. Raw, it
    // is checked once Hermes has expanded it (the route probe).
    return expanded;
  // Any URL under any key, and a bare host under an endpoint key.
  if (closedEndpoint(value, key)) return true;
  if (!key) return false;
  const parent = path[path.length - 1];
  if (RUNTIME_KEY.test(key)) return /codex_app_server/i.test(value);
  if (PROVIDER_KEY.test(key))
    return (
      !!closedProvider(value) ||
      (path.length === 1 &&
        (MANAGED_OPENAI[parent] ?? []).includes(value.toLowerCase()))
    );
  // The main model is held to the shape Hermes routes as it is; a tool
  // backend's model (FAL's `fal-ai/flux-2/klein/9b`) to the vendor words.
  if (key === "default" && path.join(".") === "model")
    return !!closedModel(value, mainProvider);
  if (MODEL_KEY.test(key) || MODE_KEY.test(key))
    return !!closedModelName(value);
  // A model endpoint is http(s).
  if (URL_KEY.test(key)) return !/^https?:\/\/[^/]/i.test(value);
  return false;
}

/** The pairs of one flow mapping (`{provider: x, model: y}`) or a line. */
const flowPairs = (text: string) =>
  text
    .split(/[{},[\]]/)
    // `key: value` needs the space YAML needs, so `https://…` is no key.
    .map((part) => /^\s*-?\s*([A-Za-z_][\w-]*)\s*:(?:\s+(.*)|$)/.exec(part))
    .filter((match): match is RegExpExecArray => !!match)
    .map(([, key, value = ""]) => ({ key, value: unquote(value) }));

/** Every `key: value` pair with the keys above it, block and flow style. */
function configPairs(yaml: string): Pair[] {
  const pairs: Pair[] = [];
  const stack: { indent: number; key: string }[] = [];
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^(\s*)(-\s+)?([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(line);
    if (!match) {
      // A list item or continuation without a key: its flow pairs, and the
      // whole line as a keyless value for the endpoint check.
      const path = stack.map((entry) => entry.key);
      for (const pair of flowPairs(line)) pairs.push({ path, ...pair });
      pairs.push({ path, key: "", value: withoutComment(line) });
      continue;
    }
    const [, spaces, dash, key, rest = ""] = match;
    const indent = spaces.length + (dash ? dash.length : 0);
    while (stack.length && stack[stack.length - 1].indent >= indent)
      stack.pop();
    const path = stack.map((entry) => entry.key);
    const value = rest.trim();
    if (!value || value.startsWith("#")) {
      stack.push({ indent, key });
      continue;
    }
    if (/^[{[]/.test(value)) {
      for (const pair of flowPairs(value))
        pairs.push({ path: [...path, key], ...pair });
      pairs.push({ path: [...path, key], key: "", value });
      continue;
    }
    pairs.push({ path, key, value: unquote(value) });
  }
  return pairs;
}

/**
 * The dotted paths (keys only, never values) in a Hermes config.yaml that
 * name an Anthropic or OpenAI model or provider, a provider that hides its
 * model, a managed backend that is OpenAI's, or an endpoint that is not
 * http(s) or is on an Anthropic or OpenAI host. Empty when there are none.
 * A routing value that holds a `${VAR}` reference is left to the expanded
 * check (`expanded: true`, the config as Hermes expands it), where a
 * reference still unresolved is refused.
 * Model ids are read against the profile's `model.provider`, so a local
 * server's `name:tag` ids pass.
 */
export function closedConfigPaths(
  yaml: string,
  { expanded = false }: { expanded?: boolean } = {},
): string[] {
  const pairs = configPairs(yaml);
  const mainProvider =
    pairs.find((p) => p.key === "provider" && p.path.join(".") === "model")
      ?.value ?? "";
  const found = [
    ...new Set(
      pairs
        .filter((pair) => closedPair(pair, mainProvider, expanded))
        .map((pair) => [...pair.path, pair.key].filter(Boolean).join(".")),
    ),
  ];
  // A whole flow line is checked as well as its pairs; name the pair.
  return found.filter(
    (path) => !found.some((other) => other.startsWith(`${path}.`)),
  );
}

/**
 * The variable names (never values) in a Hermes profile's `.env` whose
 * value points at Anthropic or OpenAI: `OPENAI_BASE_URL`, `CUSTOM_BASE_URL`
 * and every other endpoint Hermes reads from the environment
 * (runtime_provider_custom.py, `expand_direct_api_alias`;
 * runtime_provider.py, `_raise_if_local_alias_missing_endpoint`).
 */
export function closedEnvNames(env: string): string[] {
  const names: string[] = [];
  for (const line of env.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match) continue;
    const [, name, value] = match;
    const key = /_(BASE_URL|URL|ENDPOINT|HOST)$/i.test(name) ? "url" : "";
    if (closedEndpoint(unquote(value), key)) names.push(name);
  }
  return [...new Set(names)];
}
