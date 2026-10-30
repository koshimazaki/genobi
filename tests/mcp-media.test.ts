import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { mediaTools } from "../mcp/media-tools";
import { createServer } from "../mcp/server";
import { GENOBI_TOOLS } from "../server/agent-runner";

// Dual Swords' MCP tools (#14) against a stand-in studio that records each
// request: the right route and body, results trimmed to what an agent needs,
// and inputs the server would refuse stopped before anything is sent.
const SESSION = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const derived = (id: string, mediaType?: "image" | "audio") => ({
  id,
  label: `Trim of ${id}`,
  url: `/api/clips/${id}`,
  width: 640,
  height: 360,
  duration: mediaType === "image" ? 0 : 2,
  origin: "derived",
  ...(mediaType ? { mediaType } : {}),
});

interface Seen {
  method: string;
  path: string;
  body: unknown;
}

async function connect() {
  const seen: Seen[] = [];
  const fetcher = (async (input: URL, init?: RequestInit) => {
    const path = new URL(input).pathname;
    const method = init?.method ?? "GET";
    const headers = { "Set-Cookie": `camera_session=${SESSION}; Path=/` };
    if (path === "/api/health") return Response.json({ ok: true }, { headers });
    // Optional tool history, off: answered as the studio does, and not part of
    // the media requests this test checks (tests/mcp-activity.test.ts does).
    if (path === "/api/activity")
      return Response.json({ recorded: false }, { headers });
    seen.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (path === "/api/media/tools") return Response.json({ ffmpeg: true });
    if (/^\/api\/media\/[^/]+\/probe$/.test(path))
      return Response.json({
        probe: {
          duration: 2,
          video: { width: 640, height: 360, fps: 24, codec: "h264" },
        },
      });
    if (path === "/api/media/frames")
      return Response.json(
        { sources: [derived("f1", "image"), derived("f2", "image")] },
        { status: 201 },
      );
    if (/^\/api\/media\/(trim|concat|crossfade|space)$/.test(path))
      return Response.json({ source: derived("cut") }, { status: 201 });
    return Response.json({ error: "Not found." }, { status: 404 });
  }) as typeof fetch;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(
    new GenobiApi(studioUrl("http://127.0.0.1:4317"), fetcher),
  ).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0].text;
    return result.isError ? { error: text } : JSON.parse(text);
  };
  return { call, seen };
}

const cut = {
  sourceId: "cut",
  label: "Trim of cut",
  kind: "video",
  width: 640,
  height: 360,
  duration: 2,
};

describe("Dual Swords MCP tools", () => {
  it("call the media routes with the request the server reads", async () => {
    const { call, seen } = await connect();
    expect(await call("genobi_media_tools")).toEqual({ ffmpeg: true });
    expect(await call("genobi_media_probe", { sourceId: "job-1" })).toEqual({
      duration: 2,
      video: { width: 640, height: 360, fps: 24, codec: "h264" },
    });
    expect(
      await call("genobi_media_frames", { sourceId: "job-1", times: [0, 1.5] }),
    ).toEqual([
      expect.objectContaining({ sourceId: "f1", kind: "image" }),
      expect.objectContaining({ sourceId: "f2", kind: "image" }),
    ]);
    expect(
      await call("genobi_media_trim", {
        sourceId: "job-1",
        start: 0.5,
        duration: 1,
      }),
    ).toEqual(cut);
    expect(
      await call("genobi_media_concat", { sourceIds: ["a", "b", "c"] }),
    ).toEqual(cut);
    expect(
      await call("genobi_media_crossfade", {
        sourceIds: ["a", "b"],
        duration: 0.5,
      }),
    ).toEqual(cut);
    const rooms = [
      { start: 0, end: 1, preset: "small_room", level: "high" },
      { start: 1, end: 2, preset: "cathedral" },
    ];
    expect(
      await call("genobi_media_space", { sourceId: "job-1", segments: rooms }),
    ).toEqual(cut);
    const grid = { bpm: 98.2, beatOffsetSeconds: 1.3, beatsPerBar: 4 };
    expect(
      await call("genobi_media_space", {
        sourceId: "job-1",
        segments: rooms,
        snap: "bar",
        grid,
      }),
    ).toEqual(cut);
    expect(seen).toEqual([
      { method: "GET", path: "/api/media/tools", body: undefined },
      { method: "GET", path: "/api/media/job-1/probe", body: undefined },
      {
        method: "POST",
        path: "/api/media/frames",
        body: { sourceId: "job-1", times: [0, 1.5] },
      },
      {
        method: "POST",
        path: "/api/media/trim",
        body: { sourceId: "job-1", start: 0.5, duration: 1 },
      },
      {
        method: "POST",
        path: "/api/media/concat",
        body: { sourceIds: ["a", "b", "c"] },
      },
      {
        method: "POST",
        path: "/api/media/crossfade",
        body: { sourceIds: ["a", "b"], duration: 0.5 },
      },
      {
        method: "POST",
        path: "/api/media/space",
        body: { sourceId: "job-1", segments: rooms },
      },
      {
        method: "POST",
        path: "/api/media/space",
        body: { sourceId: "job-1", segments: rooms, snap: "bar", grid },
      },
    ]);
  });

  it("refuse ids, times and counts the server would refuse, before any request", async () => {
    const { call, seen } = await connect();
    const bad: [string, Record<string, unknown>][] = [
      ["genobi_media_probe", { sourceId: "../job-1" }],
      ["genobi_media_probe", { sourceId: "a".repeat(81) }],
      ["genobi_media_probe", {}],
      ["genobi_media_frames", { sourceId: "job-1", times: [] }],
      ["genobi_media_frames", { sourceId: "job-1", times: [-1] }],
      ["genobi_media_frames", { sourceId: "job-1", times: [1201] }],
      [
        "genobi_media_frames",
        { sourceId: "job-1", times: Array.from({ length: 17 }, (_, i) => i) },
      ],
      ["genobi_media_frames", { sourceId: "job 1", times: [0] }],
      ["genobi_media_trim", { sourceId: "job-1", start: -0.1, duration: 1 }],
      ["genobi_media_trim", { sourceId: "job-1", start: 0, duration: 0.05 }],
      ["genobi_media_trim", { sourceId: "job-1", start: 0, duration: 1201 }],
      ["genobi_media_trim", { sourceId: "job-1", start: "0", duration: 1 }],
      ["genobi_media_concat", { sourceIds: ["a"] }],
      ["genobi_media_concat", { sourceIds: Array(9).fill("a") }],
      ["genobi_media_concat", { sourceIds: ["a", "b/c"] }],
      ["genobi_media_crossfade", { sourceIds: ["a"], duration: 1 }],
      ["genobi_media_crossfade", { sourceIds: ["a", "b", "c"], duration: 1 }],
      ["genobi_media_crossfade", { sourceIds: ["a", "b"], duration: 0.05 }],
      ["genobi_media_crossfade", { sourceIds: ["a", "b"], duration: 5.1 }],
      ["genobi_media_space", { sourceId: "job-1", segments: [] }],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: [{ start: 0, end: 1, preset: "outdoor_day" }],
        },
      ],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: [{ start: 0, end: 1, preset: "dual_delay" }],
        },
      ],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: [{ start: 0, end: 0.05, preset: "small_room" }],
        },
      ],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: [{ start: 0, end: 1, preset: "small_room", level: "max" }],
        },
      ],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: Array.from({ length: 17 }, (_, i) => ({
            start: i,
            end: i + 0.5,
            preset: "small_room",
          })),
        },
      ],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: [{ start: 0, end: 1, preset: "small_room" }],
          snap: "phrase",
        },
      ],
      [
        "genobi_media_space",
        {
          sourceId: "job-1",
          segments: [{ start: 0, end: 1, preset: "small_room" }],
          snap: "bar",
          grid: { bpm: 400 },
        },
      ],
    ];
    for (const [name, args] of bad)
      expect(
        (await call(name, args)).error,
        `${name} ${JSON.stringify(args)}`,
      ).toBeTruthy();
    expect(seen).toEqual([]);
  });

  it("are never paid; expose scoped export tools while preserving read-only hints", () => {
    expect(mediaTools.map((t) => t.name)).toEqual([
      "genobi_media_tools",
      "genobi_media_probe",
      "genobi_media_frames",
      "genobi_media_trim",
      "genobi_media_concat",
      "genobi_media_crossfade",
      "genobi_media_space",
    ]);
    for (const tool of mediaTools) {
      expect(tool.paid, tool.name).toBeUndefined();
      expect(tool.tags, tool.name).toContain("dual-editor");
      const reads = tool.annotations.readOnlyHint;
      expect(reads, tool.name).toBe(
        ["genobi_media_tools", "genobi_media_probe"].includes(tool.name),
      );
      expect(GENOBI_TOOLS.includes(tool.name), tool.name).toBe(
        !["genobi_media_crossfade", "genobi_media_space"].includes(tool.name),
      );
    }
  });
});
