import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { findBinary } from "./agent-config";
import { PROFILE_NAME } from "./agent-hermes-profile";
import {
  SETUP_RUNNER_NAMES,
  SETUP_RUNNERS,
  type HarnessSignIn,
  type SetupRunner,
  type SignedIn,
} from "../shared/agent-runner-setting";

/**
 * Whether each harness setup offers is signed in, asked of the harness's own
 * read-only status command: `claude auth status --json`, `codex login status`
 * and `hermes -p genobi auth list`. Each runs without a shell, with a
 * timeout, and with the server's provider keys removed from its environment.
 * Its output stays in this function: it is reduced to a boolean, or
 * "unknown" when the command fails, times out or answers in a shape not
 * known here, and is never logged or returned.
 */

export const PROBE_TIMEOUT_MS = 8_000;

/** One status command's exit code and output, or undefined if it did not finish. */
export type ProbeRun = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) => Promise<{ code: number; stdout: string } | undefined>;

const runProbe: ProbeRun = (command, args, env, timeoutMs) =>
  new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      { env, timeout: timeoutMs, maxBuffer: 256 * 1024 },
      // A timeout, a kill or a spawn failure has no numeric code: unknown.
      // The error and stderr are dropped, so nothing reaches a log.
      (error, stdout) =>
        resolve(
          !error
            ? { code: 0, stdout: String(stdout) }
            : typeof error.code === "number"
              ? { code: error.code, stdout: String(stdout) }
              : undefined,
        ),
    );
    child.stdin?.end();
  });

export interface SignInOptions {
  env?: NodeJS.ProcessEnv;
  run?: ProbeRun;
  timeoutMs?: number;
  /** Hermes' provider, so its probe lists only that provider's sign-in. */
  hermesProvider?: string;
}

const PROVIDER_KEYS = ["COMFY_API_KEY", "BFL_API_KEY", "RUNWARE_API_KEY"];

/** The Hermes root that holds `profiles/genobi`, as the runner finds it. */
export const hermesRoot = (env: NodeJS.ProcessEnv) =>
  env.GENOBI_AGENT_HERMES_ROOT?.trim() ||
  (env.HOME ? path.join(env.HOME, ".hermes") : undefined);

/** Whether the `genobi` profile exists: Hermes signs in inside it. */
export const hasGenobiProfile = (root?: string) =>
  root && path.isAbsolute(root)
    ? access(path.join(root, "profiles", PROFILE_NAME, "config.yaml")).then(
        () => true,
        () => false,
      )
    : Promise.resolve(false);

export const HERMES_PROFILE_NOTE =
  "Hermes' genobi profile is not set up yet: Sign in sets it up first, for the model chosen here.";

/** `claude auth status --json` answers `loggedIn`; anything else is unknown. */
function claudeSignedIn(stdout: string): SignedIn {
  try {
    const loggedIn = JSON.parse(stdout)?.loggedIn;
    return typeof loggedIn === "boolean" ? loggedIn : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * `hermes auth list` prints `<provider> (<n> credentials):` per signed-in
 * provider. The Terminal launcher reads the same line before it signs in.
 */
export const HERMES_SIGNED_IN = /^\S+ \([1-9]\d* credentials?\):\s*$/m;
const hermesSignedIn = (stdout: string) => HERMES_SIGNED_IN.test(stdout);

async function probe(
  runner: SetupRunner,
  binary: string,
  options: Required<Pick<SignInOptions, "env" | "run" | "timeoutMs">> &
    SignInOptions,
): Promise<SignedIn> {
  const env = { ...options.env };
  for (const key of PROVIDER_KEYS) delete env[key];
  const ask = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
    options.run(binary, args, { ...env, ...extra }, options.timeoutMs);
  if (runner === "claude") {
    const answer = await ask(["auth", "status", "--json"]);
    return answer ? claudeSignedIn(answer.stdout) : "unknown";
  }
  if (runner === "codex") {
    const answer = await ask(["login", "status"]);
    if (!answer) return "unknown";
    return answer.code === 0 ? true : answer.code === 1 ? false : "unknown";
  }
  const root = hermesRoot(options.env);
  const provider = options.hermesProvider;
  const answer = await ask(
    ["-p", PROFILE_NAME, "auth", "list", ...(provider ? [provider] : [])],
    root ? { HERMES_HOME: root } : {},
  );
  if (!answer || answer.code !== 0) return "unknown";
  return hermesSignedIn(answer.stdout);
}

/** Every harness setup offers: installed, and signed in where it can say. */
export async function harnessSignIn(
  options: SignInOptions = {},
): Promise<HarnessSignIn[]> {
  const env = options.env ?? process.env;
  const settings = {
    ...options,
    env,
    run: options.run ?? runProbe,
    timeoutMs: options.timeoutMs ?? PROBE_TIMEOUT_MS,
  };
  const extra = env.HOME
    ? [path.join(env.HOME, ".local/bin"), path.join(env.HOME, "bin")]
    : [];
  return Promise.all(
    SETUP_RUNNERS.map(async (runner): Promise<HarnessSignIn> => {
      const row = { runner, name: SETUP_RUNNER_NAMES[runner] };
      const binary = await findBinary(runner, env, extra);
      if (!binary) return { ...row, installed: false, signedIn: false };
      if (runner === "hermes" && !(await hasGenobiProfile(hermesRoot(env))))
        return {
          ...row,
          installed: true,
          signedIn: false,
          note: HERMES_PROFILE_NOTE,
          profile: "missing",
        };
      return {
        ...row,
        installed: true,
        signedIn: await probe(runner, binary, settings),
      };
    }),
  );
}
