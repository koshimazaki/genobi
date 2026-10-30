import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { tools } from "../mcp/tools";
import { registry } from "../shared/registry";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const job = {
  id: "job-1",
  status: "Ready",
  prompt: "x".repeat(200),
  model: "ltx-2.5",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:01:00.000Z",
  costEstimateUsd: 0.4,
  keyMode: "server",
  resultUrl: "/api/media/job-1.mp4",
};
/** A stand-in for the local studio API that records what it was asked. */
function fakeStudio(routes: Record<string, unknown>) {
  const seen: { path: string; cookie: string | null }[] = [];
  const fetcher = (async (input: URL, init?: RequestInit) => {
    const path = new URL(input).pathname;
    seen.push({
      path,
      cookie: new Headers(init?.headers).get("cookie"),
    });
    if (!(path in routes))
      return Response.json({ error: "Not found." }, { status: 404 });
    return Response.json(routes[path], {
      headers: { "Set-Cookie": `camera_session=${SESSION}; Path=/` },
    });
  }) as typeof fetch;
  return {
    api: new GenobiApi(studioUrl("http://127.0.0.1:4317"), fetcher),
    seen,
  };
}
const tool = (name: string) => tools.find((t) => t.name === name)!;

describe("studio address", () => {
  it("accepts only the loopback studio", () => {
    expect(studioUrl().origin).toBe("http://127.0.0.1:4317");
    expect(studioUrl("http://localhost:5175").port).toBe("5175");
    for (const bad of [
      "https://127.0.0.1:4317",
      "http://example.com",
      "http://192.168.1.4:4317",
      "http://user:pw@127.0.0.1:4317",
      "http://127.0.0.1:4317/api",
      "not a url",
    ])
      expect(() => studioUrl(bad)).toThrow();
  });
});

describe("tools", () => {
  it("keeps the studio session across calls", async () => {
    const { api, seen } = fakeStudio({
      "/api/health": { ok: true, hasServerKey: false, budgetUsd: 5 },
      "/api/history": { jobs: [job], sources: [] },
    });
    await tool("genobi_status").run(api, {});
    await tool("genobi_jobs").run(api, {});
    // The session handshake goes first, with no cookie; every call after it
    // carries the one session it set.
    expect(seen.map((s) => [s.path, s.cookie])).toEqual([
      ["/api/health", null],
      ["/api/health", `camera_session=${SESSION}`],
      ["/api/history", `camera_session=${SESSION}`],
    ]);
  });

  it("summarises jobs without provider handles and bounds the prompt", async () => {
    const { api } = fakeStudio({
      "/api/history": {
        jobs: [{ ...job, pollingUrl: "https://secret", sessionId: SESSION }],
      },
    });
    const [summary] = (await tool("genobi_jobs").run(api, {})) as Record<
      string,
      unknown
    >[];
    expect(summary).not.toHaveProperty("pollingUrl");
    expect(summary).not.toHaveProperty("sessionId");
    expect(String(summary.prompt)).toHaveLength(158);
    expect(summary).toMatchObject({ id: "job-1", model: "ltx-2.5" });
  });

  it("lists models from the shared registry, filtered by status", async () => {
    const { api } = fakeStudio({});
    const ready = (await tool("genobi_models").run(api, {
      status: "ready",
    })) as { id: string; route: string }[];
    expect(ready.map((m) => m.id)).toEqual(
      registry.filter((e) => e.status === "ready").map((e) => e.id),
    );
    expect(
      ready.every((m) => ["router", "workflow", "bfl"].includes(m.route)),
    ).toBe(true);
  });

  it("explains a studio that is not running", async () => {
    const api = new GenobiApi(studioUrl(), (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    await expect(tool("genobi_status").run(api, {})).rejects.toThrow(
      /npm run dev/,
    );
  });

  it("passes the studio's own error message through", async () => {
    const { api } = fakeStudio({});
    await expect(
      tool("genobi_job").run(api, { id: "missing" }),
    ).rejects.toThrow("Not found.");
  });

  it("marks only a quote, the pairings and the media writers unsafe to repeat, and only polling, paid, project, pairing, upload, settings and media tools as writes", () => {
    // Each media write makes another derived file: harmless, but not free.
    const media = [
      "genobi_media_frames",
      "genobi_media_trim",
      "genobi_media_concat",
      "genobi_media_crossfade",
      "genobi_media_space",
    ];
    expect(
      tools.filter((t) => !t.annotations.idempotentHint).map((t) => t.name),
    ).toEqual([
      // Scrolls' panels: a one-use code, so a repeat is refused, not doubled.
      "genobi_scrolls_panels",
      "genobi_world",
      // A second send replaces the waiting recipe: harmless, not free.
      "genobi_world_recipe",
      "genobi_arena",
      "genobi_quote",
      // A split upscale's plan cuts and quotes again; so does a part's retry.
      "genobi_upscale_parts_plan",
      "genobi_upscale_parts_retry",
      ...media,
      // Each start is another Developer (one at a time): not free to repeat.
      "genobi_develop",
    ]);
    expect(
      tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name),
    ).toEqual([
      "genobi_job",
      "genobi_scrolls_panels",
      "genobi_world",
      "genobi_world_recipe",
      "genobi_arena",
      "genobi_quote",
      "genobi_submit",
      "genobi_upscale_parts_plan",
      "genobi_upscale_parts",
      "genobi_upscale_parts_confirm",
      "genobi_upscale_parts_retry",
      "genobi_upscale_parts_retry_confirm",
      "genobi_link_project",
      "genobi_director_command",
      "genobi_decision",
      "genobi_session_checkpoint",
      "genobi_taste",
      "genobi_reference",
      "genobi_take_to_project",
      "genobi_audio_upload",
      ...media,
      // Session settings: writes, safe to repeat, never paid.
      "genobi_run_location",
      "genobi_workflow_select",
      // Starts a Developer in a worktree; never paid, never on main.
      "genobi_develop",
    ]);
    expect(tools.every((t) => !t.annotations.destructiveHint)).toBe(true);
  });
});

describe("MCP server", () => {
  it("applies profile defaults while recording registered tool activity", async () => {
    const events: unknown[] = [];
    const api = new GenobiApi(studioUrl(), (async (input, init) => {
      if (new URL(String(input)).pathname === "/api/activity")
        events.push(JSON.parse(String(init?.body)).event);
      return Response.json({ recorded: true });
    }) as typeof fetch);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(api, {
      weights: "open-weights",
      execution: "local",
    }).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    try {
      await client.connect(clientSide);
      const result = await client.callTool({
        name: "genobi_models",
        arguments: { status: "ready" },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as { text: string }[];
      const models = JSON.parse(content[0].text) as {
        open: boolean;
        runLocations: string[];
      }[];
      expect(models.length).toBeGreaterThan(0);
      expect(
        models.every((m) => m.open && m.runLocations.includes("local")),
      ).toBe(true);
      expect(events).toEqual([
        expect.objectContaining({ tool: "genobi_models", phase: "started" }),
        expect.objectContaining({ tool: "genobi_models", phase: "succeeded" }),
      ]);
    } finally {
      await client.close();
      await serverSide.close();
    }
  });
  it("lists every tool with its annotations and answers a call", async () => {
    const { api } = fakeStudio({ "/api/jobs/job-1": { job } });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(api).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name).sort()).toEqual(
      tools.map((t) => t.name).sort(),
    );
    expect(
      listed.tools.find((t) => t.name === "genobi_job")?.annotations,
    ).toMatchObject({ readOnlyHint: false, idempotentHint: true });
    const ok = await client.callTool({
      name: "genobi_job",
      arguments: { id: "job-1" },
    });
    expect(ok.isError).toBeFalsy();
    const bad = await client.callTool({
      name: "genobi_job",
      arguments: { id: "../../etc/passwd" },
    });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});

describe("plugin package", () => {
  const root = "plugins/genobi";
  const json = (path: string) =>
    JSON.parse(readFileSync(`${root}/${path}`, "utf8"));

  it("matches the Agent Plugins v1 shape Hermes loads", () => {
    const manifest = json("plugin.json");
    expect(manifest.$schema).toBe(
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    );
    expect(json(".claude-plugin/plugin.json").name).toBe(manifest.name);
    const mcp = json("mcp.json");
    expect(Object.keys(mcp).sort()).toEqual(["$schema", "mcpServers"]);
    expect(mcp.mcpServers.genobi.command).toBe("node");
    expect(json(".mcp.json").mcpServers.genobi.args[0]).toContain(
      "${CLAUDE_PLUGIN_ROOT}",
    );
  });

  it("keeps skill frontmatter to the fields every agent reads", () => {
    for (const name of readdirSync(`${root}/skills`)) {
      const text = readFileSync(`${root}/skills/${name}/SKILL.md`, "utf8");
      const front = text.split("---")[1];
      expect(front).toMatch(new RegExp(`^name: ${name}$`, "m"));
      const keys = [...front.matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
      expect(
        keys.every((k) =>
          [
            "name",
            "description",
            "license",
            "compatibility",
            "metadata",
            "allowed-tools",
          ].includes(k),
        ),
      ).toBe(true);
      // Metadata stays one level deep: Hermes rejects nested maps.
      expect(front).not.toMatch(/^ {4}\S/m);
    }
  });
});

describe("an agent session's MCP server", () => {
  it("marks every request, so the studio refuses it anything paid", async () => {
    const marks: (string | null)[] = [];
    const fetcher = (async (_input: URL, init?: RequestInit) => {
      marks.push(new Headers(init?.headers).get("x-genobi-agent-session"));
      return Response.json({ ok: true });
    }) as typeof fetch;
    await new GenobiApi(studioUrl(), fetcher, true).get("/api/health");
    await new GenobiApi(studioUrl(), fetcher, true).post("/api/quotes", {});
    await new GenobiApi(studioUrl(), fetcher).get("/api/health");
    // Each new client's handshake is marked too: every request, not only writes.
    expect(marks).toEqual(["1", "1", "1", "1", null, null]);
  });

  it("sends its session's grant with the mark, and only a well-formed one", async () => {
    const grants: (string | null)[] = [];
    const fetcher = (async (_input: URL, init?: RequestInit) => {
      grants.push(new Headers(init?.headers).get("x-genobi-agent-run"));
      return Response.json({ ok: true });
    }) as typeof fetch;
    const grant = "0123456789abcdef01234567";
    await new GenobiApi(studioUrl(), fetcher, true, grant).post(
      "/api/quotes",
      {},
    );
    await new GenobiApi(studioUrl(), fetcher, true, "not a grant").get(
      "/api/health",
    );
    // Without the agent mark a grant is never sent.
    await new GenobiApi(studioUrl(), fetcher, false, grant).get("/api/health");
    expect(grants).toEqual([grant, grant, null, null, null, null]);
  });
});
