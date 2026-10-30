// The route probe against the real Hermes install, when this machine has one
// (skipped otherwise, as in CI): Hermes' own resolvers, in a temporary
// profile and a temporary HOME, with the network off. No model is called and
// nothing outside the temporary folders is read for a sign-in or written.
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { routeVerdict, runProbe } from "../server/agent-hermes-probe";

const install = path.join(os.homedir(), ".hermes", "hermes-agent");
const python = path.join(install, "venv", "bin", "python");
const hermes = existsSync(python);

const roots: string[] = [];
// The probe's private copies go to a temp folder of this file's own, so a
// copy left behind would show here.
let probeTmp = "";
const savedTmp = process.env.TMPDIR;
beforeAll(async () => {
  probeTmp = await mkdtemp(path.join(os.tmpdir(), "genobi-probe-tmp-"));
  roots.push(probeTmp);
});
afterAll(async () => {
  process.env.TMPDIR = savedTmp;
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
/** Runs the probe with its copies under `probeTmp`. */
const probeIn = async (
  env: Record<string, string>,
  pinned: { model: string; provider: string },
) => {
  process.env.TMPDIR = probeTmp;
  try {
    return await runProbe(python, install, env, pinned);
  } finally {
    process.env.TMPDIR = savedTmp;
  }
};

/** A profile with these files, in a HOME of its own. */
async function profile(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-probe-"));
  roots.push(root);
  const home = path.join(root, "home", ".hermes", "profiles", "genobi");
  await mkdir(home, { recursive: true });
  for (const [name, text] of Object.entries(files))
    await writeFile(path.join(home, name), text);
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: path.join(root, "home"),
    HERMES_HOME: home,
    PYTHONDONTWRITEBYTECODE: "1",
  };
  return { home, env };
}

const verdict = async (
  files: Record<string, string>,
  pinned: { model: string; provider: string },
) => {
  const { env } = await profile(files);
  const started = performance.now();
  const result = await probeIn(env, pinned);
  return { verdict: routeVerdict(result), ms: performance.now() - started };
};

const nous = { model: "deepseek/deepseek-v4-pro", provider: "nous" };
const nousConfig =
  "model:\n  default: deepseek/deepseek-v4-pro\n  provider: nous\n";
/** A Nous sign-in whose access token expired long ago. */
const expiredNous = JSON.stringify({
  version: 1,
  active_provider: "nous",
  providers: {
    nous: {
      access_token: "expired-access",
      refresh_token: "fixture-refresh",
      token_type: "Bearer",
      scope: "inference:invoke",
      client_id: "hermes-cli",
      portal_base_url: "https://portal.nousresearch.com",
      inference_base_url: "https://inference-api.nousresearch.com/v1",
      obtained_at: "2026-01-01T00:00:00+00:00",
      expires_at: "2026-01-01T01:00:00+00:00",
    },
  },
});
const pool = (url: string) =>
  JSON.stringify({
    version: 1,
    credential_pool: {
      nous: [
        {
          id: "probe1",
          label: "probe",
          auth_type: "api_key",
          priority: 0,
          source: "manual",
          access_token: "not-a-real-token",
          base_url: "https://inference-api.nousresearch.com/v1",
          inference_base_url: url,
        },
      ],
    },
  });

describe.skipIf(!hermes)(
  "the route probe on this machine's Hermes",
  { timeout: 30_000 },
  () => {
    it("refuses a .env endpoint built by interpolation", async () => {
      const { verdict: v } = await verdict(
        {
          "config.yaml": "model:\n  default: qwen3.5:4b\n  provider: custom\n",
          ".env":
            "DOMAIN=openai.com\nCUSTOM_BASE_URL=https://api.${DOMAIN}/v1\n",
        },
        { model: "qwen3.5:4b", provider: "custom" },
      );
      expect(v).toBe("closed");
    });

    it("refuses a credential-pool endpoint changed to OpenAI", async () => {
      const open = await verdict(
        {
          "config.yaml": nousConfig,
          "auth.json": pool("https://inference-api.nousresearch.com/v1"),
        },
        nous,
      );
      expect(open.verdict).toBe("open");
      const changed = await verdict(
        {
          "config.yaml": nousConfig,
          "auth.json": pool("https://API.openai.com./v1"),
        },
        nous,
      );
      expect(changed.verdict).toBe("closed");
    });

    it("lets a fresh, unsigned profile through to its sign-in", async () => {
      expect((await verdict({ "config.yaml": nousConfig }, nous)).verdict).toBe(
        "open",
      );
    });

    it("never writes the real profile: an expired sign-in leaves auth.json as it was", async () => {
      const files = { "config.yaml": nousConfig, "auth.json": expiredNous };
      const { home, env } = await profile(files);
      const auth = path.join(home, "auth.json");
      const before = await stat(auth);
      const result = await probeIn(env, nous);
      // Hermes tried a refresh offline and failed, as a stale token would.
      expect(result.signed_in).toBe(true);
      expect(await readFile(auth, "utf8")).toBe(expiredNous);
      expect((await stat(auth)).mtimeMs).toBe(before.mtimeMs);
      // Nothing created beside it either: no shared store, no cache folders.
      expect((await readdir(home)).sort()).toEqual(Object.keys(files).sort());
      expect(
        existsSync(path.join(path.dirname(path.dirname(home)), "shared")),
      ).toBe(false);
      expect(await readdir(probeTmp)).toEqual([]);
    });

    it("checks the endpoint override the chat would use after a refresh", async () => {
      const { verdict: v } = await verdict(
        {
          "config.yaml": nousConfig,
          "auth.json": expiredNous,
          ".env":
            "DOMAIN=openai.com\nNOUS_INFERENCE_BASE_URL=https://api.${DOMAIN}/v1\n",
        },
        nous,
      );
      expect(v).toBe("closed");
      // The stored endpoint alone, with no override, is open.
      const stored = await verdict(
        { "config.yaml": nousConfig, "auth.json": expiredNous },
        nous,
      );
      expect(stored.verdict).toBe("open");
    });

    it("refuses TTS set through an environment reference that expands to managed Nous", async () => {
      const { verdict: v } = await verdict(
        {
          "config.yaml": `${nousConfig}tts:\n  provider: \${SPEECH_BACKEND}\n`,
          ".env": "SPEECH_BACKEND=nous\n",
        },
        nous,
      );
      expect(v).toBe("closed");
    });

    it("refuses vision that would fail over to another signed-in provider", async () => {
      const files = { "config.yaml": nousConfig, "auth.json": expiredNous };
      expect((await verdict(files, nous)).verdict).toBe("open");
      const { verdict: v } = await verdict(
        { ...files, ".env": "OPENROUTER_API_KEY=sk-or-not-a-real-key\n" },
        nous,
      );
      expect(v).toBe("closed");
    });

    it("canonicalises the provider before the offline sign-in lookups", async () => {
      const files = { "config.yaml": nousConfig, "auth.json": expiredNous };
      const { verdict: v } = await verdict(files, {
        ...nous,
        provider: "Nous",
      });
      expect(v).toBe("open");
    });

    it("passes Ollama, and answers in about half a second", async () => {
      const { verdict: v, ms } = await verdict(
        {
          "config.yaml":
            "model:\n  default: qwen3.5:4b\n  provider: ollama\n  base_url: http://127.0.0.1:11434/v1\n",
        },
        { model: "qwen3.5:4b", provider: "ollama" },
      );
      expect(v).toBe("open");
      console.log(`route probe: ${Math.round(ms)} ms`);
      expect(ms).toBeLessThan(5_000);
    });
  },
);
