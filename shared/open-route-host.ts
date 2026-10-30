// Endpoints, whatever key holds them: every URL in a value, and a bare host
// under a key Hermes reads as an endpoint, is refused when its host is
// Anthropic's or OpenAI's. Hosts are compared after the WHATWG URL parser's
// IDNA normalisation, lower-cased and without trailing dots.

/**
 * Domains that serve only Anthropic's or OpenAI's APIs and apps, a host on
 * any of them included. Checked against Hermes Agent v0.21.4's source: it
 * names api.openai.com (with us./eu. residency hosts), auth.openai.com,
 * platform.openai.com, chatgpt.com, <resource>.openai.azure.com,
 * api.anthropic.com, console.anthropic.com, claude.ai, platform.claude.com
 * and docs.claude.com. oaistatic.com and oaiusercontent.com are OpenAI's
 * asset and file hosts.
 */
const CLOSED_DOMAINS = [
  "anthropic.com",
  "claude.ai",
  "claude.com",
  "openai.com",
  "chatgpt.com",
  "openai.azure.com",
  "oaistatic.com",
  "oaiusercontent.com",
];

/**
 * Hosts that relay to OpenAI under another domain: Nous' managed audio
 * gateway, which Hermes names `openai-audio-gateway.<domain>`
 * (tools/managed_tool_gateway.py, `<vendor>-gateway`), is caught by the
 * vendor word in its first label below.
 */
const VENDOR_LABEL =
  /(^|[^a-z0-9])(openai|anthropic|claude|chatgpt)([^a-z0-9]|$)/;

/** Keys Hermes reads as an endpoint (config_providers.py: base_url, url, api). */
export const ENDPOINT_KEY =
  /(^|_)(base_url|url|api|api_base|endpoint|host|hostname)$/i;

/** A host as Hermes would connect to it, or undefined when it is none. */
export function normalHost(host: string): string | undefined {
  const raw = host.trim();
  if (!raw || /[\s/\\?#@]/.test(raw)) return undefined;
  try {
    const name = new URL(`http://${raw}`).hostname;
    return name.toLowerCase().replace(/\.+$/, "") || undefined;
  } catch {
    return undefined;
  }
}

/** True when a host belongs to Anthropic or OpenAI. */
export function closedHost(host: string): boolean {
  const name = normalHost(host);
  if (!name) return false;
  if (
    CLOSED_DOMAINS.some(
      (domain) => name === domain || name.endsWith(`.${domain}`),
    )
  )
    return true;
  return name.split(".").some((label) => VENDOR_LABEL.test(label));
}

/** The host of every URL in a text: `scheme://host` and `//host` forms. */
export function urlHosts(text: string): string[] {
  const hosts: string[] = [];
  const pattern =
    /(?:[a-z][a-z0-9+.-]*:)?\/\/(?:[^\s/?#@'"]*@)?(\[[^\]\s]*\]|[^\s/?#:'",}\]]+)/gi;
  for (const match of text.matchAll(pattern)) hosts.push(match[1]);
  return hosts;
}

/**
 * True when a value points at Anthropic or OpenAI: any URL in it, or, under
 * an endpoint key, a bare `host[:port][/path]`.
 */
export function closedEndpoint(value: string, key = ""): boolean {
  if (urlHosts(value).some(closedHost)) return true;
  if (!ENDPOINT_KEY.test(key) || value.includes("//")) return false;
  return closedHost(value.trim().split(/[/:]/)[0] ?? "");
}
