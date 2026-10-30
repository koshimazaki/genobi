import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  readdir,
  stat,
  chmod,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run, commandError } from "../cli/run";
import { commandName, commandTool, describeTool } from "../cli/commands";
import { readJsonInput, INPUT_LIMIT } from "../cli/input";
import { ProfileStore } from "../mcp/profile-store";
import { profileConnection } from "../mcp/connection";
import { tools } from "../mcp/tools";
import { GENOBI_TOOLS } from "../shared/agent-tools";
import { studioUrl } from "../mcp/api";
import registry from "../plugins/genobi/registry.json";

let directory: string;
let store: ProfileStore;
const env = {};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "genobi-cli-"));
  store = new ProfileStore(directory);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("CLI parity and discovery", () => {
  it("exposes every MCP tool and schema with an existing teaching skill", async () => {
    const catalogue = (await run(["tools"], { env, store })) as {
      tool: string;
    }[];
    expect(catalogue.map((entry) => entry.tool)).toEqual(
      tools.map((t) => t.name),
    );
    for (const tool of tools) {
      expect(commandTool([commandName(tool)], false)).toBe(tool);
      expect(commandTool(commandName(tool).split("-"), false)).toBe(tool);
      expect(commandTool([tool.name], false)).toBe(tool);
      expect(describeTool(tool).inputSchema.type).toBe("object");
      expect(
        registry.entries.find(
          (entry) => entry.name === tool.name && entry.kind === "tool",
        ),
      ).toHaveProperty("skills", expect.arrayContaining([expect.any(String)]));
    }
  });
  it("keeps marked sessions on the same restricted runner allowlist", async () => {
    const runtime = {
      env: { GENOBI_AGENT_SESSION: "1" },
      store,
      fetcher: vi.fn(),
    };
    const listed = (await run(["tools"], runtime)) as { tool: string }[];
    expect(listed.map((t) => t.tool).sort()).toEqual([...GENOBI_TOOLS].sort());
    await expect(run(["submit", "--confirm"], runtime)).rejects.toThrow(
      "unavailable",
    );
    await expect(run(["swords", "crossfade"], runtime)).rejects.toThrow(
      "unavailable",
    );
    expect(runtime.fetcher).not.toHaveBeenCalled();
  });
  it("validates before a request and reports structured errors", async () => {
    const fetcher = vi.fn();
    let error;
    try {
      await run(
        ["swords", "frames", "--input", '{"sourceId":"x","times":[-1]}'],
        { env, store, fetcher },
      );
    } catch (caught) {
      error = caught;
    }
    expect(commandError(error).code).toBe("invalid_input");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(run(["jobs", "--typo"], { env, store })).rejects.toThrow(
      "Unknown option",
    );
    await expect(
      run(["models", "--input", '{"typo":true}'], { env, store }),
    ).rejects.toThrow();
  });
  it("loads skills and filters models offline using profile defaults and explicit overrides", async () => {
    await store.set("open", {
      selection: {
        weights: "open-weights",
        execution: "local",
        agent: "hermes",
      },
    });
    const runtime = { env, store, fetcher: vi.fn() };
    const models = (await run(
      ["models", "--profile", "open", "--input", '{"status":"ready"}'],
      runtime,
    )) as { open: boolean; runLocations: string[] }[];
    expect(models.length).toBeGreaterThan(0);
    expect(
      models.every((m) => m.open && m.runLocations.includes("local")),
    ).toBe(true);
    const all = (await run(
      [
        "models",
        "--profile",
        "open",
        "--input",
        '{"status":"ready","selection":{"weights":"any","execution":"any"}}',
      ],
      runtime,
    )) as { open: boolean }[];
    expect(all.some((m) => !m.open)).toBe(true);
    expect(
      await run(["skill", "--input", '{"name":"genobi-swords"}'], runtime),
    ).toBeDefined();
    expect(runtime.fetcher).not.toHaveBeenCalled();
  });
});

describe("profiles and private ownership", () => {
  it("keeps stable concurrent identities per profile, origin, mode and grant", async () => {
    const ids = await Promise.all(
      Array.from({ length: 12 }, () =>
        store.session("default", "http://localhost:4317", false),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    const distinct = await Promise.all([
      store.session("other", "http://localhost:4317", false),
      store.session("default", "http://localhost:4318", false),
      store.session("default", "http://localhost:4317", true),
      store.session(
        "default",
        "http://localhost:4317",
        true,
        "grant-not-stored",
      ),
    ]);
    expect(new Set([...ids, ...distinct]).size).toBe(5);
    for (const file of await readdir(directory)) {
      expect((await stat(join(directory, file))).mode & 0o077).toBe(0);
      expect(await readFile(join(directory, file), "utf8")).not.toContain(
        "grant-not-stored",
      );
    }
    expect(JSON.stringify(await store.list())).not.toContain(ids[0]);
  });
  it("supports named selection profiles without installing or switching an agent", async () => {
    await run(
      [
        "profile",
        "set",
        "codex",
        "--input",
        '{"selection":{"agent":"codex","execution":"cloud"}}',
      ],
      { env, store },
    );
    expect(await run(["profile", "use", "codex"], { env, store })).toEqual({
      active: "codex",
    });
    expect(await run(["profile", "show"], { env, store })).toMatchObject({
      name: "codex",
      selection: { agent: "codex" },
    });
    expect(await run(["profile", "schema"], { env, store })).toHaveProperty(
      "properties.selection",
    );
    await expect(
      store.set("bad", { apiKey: "never-persist" }),
    ).rejects.toThrow();
    await expect(store.set("../bad", {})).rejects.toThrow();
  });
  it("refuses public config files, symlinks and credential-bearing/remote URLs", async () => {
    await store.set("safe", {});
    await chmod(join(directory, "profile-safe.json"), 0o644);
    await expect(store.get("safe")).rejects.toThrow("owner-only");
    await symlink(
      join(directory, "profile-safe.json"),
      join(directory, "profile-link.json"),
    );
    await expect(store.get("link")).rejects.toThrow();
    for (const url of [
      "https://example.com",
      "http://localhost:4317?key=secret",
      "http://user:secret@localhost:4317",
      "http://localhost/#secret",
    ]) {
      await expect(store.set("bad", { url })).rejects.toThrow();
    }
    expect(() => studioUrl("secret-invalid-url")).toThrow(
      "valid local studio URL",
    );
    await writeFile(
      join(directory, "profile-safe.json"),
      '{"bad":"sensitive-contents"',
      { mode: 0o600 },
    );
    await chmod(join(directory, "profile-safe.json"), 0o600);
    let invalid;
    try {
      await store.get("safe");
    } catch (error) {
      invalid = error;
    }
    expect(commandError(invalid).message).not.toContain("sensitive-contents");
    await chmod(directory, 0o755);
    await expect(store.get("default")).rejects.toThrow("owner-only");
  });
  it("shares an explicit MCP profile and preserves marked run headers", async () => {
    const seen: Headers[] = [];
    const fetcher = (async (_url, init) => {
      seen.push(new Headers(init?.headers));
      return Response.json({ ok: true });
    }) as typeof fetch;
    const options = {
      store,
      fetcher,
      env: {
        GENOBI_PROFILE: "default",
        GENOBI_AGENT_SESSION: "1",
        GENOBI_AGENT_RUN: "a".repeat(24),
      },
    };
    const one = await profileConnection(options);
    const two = await profileConnection(options);
    await one.api.get("/api/health");
    await two.api.get("/api/health");
    expect(seen[0].get("cookie")).toBe(seen[1].get("cookie"));
    expect(seen[0].get("X-Genobi-Agent-Session")).toBe("1");
    expect(seen[0].get("X-Genobi-Agent-Run")).toBe("a".repeat(24));
  });
});

describe("JSON input", () => {
  it("reads stdin and files without evaluating their contents", async () => {
    expect(
      await readJsonInput("-", Readable.from(['{"prompt":"$(nope) `nope`"}'])),
    ).toEqual({ prompt: "$(nope) `nope`" });
    await store.set("sample", {});
    expect(
      await readJsonInput(`@${join(directory, "profile-sample.json")}`),
    ).toHaveProperty("selection", {});
    await expect(readJsonInput("oops")).rejects.toThrow("Invalid JSON");
    await expect(
      readJsonInput("-", Readable.from([Buffer.alloc(INPUT_LIMIT + 1)])),
    ).rejects.toThrow("24 MiB");
  });
});
