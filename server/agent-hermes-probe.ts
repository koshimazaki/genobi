// Where Hermes itself would send the `genobi` profile's routes, asked of its
// own resolvers before every session (agent-hermes-probe.py), with the
// profile's environment loaded the way `hermes chat` loads it and the
// network off in that process. The config.yaml and .env checks read names;
// this reads what Hermes would connect to: interpolated `.env` values,
// credential-pool endpoints in auth.json, and whatever else its resolvers
// consult. Nothing is cached: about half a second per session start. It runs
// on a private copy of the profile (agent-hermes-probe-copy.ts), never on the
// real one.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closedProvider } from "../shared/open-route";
import { closedConfigPaths } from "../shared/open-route-config";
import { closedHost } from "../shared/open-route-host";
import { AUXILIARY_TASKS, OpenRouteError } from "./agent-hermes-pins";
import { withProfileCopy } from "./agent-hermes-probe-copy";

/** One route as Hermes resolved it: names, scheme and host, never a key. */
export interface ProbedRoute {
  route: string;
  resolved: boolean;
  provider?: string;
  scheme?: string;
  host?: string;
  api_mode?: string;
  /** An auxiliary task that follows the main route. */
  inherits?: boolean;
  /** Another provider a task reached when its pinned backend failed. */
  failover?: boolean;
  error?: string;
}

export interface ProbeResult {
  /** False when Hermes' Python could not be found (another install layout). */
  available: boolean;
  /** The profile's environment loaded with Hermes' own helper. */
  loaded?: boolean;
  /** The profile holds a credential for the pinned provider. */
  signed_in?: boolean;
  routes?: ProbedRoute[];
  /** The config written out with every `${VAR}` expanded by Hermes. */
  expanded?: boolean;
  /** Key paths of that expanded config that name a closed route. */
  config?: string[];
}

/** Asks Hermes where the pinned routes go; tests stand in for it. */
export type RouteProbe = (
  env: Record<string, string>,
  pinned: { model: string; provider: string },
) => Promise<ProbeResult>;

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "agent-hermes-probe.py",
);

const output = (
  file: string,
  args: string[],
  env: Record<string, string>,
): Promise<string> =>
  new Promise((resolve) =>
    execFile(
      file,
      args,
      { env, timeout: 30_000, windowsHide: true },
      (error, stdout) => resolve(error ? "" : String(stdout)),
    ),
  );

/** Hermes' Python per executable, looked up once per server. */
const pythons = new Map<
  string,
  Promise<{ dir: string; python: string } | undefined>
>();

/**
 * Hermes' own Python: `<install directory>/venv/bin/python`, the install
 * directory as `hermes --version` prints it. Undefined for another layout.
 */
function hermesPython(binary: string, env: Record<string, string>) {
  const known = pythons.get(binary);
  if (known) return known;
  const found = output(binary, ["--version"], env).then(async (version) => {
    const dir = /^Install directory:\s*(\/.+?)\s*$/m.exec(version)?.[1];
    if (!dir) return undefined;
    const python = path.join(dir, "venv", "bin", "python");
    return access(python, constants.X_OK).then(
      () => ({ dir, python }),
      () => undefined,
    );
  });
  pythons.set(binary, found);
  return found;
}

/** Runs the probe script with a given Python against the profile in `env`. */
export async function runProbe(
  python: string,
  installDir: string,
  env: Record<string, string>,
  { model, provider }: { model: string; provider: string },
): Promise<ProbeResult> {
  // Never on the real profile: Hermes' resolvers write cooldowns to auth.json.
  // The config the probe expanded is read from the copy, then deleted with it.
  const [text, expandedYaml] = await withProfileCopy(env, async (copied) => [
    await output(
      python,
      ["-I", SCRIPT, installDir, provider, model, ...AUXILIARY_TASKS],
      copied,
    ),
    await readFile(
      path.join(copied.HERMES_HOME, "genobi-expanded.yaml"),
      "utf8",
    ).catch(() => undefined),
  ]);
  try {
    const parsed = JSON.parse(text.trim().split("\n").pop() ?? "");
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.routes))
      return {
        available: true,
        ...(parsed as Omit<ProbeResult, "available">),
        expanded: expandedYaml !== undefined,
        config:
          expandedYaml === undefined
            ? []
            : closedConfigPaths(expandedYaml, { expanded: true }),
      };
  } catch {
    // Read below as a probe that answered nothing.
  }
  return { available: true, loaded: false, signed_in: true, routes: [] };
}

/** The probe for one Hermes executable. */
export function probeRoute(binary: string): RouteProbe {
  return async (env, pinned) => {
    const found = await hermesPython(binary, env);
    if (!found) return { available: false };
    return runProbe(found.python, found.dir, env, pinned);
  };
}

/** True when a resolved route is not open. */
function closedRoute(route: ProbedRoute) {
  if (!route.resolved) return false;
  if (route.api_mode === "codex_app_server") return true;
  if (route.provider && closedProvider(route.provider)) return true;
  if (!route.host) return false;
  return !/^(https?|wss?)$/i.test(route.scheme ?? "") || closedHost(route.host);
}

/**
 * `closed` when any route Hermes resolves is Anthropic's or OpenAI's (host,
 * provider or the Codex app server); `unresolved` when the profile holds a
 * credential for the provider but its environment did not load or a route
 * did not resolve; otherwise `open`. Before the first sign-in an
 * unresolvable route is expected, so it is `open` until then.
 */
export function routeVerdict(
  result: ProbeResult,
): "open" | "closed" | "unresolved" {
  if (!result.available) return "open";
  const routes = result.routes ?? [];
  // A failover that lands on the main route's own endpoint is the pinned
  // route itself (the auto chain starts there); anywhere else breaks the pin.
  const main = routes.find((route) => route.route === "main");
  const elsewhere = (route: ProbedRoute) =>
    !main?.host ||
    (route.host ?? "").replace(/\.+$/, "").toLowerCase() !==
      main.host.replace(/\.+$/, "").toLowerCase();
  if (routes.some((route) => route.failover && elsewhere(route)))
    return "closed";
  if (
    routes.filter((route) => !route.failover).some(closedRoute) ||
    (result.config ?? []).length
  )
    return "closed";
  if (
    result.signed_in !== false &&
    (!result.loaded ||
      !result.expanded ||
      !routes.length ||
      routes.some((route) => !route.resolved))
  )
    return "unresolved";
  return "open";
}

export const ROUTE_CLOSED =
  "Hermes is Genobi's open route, but Hermes resolves the genobi profile's model to an Anthropic or OpenAI endpoint (or OpenAI's Codex app server). Check model.base_url, the providers: entries, the profile's .env and its credentials, then try again.";
export const ROUTE_UNRESOLVED =
  "Hermes is Genobi's open route: the genobi profile holds a credential for its provider, but Hermes could not say where its model runs, so the session does not start. Check the profile with `hermes -p genobi doctor`, then try again.";

/**
 * Before every session: asks Hermes where the routes go and refuses a
 * closed or (once signed in) unresolvable one. No probe, no check (tests).
 */
export async function assertOpenRoute(
  probe: RouteProbe | undefined,
  env: Record<string, string>,
  pinned: { model: string; provider: string },
) {
  if (!probe) return;
  const result = await probe(env, pinned);
  // Without Hermes' Python nothing expands `${VAR}`: a routing value that
  // holds one cannot be checked, so it is refused.
  if (!result.available && env.HERMES_HOME) {
    const raw = await readFile(
      path.join(env.HERMES_HOME, "config.yaml"),
      "utf8",
    ).catch(() => "");
    if (closedConfigPaths(raw, { expanded: true }).length)
      throw new OpenRouteError(ROUTE_CLOSED);
  }
  const verdict = routeVerdict(result);
  if (verdict === "closed") throw new OpenRouteError(ROUTE_CLOSED);
  if (verdict === "unresolved") throw new OpenRouteError(ROUTE_UNRESOLVED);
}
