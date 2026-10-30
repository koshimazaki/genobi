// The Comfy key for scripts that call Comfy directly (check-router,
// camera-test): COMFY_API_KEY when set, otherwise, on macOS, the key the
// studio saved in the login Keychain (service Genobi, account comfy; see
// server/keychain.ts). The key is returned, never printed or logged.
import { execFile } from "node:child_process";

const SECURITY = "/usr/bin/security";

/** Reads the studio's Keychain item; undefined when there is none. */
export const keychainComfyKey = () =>
  new Promise((resolve) => {
    if (process.platform !== "darwin") return resolve(undefined);
    execFile(
      SECURITY,
      ["find-generic-password", "-s", "Genobi", "-a", "comfy", "-w"],
      { timeout: 10_000, maxBuffer: 64 * 1024 },
      // The error and stderr are dropped: nothing from here reaches a log.
      (error, stdout) =>
        resolve(error ? undefined : stdout.replace(/\n$/, "") || undefined),
    );
  });

/** The key and where it came from, for a message that names only the source. */
export async function comfyKey(
  env = process.env,
  readKeychain = keychainComfyKey,
) {
  const fromEnv = env.COMFY_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: "COMFY_API_KEY" };
  const saved = await readKeychain();
  return saved
    ? { key: saved, source: "the Keychain (saved in the studio)" }
    : { key: undefined, source: undefined };
}
