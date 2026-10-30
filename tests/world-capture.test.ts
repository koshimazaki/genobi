// The paired agent's `capture` command: the schema, the server's file routes
// for a fixed take, the tab's refusals and the bridge's result. No browser,
// no encoder: the take is a fake with the shape `exportTake` returns.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { worldRouter } from "../server/world-routes";
import { worldCommand } from "../shared/world-control";
import { worldTools } from "../mcp/world-tools";
import {
  agentCapture,
  assertCanCapture,
  takeFiles,
  type CaptureGate,
} from "../src/world-builder/agent-capture";
import { connectWorld } from "../src/world-builder/agent-bridge";
import type { Take } from "../src/world-builder/export-take";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";

let server: Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
  vi.unstubAllGlobals();
});

function fixedTake(name: string, depth = true): Take {
  const blob = (text: string, type: string) => new Blob([text], { type });
  return {
    name,
    video: blob("colour", "video/webm"),
    first: blob("png", "image/png"),
    manifest: blob(
      JSON.stringify({
        frameCount: 145,
        duration: 145 / 24,
        passes: depth ? ["colour", "depth"] : ["colour"],
        recipe: { width: 1280, height: 704, fps: 24 },
      }),
      "application/json",
    ),
    ...(depth && {
      depth: blob("depth", "video/webm"),
      depthFirst: blob("depth png", "image/png"),
    }),
  };
}

const gate = (over: Partial<Record<keyof CaptureGate, unknown>> = {}) =>
  ({
    mode: () => over.mode ?? "shot",
    recording: () => over.recording ?? false,
    busy: () => over.busy ?? false,
    saving: () => over.saving ?? false,
  }) as CaptureGate;

describe("capture command", () => {
  it("parses a named capture and refuses names that are not file-safe", () => {
    expect(worldCommand.parse({ op: "capture", name: "fall-wide_01" })).toEqual(
      { op: "capture", name: "fall-wide_01" },
    );
    for (const name of ["", "../up", "a b", "-lead", "x".repeat(65)])
      expect(() => worldCommand.parse({ op: "capture", name })).toThrow();
    expect(() => worldCommand.parse({ op: "capture" })).toThrow();
  });

  it("refuses in Walk, while recording, while a take is made or added", async () => {
    expect(() => assertCanCapture(gate({ mode: "walk" }))).toThrow(
      "Return to Shot camera before capture.",
    );
    expect(() => assertCanCapture(gate({ recording: true }))).toThrow(
      "Stop live recording first.",
    );
    expect(() => assertCanCapture(gate({ busy: true }))).toThrow(
      "Stop preview or wait for the current operation.",
    );
    expect(() => assertCanCapture(gate({ saving: true }))).toThrow(
      "Wait for the take being added to assets.",
    );
    expect(() => assertCanCapture(gate({ mode: "edit" }))).not.toThrow();
    const capture = vi.fn(async (name: string) => fixedTake(name));
    await expect(
      agentCapture(gate({ mode: "walk" }), capture, async () => {}, "a"),
    ).rejects.toThrow(/Shot camera/);
    await expect(
      agentCapture(gate(), capture, async () => {}, "../a"),
    ).rejects.toThrow(/letters, digits/);
    expect(capture).not.toHaveBeenCalled();
  });

  it("names the take and resolves only once the library has kept it", async () => {
    let kept = false;
    const take = await agentCapture(
      gate(),
      async (name) => fixedTake(name),
      async () => {
        await new Promise((r) => setTimeout(r, 5));
        kept = true;
      },
      "hero",
    );
    expect(take.name).toBe("hero");
    expect(kept).toBe(true);
    expect(takeFiles(take).map(([f]) => f)).toEqual([
      "clip.webm",
      "first.png",
      "receipt.json",
      "depth.webm",
      "depth-first.png",
    ]);
  });

  it("runs through the paired bridge and returns the take's facts and paths", async () => {
    const calls: string[] = [];
    const results: unknown[] = [];
    let served = false;
    const adapter = {
      live: { stop: vi.fn() },
      captureTake: async (name: string) => fixedTake(name),
    } as unknown as SceneAdapter;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = (data: unknown) =>
          new Response(JSON.stringify(data), { status: 200 });
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/connect"))
          return body({ id: "w1", code: "c".repeat(32) });
        if (url.endsWith("/next")) {
          if (served) return body(null);
          served = true;
          return body({ id: "job", command: { op: "capture", name: "hero" } });
        }
        if (url.endsWith("/commands/job")) {
          results.push(JSON.parse(String(init?.body)));
          return body({ accepted: true });
        }
        const file = url.split("/files/")[1];
        if (file) return body({ path: url, bytes: 1 });
        return body({ cleared: true });
      }),
    );
    const link = await connectWorld(adapter, () => {});
    await vi.waitFor(() => expect(results).toHaveLength(1));
    link.disconnect();
    expect(results[0]).toMatchObject({
      state: "done",
      result: {
        name: "hero",
        frames: 145,
        width: 1280,
        height: 704,
        fps: 24,
        passes: ["colour", "depth"],
        audio: false,
        files: {
          "clip.webm": { path: "/api/world/w1/files/clip.webm" },
          "depth.webm": { path: "/api/world/w1/files/depth.webm" },
        },
      },
    });
    // The last take's files are cleared before this one's are uploaded.
    const del = calls.indexOf("DELETE /api/world/w1/files");
    expect(del).toBeGreaterThan(-1);
    expect(
      calls.findIndex((c) => c.startsWith("POST /api/world/w1/files/")),
    ).toBeGreaterThan(del);
  });

  it("reports a refusal as the command's error", async () => {
    const results: unknown[] = [];
    let served = false;
    const adapter = {
      live: { stop: vi.fn() },
      captureTake: (name: string) =>
        agentCapture(
          gate({ mode: "walk" }),
          async () => fixedTake(name),
          async () => {},
          name,
        ),
    } as unknown as SceneAdapter;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = (data: unknown) =>
          new Response(JSON.stringify(data), { status: 200 });
        if (url.endsWith("/connect"))
          return body({ id: "w1", code: "c".repeat(32) });
        if (url.endsWith("/next")) {
          if (served) return body(null);
          served = true;
          return body({ id: "job", command: { op: "capture", name: "hero" } });
        }
        if (url.endsWith("/commands/job"))
          results.push(JSON.parse(String(init?.body)));
        return body({});
      }),
    );
    const link = await connectWorld(adapter, () => {});
    await vi.waitFor(() => expect(results).toHaveLength(1));
    link.disconnect();
    expect(results[0]).toEqual({
      state: "error",
      result: { error: "Return to Shot camera before capture." },
    });
  });
});

describe("world file routes for a fixed take", () => {
  async function start() {
    const app = express();
    app.use((req, res, next) => {
      res.locals.sessionId = req.headers["x-test-owner"] ?? "owner";
      next();
    });
    app.use("/api/world", worldRouter());
    app.use(
      (
        error: { status?: number; message: string },
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => res.status(error.status ?? 500).json({ error: error.message }),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server!.once("listening", r));
    const port = (server.address() as { port: number }).port;
    return (path: string, owner = "owner", method = "GET", body?: BodyInit) =>
      fetch(`http://127.0.0.1:${port}/api/world${path}`, {
        method,
        headers: { "x-test-owner": owner, "Content-Type": "application/json" },
        body,
      });
  }

  it("queues capture, holds every pass, lists, serves and clears them", async () => {
    const call = await start();
    const { id, code } = await (
      await call("/connect", "owner", "POST", "{}")
    ).json();
    await call("/link", "agent", "POST", JSON.stringify({ code }));
    await call(`/${id}/next`); // the tab is polling
    const queued = await call(
      `/${id}/commands`,
      "agent",
      "POST",
      JSON.stringify({ op: "capture", name: "hero" }),
    );
    expect(queued.status).toBe(202);
    expect(
      (
        await call(
          `/${id}/commands`,
          "agent",
          "POST",
          JSON.stringify({ op: "capture", name: "../x" }),
        )
      ).status,
    ).toBe(400);
    expect(await (await call(`/${id}/next`)).json()).toMatchObject({
      command: { op: "capture", name: "hero" },
    });
    for (const file of [
      "clip.webm",
      "depth.webm",
      "depth-first.png",
      "audio.wav",
    ])
      expect(
        (await call(`/${id}/files/${file}`, "owner", "POST", "bytes")).status,
      ).toBe(200);
    expect(
      (await call(`/${id}/files/notes.txt`, "owner", "POST", "x")).status,
    ).toBe(400);
    const listed = await (await call(`/${id}/files`, "agent")).json();
    expect(listed.files.map((f: { file: string }) => f.file)).toEqual([
      "clip.webm",
      "depth.webm",
      "depth-first.png",
      "audio.wav",
    ]);
    expect(listed.files[1].path).toBe(`/api/world/${id}/files/depth.webm`);
    const wav = await call(`/${id}/files/audio.wav`, "agent");
    expect(wav.headers.get("content-type")).toContain("audio/wav");
    expect((await call(`/${id}/files`, "stranger")).status).toBe(404);
    // Only the tab clears its files.
    expect((await call(`/${id}/files`, "agent", "DELETE")).status).toBe(404);
    expect((await call(`/${id}/files`, "owner", "DELETE")).status).toBe(200);
    expect((await (await call(`/${id}/files`, "agent")).json()).files).toEqual(
      [],
    );
  });
});

describe("genobi_world download", () => {
  it("saves every listed pass into a new directory and refuses unknown names", async () => {
    const tool = worldTools.find((t) => t.name === "genobi_world")!;
    const session = "6f0c9a8e-2d4b-4c1a-9e3f-5b7d8c9a0e1f";
    const parent = await mkdtemp(join(tmpdir(), "world-capture-"));
    try {
      let listed = ["clip.webm", "first.png", "receipt.json", "depth.webm"];
      const api = {
        get: async () => ({ files: listed.map((file) => ({ file })) }),
        bytes: async () => new Uint8Array([1, 2, 3]),
      } as never;
      const directory = join(parent, "take");
      const result = (await tool.run(api, {
        action: "download",
        session,
        directory,
      })) as { files: string[] };
      expect(result.files).toHaveLength(4);
      expect((await readdir(directory)).sort()).toEqual([
        "clip.webm",
        "depth.webm",
        "first.png",
        "receipt.json",
      ]);
      listed = ["../escape.webm"];
      await expect(
        tool.run(api, {
          action: "download",
          session,
          directory: join(parent, "b"),
        }),
      ).rejects.toThrow("unknown file");
      listed = [];
      await expect(
        tool.run(api, {
          action: "download",
          session,
          directory: join(parent, "c"),
        }),
      ).rejects.toThrow("capture or record first");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
