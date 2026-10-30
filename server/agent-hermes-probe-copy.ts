// A private, throwaway copy of the `genobi` profile for the route probe.
// Hermes' resolvers are not read-only: picking a credential-pool entry and
// failing a refresh offline records a cooldown (`last_status: exhausted`) in
// auth.json. So the probe never runs on the real profile. It runs on a copy
// in the OS temp folder, created owner-only (0700, files 0600), never logged,
// and removed when the probe ends, crash or timeout included; a copy left by
// a killed server is swept on the next probe.
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PREFIX = "genobi-hermes-probe-";
/** A copy older than this was left by a process that did not finish. */
const STALE_MS = 10 * 60_000;

/**
 * What Hermes' resolvers read for routing (Hermes Agent v0.21.4):
 * - in the profile: `config.yaml`; `.env` and `.op.env`
 *   (hermes_cli/env_loader.py, `load_hermes_dotenv`); `auth.json`, the
 *   credential pool and stored sign-ins (hermes_cli/auth.py);
 * - in the Hermes root: `auth.json`, the read-only fallback a profile uses
 *   for a provider it has no entries for (auth.py, `_global_auth_file_path`,
 *   `read_credential_pool`), and `shared/nous_auth.json`, the Nous sign-in
 *   every profile shares (auth_nous.py, `_nous_shared_auth_dir`).
 */
const PROFILE_FILES = ["config.yaml", ".env", ".op.env", "auth.json"];
const ROOT_FILES = ["auth.json", path.join("shared", "nous_auth.json")];

/**
 * The Hermes root a profile belongs to, as Hermes computes it
 * (hermes_constants.py, `get_default_hermes_root`): `~/.hermes` for a
 * profile under it, else `<root>` for `<root>/profiles/<name>`.
 */
export function hermesRoot(home: string, userHome?: string) {
  const native = userHome && path.join(userHome, ".hermes");
  if (native && !path.relative(native, home).startsWith("..")) return native;
  return path.basename(path.dirname(home)) === "profiles"
    ? path.dirname(path.dirname(home))
    : home;
}

const copyIfThere = async (from: string, to: string) => {
  await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
  await copyFile(from, to).then(
    () => chmod(to, 0o600),
    () => undefined,
  );
};

/** Removes copies a killed process left behind. */
async function sweep() {
  const tmp = os.tmpdir();
  const names = await readdir(tmp).catch(() => [] as string[]);
  await Promise.all(
    names
      .filter((name) => name.startsWith(PREFIX))
      .map(async (name) => {
        const dir = path.join(tmp, name);
        const info = await stat(dir).catch(() => undefined);
        if (info && Date.now() - info.mtimeMs > STALE_MS)
          await rm(dir, { recursive: true, force: true });
      }),
  );
}

/**
 * Runs `use` with an environment pointed at a private copy of the profile
 * in `env.HERMES_HOME`, and removes the copy afterwards whatever happens.
 */
export async function withProfileCopy<T>(
  env: Record<string, string>,
  use: (copied: Record<string, string>) => Promise<T>,
): Promise<T> {
  await sweep();
  const home = env.HERMES_HOME;
  const dir = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  try {
    const root = path.join(dir, "root");
    const copyHome = path.join(root, "profiles", "genobi");
    const userHome = path.join(dir, "home");
    await mkdir(copyHome, { recursive: true, mode: 0o700 });
    await mkdir(userHome, { recursive: true, mode: 0o700 });
    if (home) {
      const realRoot = hermesRoot(home, env.HOME);
      for (const file of PROFILE_FILES)
        await copyIfThere(path.join(home, file), path.join(copyHome, file));
      if (realRoot !== home)
        for (const file of ROOT_FILES)
          await copyIfThere(path.join(realRoot, file), path.join(root, file));
    }
    return await use({
      ...env,
      HOME: userHome,
      HERMES_HOME: copyHome,
      HERMES_SHARED_AUTH_DIR: path.join(root, "shared"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
