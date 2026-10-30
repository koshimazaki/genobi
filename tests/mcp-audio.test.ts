import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { audioApp } from "./audio-harness";
import { clickTrack, fakeFfmpeg, wav16 } from "./audio-signals";
import { base } from "./house-template-fixtures";
import { uploadAudioFile } from "../mcp/audio-file";
import { summariseReport } from "../mcp/audio-tools";
import { analyseAudio } from "../shared/audio-analysis";
import { RATE } from "./audio-signals";

const hasMkfifo = (() => {
  try {
    execFileSync("sh", ["-c", "command -v mkfifo"], { stdio: "ignore" });
    return process.platform !== "win32";
  } catch {
    return false;
  }
})();

// genobi_audio_analysis over MCP against the real local server, with ffmpeg
// faked: a local file by path, an owned source, and a linked project's asset.
async function agent() {
  const ffmpeg = fakeFfmpeg();
  const studio = await audioApp(ffmpeg.run);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(new GenobiApi(studioUrl(studio.base))).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (
    args: Record<string, unknown>,
    name = "genobi_audio_analysis",
  ) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = result.content[0].text;
    return result.isError ? { error: text } : JSON.parse(text);
  };
  return { ...studio, ffmpeg, call, client };
}

describe("genobi_audio_analysis over MCP", () => {
  it("uploads a local file by path once, then analyses it", async () => {
    const { call, temporary, ffmpeg, store } = await agent();
    const file = path.join(temporary, "click.wav");
    await writeFile(file, wav16(clickTrack(98, 0.37, 20)));
    const { sourceId } = await call({ filePath: file }, "genobi_audio_upload");
    expect(await call({ filePath: file }, "genobi_audio_upload")).toEqual({
      sourceId,
    });
    const report = await call({ sourceId });
    expect(report.beatFound).toBe(true);
    expect(Math.abs(report.grid.bpm - 98)).toBeLessThan(1);
    expect(Math.abs(report.grid.firstBeatSeconds - 0.37)).toBeLessThan(0.01);
    expect(Object.keys(report.composition).sort()).toEqual([
      "beatOffsetSeconds",
      "beatsPerBar",
      "bpm",
    ]);
    expect(report.intensity.values).toHaveLength(200);
    const summary = await call({ sourceId, detail: "summary" });
    expect(summary.onsets).toMatchObject({
      counts: { hat: report.onsets.hat.length },
      truncated: false,
    });
    // One upload and one decode; the path stays in the agent.
    expect(store.data.sources).toHaveLength(1);
    expect(store.data.sources[0].label).toBe("Uploaded audio");
    expect(ffmpeg.calls.decodes).toBe(1);
  });

  it("uploads once when the same file is sent concurrently", async () => {
    const { call, temporary, store } = await agent();
    const file = path.join(temporary, "click.wav");
    await writeFile(file, wav16(clickTrack(98, 0.37, 5)));
    const ids = await Promise.all(
      [1, 2, 3].map(() => call({ filePath: file }, "genobi_audio_upload")),
    );
    expect(new Set(ids.map((r) => r.sourceId)).size).toBe(1);
    expect(store.data.sources).toHaveLength(1);
  });

  it("keeps one session when two files are uploaded at once on a fresh connection", async () => {
    const { call, temporary, store } = await agent();
    const files = [98, 128].map((bpm) => path.join(temporary, `${bpm}.wav`));
    await writeFile(files[0], wav16(clickTrack(98, 0.37, 6)));
    await writeFile(files[1], wav16(clickTrack(128, 0.1, 6)));
    const uploads = await Promise.all(
      files.map((filePath) => call({ filePath }, "genobi_audio_upload")),
    );
    expect(new Set(store.data.sources.map((s) => s.sessionId)).size).toBe(1);
    const reports = await Promise.all(
      uploads.map(({ sourceId }) => call({ sourceId })),
    );
    expect(reports.map((r) => Math.round(r.grid.bpm))).toEqual([98, 128]);
  });

  it("makes one session handshake for requests sent at once", async () => {
    const paths: string[] = [];
    const api = new GenobiApi(studioUrl("http://127.0.0.1:4317"), (async (
      url: URL,
      init?: RequestInit,
    ) => {
      const pathname = new URL(url).pathname;
      paths.push(
        `${pathname} ${new Headers(init?.headers).get("cookie") ?? "none"}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Response.json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": `camera_session=${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}; Path=/`,
          },
        },
      );
    }) as typeof fetch);
    await Promise.all([api.get("/api/history"), api.get("/api/projects")]);
    const cookie = `camera_session=${"a".repeat(8)}-aaaa-aaaa-aaaa-${"a".repeat(12)}`;
    expect(paths).toEqual([
      "/api/health none",
      `/api/history ${cookie}`,
      `/api/projects ${cookie}`,
    ]);
  });

  it.skipIf(!hasMkfifo)(
    "refuses a FIFO, or a link to one, at once instead of waiting for a writer",
    async () => {
      const { call, temporary } = await agent();
      const fifo = path.join(temporary, "pipe.wav");
      execFileSync("mkfifo", [fifo]);
      const link = path.join(temporary, "link.wav");
      await symlink(fifo, link);
      for (const filePath of [fifo, link]) {
        const began = Date.now();
        const { error } = await call({ filePath }, "genobi_audio_upload");
        expect(error).toContain("regular file");
        expect(error).not.toContain(temporary);
        expect(Date.now() - began).toBeLessThan(2000);
      }
    },
  );

  it("follows a link to a regular audio file", async () => {
    const { call, temporary } = await agent();
    const file = path.join(temporary, "click.wav");
    await writeFile(file, wav16(clickTrack(98, 0.37, 5)));
    const link = path.join(temporary, "linked.wav");
    await symlink(file, link);
    const { sourceId } = await call({ filePath: link }, "genobi_audio_upload");
    expect(sourceId).toMatch(/^[\w-]+$/);
  });

  it("drops a failed upload, so the next call sends the file again", async () => {
    const { temporary } = await agent();
    const file = path.join(temporary, "click.wav");
    await writeFile(file, wav16(clickTrack(98, 0.37, 5)));
    let posts = 0;
    const api = new GenobiApi(studioUrl("http://127.0.0.1:4317"), (async (
      url: URL,
    ) => {
      if (new URL(url).pathname === "/api/health")
        return Response.json({ ok: true });
      posts++;
      return posts === 1
        ? Response.json({ error: "Please wait." }, { status: 429 })
        : Response.json({ source: { id: "audio-1" } }, { status: 201 });
    }) as typeof fetch);
    await expect(uploadAudioFile(api, file)).rejects.toThrow("Please wait.");
    expect(await uploadAudioFile(api, file)).toBe("audio-1");
    expect(await uploadAudioFile(api, file)).toBe("audio-1");
    expect(posts).toBe(2);
  });

  it("marks the upload as a write and the analysis as read-only", async () => {
    const { client } = await agent();
    const { tools } = await client.listTools();
    const hints = (name: string) =>
      tools.find((t) => t.name === name)?.annotations;
    expect(hints("genobi_audio_upload")).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    });
    expect(hints("genobi_audio_analysis")).toMatchObject({
      readOnlyHint: true,
    });
    const analysis = tools.find((t) => t.name === "genobi_audio_analysis")!;
    expect(Object.keys(analysis.inputSchema.properties ?? {})).not.toContain(
      "filePath",
    );
  });

  it("refuses a bad path without echoing it", async () => {
    const { call, temporary } = await agent();
    const image = path.join(temporary, "secret-name.wav");
    await writeFile(image, new Uint8Array(4096).fill(7));
    for (const filePath of [
      "relative.wav",
      `${temporary}/missing\u0001.wav`,
      path.join(temporary, "missing.wav"),
      temporary,
      image,
    ]) {
      const { error } = await call({ filePath }, "genobi_audio_upload");
      expect(error).toBeTruthy();
      expect(error).not.toContain(temporary);
      expect(error).not.toContain("secret-name");
    }
    expect((await call({})).error).toContain("Name one audio input");
    expect(
      (await call({ sourceId: "abc", copyId: "song.abcdefghjk" })).error,
    ).toContain("Name one audio input");
  });

  it("analyses an owned source and a linked project's audio asset", async () => {
    const { call, upload, base: url, cookie, client } = await agent();
    const source = await upload(wav16(clickTrack(120, 0.1, 10)), "audio/wav");
    // The agent's session does not own the person's upload.
    expect((await call({ sourceId: source.id })).error).toContain("(not_found");
    const bundle = base();
    const { project } = bundle;
    for (const bytes of new Set(bundle.files.values()))
      await fetch(
        `${url}/api/projects/${project.id}/files/${createHash("sha256").update(bytes).digest("hex")}`,
        {
          method: "PUT",
          headers: { cookie, "Content-Type": "application/octet-stream" },
          body: bytes,
        },
      );
    await fetch(`${url}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevision: null, project, brief: null }),
    });
    const { code } = await (
      await fetch(`${url}/api/projects/${project.id}/link`, {
        method: "POST",
        headers: { cookie },
      })
    ).json();
    const linked = (await client.callTool({
      name: "genobi_link_project",
      arguments: { code: String(code) },
    })) as { content: { text: string }[] };
    const { copyId } = JSON.parse(linked.content[0].text);
    const report = await call({ copyId, assetId: "audio" });
    expect(report.durationSeconds).toBeGreaterThan(0);
    expect((await call({ copyId, assetId: "video" })).error).toContain(
      "not_audio",
    );
    expect((await call({ copyId, assetId: "nope" })).error).toContain(
      "asset_missing",
    );
  });

  it("keeps the truncation flags in a summary, for both analyses", () => {
    const report = analyseAudio(clickTrack(120, 0.1, 10), RATE);
    const capped = {
      ...report,
      onsets: { ...report.onsets, truncated: true },
      librosa: {
        status: "used" as const,
        onsets: { kick: [0.1], snare: [], hat: [], truncated: true },
      },
    };
    const summary = summariseReport(capped);
    expect(summary.onsets.truncated).toBe(true);
    expect(summary.librosa.onsets).toMatchObject({
      truncated: true,
      counts: { kick: 1 },
    });
    expect(summariseReport(report).onsets.truncated).toBe(false);
  });
});
