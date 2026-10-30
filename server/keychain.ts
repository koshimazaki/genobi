import { execFile } from "node:child_process";
import type { KeyKind } from "../shared/provider";

/**
 * Where the local server keeps a key entered in the studio. macOS only: the
 * login Keychain, through Apple's `security` tool. A key is never written to
 * the repo or a plain file, never logged, and never sent back to the page.
 */
export interface Keychain {
  read(kind: KeyKind): Promise<string | undefined>;
  write(kind: KeyKind, key: string): Promise<void>;
  remove(kind: KeyKind): Promise<void>;
  /** Metadata-only lookup; it must not request the secret. */
  hasBflDashboardKey?(): Promise<boolean>;
  /** Read only after the person explicitly chooses to reuse it. */
  readBflDashboardKey?(): Promise<string | undefined>;
}

/** One `security` run: its exit code and standard output. */
export type SecurityRunner = (
  args: string[],
  input?: string,
) => Promise<{ code: number; stdout: string }>;

const SECURITY = "/usr/bin/security";
/** The Keychain item's service; the account is the slot (`comfy` or `bfl`). */
export const KEYCHAIN_SERVICE = "Genobi";
/** `security`'s answer when no such item exists. */
const NOT_FOUND = 44;

const runSecurity: SecurityRunner = (args, input) =>
  new Promise((resolve) => {
    const child = execFile(
      SECURITY,
      args,
      { timeout: 10_000, maxBuffer: 64 * 1024 },
      // The error names the command line, which never holds the key; it is
      // dropped anyway, with stderr, so nothing from here reaches a log.
      (error, stdout) =>
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          stdout,
        }),
    );
    child.stdin?.end(input ?? "");
  });

export function macKeychain(
  run: SecurityRunner = runSecurity,
  env: Record<string, string | undefined> = process.env,
): Keychain {
  const item = (kind: KeyKind) => ["-s", KEYCHAIN_SERVICE, "-a", kind];
  // Same defaults as BFL Dashboard. These are selectors, never credentials.
  const dashboardItem = [
    "-s",
    env.BFL_KEYCHAIN_SERVICE?.trim() || "BFL Dashboard FLUX API Key",
    "-a",
    env.BFL_KEYCHAIN_ACCOUNT?.trim() ||
      env.USER?.trim() ||
      env.LOGNAME?.trim() ||
      "local-user",
  ];
  const read = async (kind: KeyKind) => {
    const { code, stdout } = await run([
      "find-generic-password",
      ...item(kind),
      "-w",
    ]);
    if (code === NOT_FOUND) return undefined;
    if (code !== 0) throw new Error("keychain_unavailable");
    return stdout.replace(/\n$/, "") || undefined;
  };
  return {
    read,
    async hasBflDashboardKey() {
      const { code } = await run(["find-generic-password", ...dashboardItem]);
      return code === 0;
    },
    async readBflDashboardKey() {
      const { code, stdout } = await run([
        "find-generic-password",
        ...dashboardItem,
        "-w",
      ]);
      if (code === NOT_FOUND) return undefined;
      if (code !== 0) throw new Error("keychain_unavailable");
      return stdout.trim() || undefined;
    },
    async write(kind, key) {
      // The key goes in on standard input (`security -i`), never as an
      // argument, so no process listing shows it. The slot names and the key's
      // character set (`requireSlotKey`) leave nothing to quote.
      await run(
        ["-i"],
        `add-generic-password -U ${item(kind).join(" ")} -w ${key}\n`,
      );
      // Interactive mode exits 0 whatever happened, so read it back.
      if ((await read(kind)) !== key) throw new Error("keychain_unavailable");
    },
    async remove(kind) {
      const { code } = await run(["delete-generic-password", ...item(kind)]);
      if (code !== 0 && code !== NOT_FOUND)
        throw new Error("keychain_unavailable");
    },
  };
}
