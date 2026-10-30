// The route probe's private copy of the profile: owner-only, in the OS temp
// folder, pointed at by HOME, HERMES_HOME and the shared sign-in store, and
// gone afterwards, even when the probe throws. The real files stay
// byte-identical, modification time included, whatever the probe writes.
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hermesRoot, withProfileCopy } from "../server/agent-hermes-probe-copy";

let tmp = "";
let probeTmp = "";
const savedTmp = process.env.TMPDIR;
beforeAll(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), "genobi-copy-test-"));
  probeTmp = path.join(tmp, "probe-tmp");
  await mkdir(probeTmp);
});
afterAll(async () => {
  process.env.TMPDIR = savedTmp;
  await rm(tmp, { recursive: true, force: true });
});

/** A Hermes root with the genobi profile, a fallback store and a shared one. */
async function profile() {
  const root = await mkdtemp(path.join(tmp, "root-"));
  const home = path.join(root, "profiles", "genobi");
  await mkdir(path.join(root, "shared"), { recursive: true });
  await mkdir(home, { recursive: true });
  const files: Record<string, string> = {
    [path.join(home, "config.yaml")]: "model:\n  provider: nous\n",
    [path.join(home, ".env")]: "NOUS_INFERENCE_BASE_URL=https://x.example/v1\n",
    [path.join(home, "auth.json")]: '{"providers":{"nous":{}}}',
    [path.join(root, "auth.json")]: '{"credential_pool":{}}',
    [path.join(root, "shared", "nous_auth.json")]: '{"refresh_token":"r"}',
  };
  for (const [file, text] of Object.entries(files)) await writeFile(file, text);
  const old = new Date("2026-01-01T00:00:00Z");
  for (const file of Object.keys(files)) await utimes(file, old, old);
  return { root, home, files };
}

const inProbeTmp = <T>(run: () => Promise<T>) => {
  process.env.TMPDIR = probeTmp;
  return run().finally(() => {
    process.env.TMPDIR = savedTmp;
  });
};

describe("the probe's profile copy", () => {
  it("finds the Hermes root a profile reads its shared stores from", () => {
    expect(hermesRoot("/srv/h/profiles/genobi", "/home/a")).toBe("/srv/h");
    expect(hermesRoot("/home/a/.hermes/profiles/genobi", "/home/a")).toBe(
      "/home/a/.hermes",
    );
  });

  it("copies what routing reads, owner-only, and points Hermes at it", async () => {
    const { home } = await profile();
    let seen: Record<string, string> = {};
    await inProbeTmp(() =>
      withProfileCopy(
        { PATH: "/usr/bin", HOME: "/home/someone", HERMES_HOME: home },
        async (env) => {
          seen = env;
          const copyRoot = path.dirname(path.dirname(env.HERMES_HOME));
          const dir = path.dirname(copyRoot);
          expect(dir.startsWith(probeTmp)).toBe(true);
          expect((await stat(dir)).mode & 0o777).toBe(0o700);
          for (const file of ["config.yaml", ".env", "auth.json"]) {
            const copied = path.join(env.HERMES_HOME, file);
            expect((await stat(copied)).mode & 0o777).toBe(0o600);
          }
          expect(await readFile(path.join(copyRoot, "auth.json"), "utf8")).toBe(
            '{"credential_pool":{}}',
          );
          expect(
            await readFile(
              path.join(env.HERMES_SHARED_AUTH_DIR, "nous_auth.json"),
              "utf8",
            ),
          ).toBe('{"refresh_token":"r"}');
          expect(env.HOME.startsWith(dir)).toBe(true);
          expect(env.PATH).toBe("/usr/bin");
        },
      ),
    );
    expect(seen.HERMES_HOME).not.toBe(home);
    expect(await readdir(probeTmp)).toEqual([]);
  });

  it("leaves the real files byte-identical and removes the copy, even when the probe throws", async () => {
    const { home, files } = await profile();
    const before = await Promise.all(
      Object.keys(files).map(async (file) => (await stat(file)).mtimeMs),
    );
    await expect(
      inProbeTmp(() =>
        withProfileCopy({ HERMES_HOME: home }, async (env) => {
          // What Hermes' resolver does to a pool on a failed refresh.
          await writeFile(
            path.join(env.HERMES_HOME, "auth.json"),
            '{"last_status":"exhausted"}',
          );
          await writeFile(
            path.join(env.HERMES_SHARED_AUTH_DIR, "nous_auth.json"),
            "{}",
          );
          await mkdir(path.join(env.HERMES_HOME, "logs"));
          throw new Error("the probe crashed");
        }),
      ),
    ).rejects.toThrow("the probe crashed");
    for (const [file, text] of Object.entries(files))
      expect(await readFile(file, "utf8")).toBe(text);
    const after = await Promise.all(
      Object.keys(files).map(async (file) => (await stat(file)).mtimeMs),
    );
    expect(after).toEqual(before);
    expect(existsSync(path.join(home, "logs"))).toBe(false);
    expect(await readdir(probeTmp)).toEqual([]);
  });

  it("sweeps a copy a killed process left behind", async () => {
    const stale = path.join(probeTmp, "genobi-hermes-probe-left");
    await mkdir(stale);
    const old = new Date(Date.now() - 60 * 60_000);
    await utimes(stale, old, old);
    const fresh = path.join(probeTmp, "genobi-hermes-probe-running");
    await mkdir(fresh);
    await inProbeTmp(() => withProfileCopy({}, async () => undefined));
    expect(await readdir(probeTmp)).toEqual(["genobi-hermes-probe-running"]);
    await rm(fresh, { recursive: true });
  });
});
