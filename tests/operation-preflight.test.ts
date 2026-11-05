import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { GenobiApi, StudioError } from "../mcp/api";
import { createServer } from "../mcp/server";
import {
  diagnoseOperation,
  operationFeature,
  preflightOperation,
} from "../mcp/availability";
import { runtimeCapabilities } from "../shared/runtime-capabilities";
import { run } from "../cli/run";
import { ProfileStore } from "../mcp/profile-store";

function fixture(
  manifest: unknown = runtimeCapabilities("local"),
  answers: Record<string, unknown> = {},
) {
  const seen: { method: string; path: string }[] = [];
  const fetcher = (async (url, init) => {
    const path = new URL(String(url)).pathname;
    seen.push({ method: init?.method ?? "GET", path });
    if (path === "/api/health") return Response.json({ ok: true });
    if (path === "/api/activity") return Response.json({ recorded: false });
    const data = path === "/api/capabilities" ? manifest : answers[path];
    return data === undefined
      ? Response.json({ error: "Missing" }, { status: 404 })
      : Response.json(data);
  }) as typeof fetch;
  return {
    api: new GenobiApi(new URL("http://127.0.0.1:4317"), fetcher),
    fetcher,
    seen,
  };
}
const blocked = [
  "genobi_project",
  "genobi_world",
  "genobi_world_recipe",
  "genobi_voice_transcribe",
  "genobi_audio_analysis",
  "genobi_media_trim",
];

describe("live operation requirements", () => {
  it("distinguishes unknown, unsupported and configured without treating the offline catalogue as proof", async () => {
    for (const manifest of [
      undefined,
      {},
      { schemaVersion: 2 },
      { schemaVersion: 1, runtime: "local", features: {} },
    ]) {
      const f = fixture(manifest === undefined ? undefined : manifest);
      // Explicit missing manifest fixture; the default argument above is otherwise local.
      const api =
        manifest === undefined
          ? {
              get: async () => {
                throw new StudioError("Missing", 404);
              },
            }
          : f.api;
      expect(
        await diagnoseOperation(api, "genobi_voice_transcribe", {}),
      ).toMatchObject({ supported: null });
    }
    const f = fixture(runtimeCapabilities("hosted"));
    for (const tool of blocked) {
      const result = await diagnoseOperation(f.api, tool, {
        action: "command",
      });
      expect(result).toMatchObject({
        supported: false,
        ready: false,
        runtime: "hosted",
      });
      expect(result.next).toContain("local Genobi");
      await expect(preflightOperation(f.api, tool, {})).rejects.toThrow(
        "capability_unavailable",
      );
    }
    expect(f.seen.every((call) => call.method === "GET")).toBe(true);
    const pure = fixture();
    expect(
      await diagnoseOperation(pure.api, "genobi_scrolls", { action: "create" }),
    ).toMatchObject({ supported: null, ready: null });
    expect(pure.seen).toHaveLength(0);
  });

  it("checks local voice and ffmpeg before bytes or media writes, freshly each time", async () => {
    const answers = {
      "/api/voice/status": { available: false, setup: "Finish Voice setup." },
      "/api/media/tools": { ffmpeg: false },
    };
    const f = fixture(runtimeCapabilities("local"), answers);
    await expect(
      preflightOperation(f.api, "genobi_voice_transcribe", {
        sourceId: "voice",
      }),
    ).rejects.toThrow("Finish Voice setup");
    await expect(
      preflightOperation(f.api, "genobi_media_trim", {}),
    ).rejects.toThrow("ffmpeg");
    answers["/api/voice/status"].available = true;
    answers["/api/media/tools"].ffmpeg = true;
    await preflightOperation(f.api, "genobi_voice_transcribe", {});
    await preflightOperation(f.api, "genobi_media_trim", {});
    expect(f.seen.every((call) => call.method === "GET")).toBe(true);
    expect(
      f.seen.filter((call) => call.path === "/api/voice/status"),
    ).toHaveLength(2);
  });

  it("requires a paired responding World for commands but retains result recovery", async () => {
    const session = "c7ddc613-2c69-442d-9b33-75723b903bd8";
    const f = fixture(runtimeCapabilities("local"), {
      [`/api/world/${session}/status`]: { connected: false },
    });
    await expect(
      preflightOperation(f.api, "genobi_world", { action: "command" }),
    ).rejects.toThrow("No World tab");
    await expect(
      preflightOperation(f.api, "genobi_world", { action: "command", session }),
    ).rejects.toThrow("foreground");
    await preflightOperation(f.api, "genobi_world", {
      action: "result",
      session,
      id: "done",
    });
    expect(f.seen.some((call) => call.path.includes("/commands"))).toBe(false);
  });

  it("recognizes independently delivered media/export contracts without inventing support", async () => {
    expect(operationFeature("genobi_project_media_stage")).toBe(
      "projectMediaStaging",
    );
    expect(operationFeature("genobi_project_media_receipt")).toBe(
      "projectMediaStaging",
    );
    expect(operationFeature("genobi_project_media")).toBe(
      "projectMediaOperations",
    );
    const absent = fixture();
    expect(
      await diagnoseOperation(absent.api, "genobi_export", {}),
    ).toMatchObject({ supported: null, ready: false });
    const source = { kind: "scrolls", id: "scroll-id", revision: 3 };
    const f = fixture(
      {
        schemaVersion: 1,
        runtime: "local",
        features: { browserExport: { supported: true } },
      },
      {
        "/api/exports/targets": {
          targets: [{ tabId: "tab-id", source, formats: ["scroll-zip"] }],
        },
      },
    );
    const args = {
      action: "request",
      tabId: "tab-id",
      source,
      format: "scroll-zip",
    };
    expect(await diagnoseOperation(f.api, "genobi_export", args)).toMatchObject(
      { ready: true },
    );
    expect(
      await diagnoseOperation(f.api, "genobi_export", {
        ...args,
        source: { ...source, revision: 2 },
      }),
    ).toMatchObject({
      ready: false,
      reason: expect.stringContaining("changed"),
    });
    expect(
      await diagnoseOperation(f.api, "genobi_export", {
        ...args,
        format: "mp4",
      }),
    ).toMatchObject({
      ready: false,
      reason: expect.stringContaining("format"),
    });
    expect(
      await diagnoseOperation(f.api, "genobi_export", {
        ...args,
        tabId: "gone",
      }),
    ).toMatchObject({
      ready: false,
      next: expect.stringContaining("Headless"),
    });
    // A request UUID is not an export job id. Let the server resolve exact
    // replays before tab checks; a closed tab must not hide a completed receipt.
    f.seen.splice(0);
    await preflightOperation(f.api, "genobi_export", {
      ...args,
      tabId: "gone",
      requestId: "original",
    });
    expect(f.seen.map((call) => call.path)).toEqual(["/api/capabilities"]);
  });
});

it("refuses unsupported voice through both CLI and MCP before a transcription write", async () => {
  const f = fixture(runtimeCapabilities("hosted"));
  const directory = await mkdtemp(join(tmpdir(), "genobi-diagnose-"));
  const client = new Client({ name: "preflight-test", version: "1" });
  const server = createServer(f.api);
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(peer);
    await client.connect(transport);
    const answer = await client.callTool({
      name: "genobi_voice_transcribe",
      arguments: { sourceId: "voice" },
    });
    expect(answer.isError).toBe(true);
    expect(JSON.stringify(answer)).toContain("capability_unavailable");
    await expect(
      run(["voice-transcribe", "--input", '{"sourceId":"voice"}'], {
        env: {},
        store: new ProfileStore(directory),
        fetcher: f.fetcher,
      }),
    ).rejects.toThrow("capability_unavailable");
    expect(
      f.seen
        .filter((call) => call.method === "POST")
        .every((call) => call.path === "/api/activity"),
    ).toBe(true);
    expect(f.seen.some((call) => call.path === "/api/voice/transcribe")).toBe(
      false,
    );
  } finally {
    await client.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
