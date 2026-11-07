import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { studio } from "./project-copy-harness";
import { setup } from "./server-harness";
import { base } from "./house-template-fixtures";
import { archiveBundle } from "../src/director/bundle";
import { BrowserExports } from "../server/browser-exports";
import { MemoryProjects } from "../server/memory-projects";
import type { ExportStatus, ExportSource } from "../shared/browser-export";
import { GenobiApi } from "../mcp/api";
import { exportTools } from "../mcp/export-tools";

async function prepared() {
  const s = await studio();
  await s.upload(s.cookie);
  await s.push(s.cookie, null, 1);
  const agent = await s.fresh();
  const stranger = await s.fresh();
  const { code } = await s.send(s.cookie, `/${s.project.id}/link`, "POST");
  await s.send(agent, "/link", "POST", { code });
  const source: ExportSource = {
    kind: "director",
    id: s.project.id,
    revision: 1,
  };
  const send = async (
    route: string,
    body?: unknown,
    cookie = s.cookie,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const response = await fetch(`${s.base}/api/exports${route}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  const {
    data: { tabId },
  } = await send("/tabs", source);
  const request = (format: "mp4" | "project-zip" = "project-zip") => ({
    requestId: randomUUID(),
    tabId,
    source,
    format,
  });
  const finish = (id: string, bytes: Uint8Array, cookie = s.cookie) =>
    fetch(`${s.base}/api/exports/${id}/artifact`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/zip" },
      body: new Uint8Array(bytes),
    });
  return { ...s, source, agent, stranger, tabId, request, send, finish };
}

it("authorizes linked targets, binds exact revisions and serializes each browser", async () => {
  const s = await prepared();
  expect(
    (await s.send("/targets", undefined, s.stranger)).data.targets,
  ).toEqual([]);
  expect(
    (await s.send("/targets", undefined, s.agent)).data.targets,
  ).toHaveLength(1);
  expect((await s.send("/tabs", s.source, s.agent)).status).toBe(409);
  expect((await s.send("", s.request(), s.stranger)).status).toBe(404);
  expect(
    (
      await s.send(
        "",
        { ...s.request(), source: { ...s.source, revision: 0 } },
        s.agent,
      )
    ).status,
  ).toBe(409);
  // Export heartbeats are unpaid; they must not consume the eight-submit ceiling.
  for (let i = 0; i < 12; i++)
    expect((await s.send(`/tabs/${s.tabId}/poll`, s.source)).status).toBe(200);
  const request = s.request();
  const job = (await s.send("", request, s.agent)).data as ExportStatus;
  expect(job).toMatchObject({ state: "queued", progress: 0 });
  expect(job.receipt).toBeUndefined();
  expect((await s.send("", request, s.agent)).data).toEqual(job);
  expect(
    (await s.send("", { ...request, format: "mp4" }, s.agent)).status,
  ).toBe(409);
  expect((await s.send("", s.request(), s.agent)).status).toBe(409);
  expect((await s.send(`/${job.id}`, undefined, s.stranger)).status).toBe(404);
  expect(
    (await s.send(`/tabs/${s.tabId}/poll`, s.source, s.agent)).status,
  ).toBe(404);
  expect((await s.send(`/tabs/${s.tabId}/poll`, s.source)).data.job.state).toBe(
    "running",
  );
  expect(
    (
      await s.send(
        `/${job.id}/progress`,
        { state: "running", progress: 0.8 },
        s.agent,
      )
    ).status,
  ).toBe(404);
  await s.send(`/${job.id}/progress`, { state: "running", progress: 0.8 });
  expect(
    (await s.send(`/${job.id}/progress`, { state: "running", progress: 0.2 }))
      .data.progress,
  ).toBe(0.8);
  expect(
    (await s.send(`/tabs/${s.tabId}/poll`, { ...s.source, revision: 2 })).data
      .job,
  ).toMatchObject({
    state: "error",
    error: expect.stringMatching(/source changed/i),
  });
});

it("cancels before completion, fails disconnected tabs and never gives invalid bytes a receipt", async () => {
  const s = await prepared();
  const first = (await s.send("", s.request(), s.agent)).data;
  await s.send(`/${first.id}/cancel`, {}, s.agent);
  expect((await s.finish(first.id, new Uint8Array([1]))).status).toBe(409);
  const next = (await s.send("", s.request(), s.agent)).data;
  await s.send(`/tabs/${s.tabId}/poll`, s.source);
  expect((await s.finish(next.id, new Uint8Array([1]))).status).toBe(422);
  expect((await s.send(`/${next.id}`, undefined, s.agent)).data).toMatchObject({
    state: "error",
  });
  expect(
    (await s.send(`/${next.id}`, undefined, s.agent)).data.receipt,
  ).toBeUndefined();
  const last = (await s.send("", s.request(), s.agent)).data;
  await s.send(`/tabs/${s.tabId}`, undefined, s.cookie, "DELETE");
  expect((await s.send(`/${last.id}`, undefined, s.agent)).data.state).toBe(
    "error",
  );
});

it.each(["project-zip", "mp4"] as const)(
  "validates and stores %s bytes, privately downloads them and replays completed requests after restart",
  { timeout: 15_000 },
  async (format) => {
    const s = await prepared();
    const bundle = base();
    bundle.project.revision = 1;
    const bytes =
      format === "project-zip"
        ? await archiveBundle(bundle)
        : await readFile("tests/fixtures/metadata.mp4");
    const request = s.request(format);
    const job = (await s.send("", request, s.agent)).data;
    await s.send(`/tabs/${s.tabId}/poll`, s.source);
    expect((await s.finish(job.id, bytes, s.agent)).status).toBe(404);
    const result = await s.finish(job.id, bytes);
    expect(result.status).toBe(200);
    const done = await result.json();
    expect(done).toMatchObject({
      state: "done",
      progress: 1,
      receipt: {
        source: s.source,
        format,
        byteLength: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    expect((await s.finish(job.id, bytes)).status).toBe(200);
    expect((await s.finish(job.id, new Uint8Array([1]))).status).toBe(409);
    const download = await fetch(`${s.base}${done.receipt.download}`, {
      headers: { cookie: s.agent },
    });
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(
      new Uint8Array(bytes),
    );
    expect(
      (
        await fetch(`${s.base}${done.receipt.download}`, {
          headers: { cookie: s.stranger },
        })
      ).status,
    ).toBe(404);
    const restarted = await setup(
      undefined,
      undefined,
      undefined,
      undefined,
      s.directory,
    );
    const replay = await fetch(`${restarted.base}/api/exports`, {
      method: "POST",
      headers: { cookie: s.agent, "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    expect(await replay.json()).toEqual(done);
    const api = new GenobiApi(new URL(s.base), (url, init) =>
      fetch(url, { ...init, headers: { ...init?.headers, cookie: s.agent } }),
    );
    const filePath = `${s.directory}/${job.id}.download`;
    await exportTools[0].run(api, {
      action: "download",
      id: job.id,
      filePath,
    });
    expect(await readFile(filePath)).toEqual(Buffer.from(bytes));
    await expect(
      exportTools[0].run(api, { action: "download", id: job.id, filePath }),
    ).rejects.toThrow(/exist/);
    expect(s.bfl.submissions).toBe(0);
  },
);

it("expires browser work and completed artifacts, detects corrupt disk bytes and metadata", async () => {
  const s = await prepared();
  let time = Date.now();
  const mockProjects = {
    directory: s.directory,
    list: () => [{ id: s.source.id, access: "owner", copyId: "copy" }],
    read: () => ({}),
  } as unknown as MemoryProjects;
  const service = new BrowserExports(mockProjects, () => time);
  await service.load();
  const { tabId } = service.connect("owner", s.source);
  const request = { ...s.request("mp4"), tabId };
  const expired = service.request("agent", request);
  time += 15_001;
  expect(service.status(expired.id, "agent").state).toBe("error");
  const live = service.connect("owner", s.source);
  const next = service.request("agent", {
    ...request,
    requestId: randomUUID(),
    tabId: live.tabId,
  });
  service.poll(live.tabId, "owner", s.source);
  const bytes = await readFile("tests/fixtures/metadata.mp4");
  await service.finish(next.id, "owner", bytes);
  await writeFile(service.artifacts.file(next.id), "broken");
  await expect(service.artifact(next.id, "agent")).rejects.toThrow(/changed/);
  const loaded = new BrowserExports(mockProjects, () => time);
  await loaded.load();
  expect(() => loaded.status(next.id, "agent")).toThrow(/not found/);
  time += 3_600_001;
  expect(() => service.status(expired.id, "agent")).toThrow(/not found/);
});

it("publishes no receipt until atomic storage finishes and refuses changed receipt metadata after restart", async () => {
  const s = await prepared();
  const projects = {
    directory: s.directory,
    list: () => [{ id: s.source.id, access: "owner", copyId: "copy" }],
    read: () => ({}),
  } as unknown as MemoryProjects;
  const service = new BrowserExports(projects);
  await service.load();
  const { tabId } = service.connect("owner", s.source);
  const job = service.request("agent", { ...s.request("mp4"), tabId });
  service.poll(tabId, "owner", s.source);
  const save = service.artifacts.save.bind(service.artifacts);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  service.artifacts.save = async (...args) => {
    await gate;
    return save(...args);
  };
  const pending = service.finish(
    job.id,
    "owner",
    await readFile("tests/fixtures/metadata.mp4"),
  );
  expect(service.status(job.id, "agent")).toMatchObject({ state: "storing" });
  expect(service.status(job.id, "agent").receipt).toBeUndefined();
  expect(service.cancel(job.id, "agent").state).toBe("storing");
  release();
  const done = await pending;
  expect(done.state).toBe("done");
  const record = service.artifacts.records.get(job.id)!;
  const metadata = `${s.directory}/browser-exports/${job.id}/receipt.json`;
  await writeFile(
    metadata,
    JSON.stringify({
      ...record,
      receipt: {
        ...record.receipt,
        download: "/api/exports/../../private/artifact",
      },
    }),
  );
  const restarted = new BrowserExports(projects);
  await restarted.load();
  expect(() => restarted.status(job.id, "agent")).toThrow(/not found/);
});

it("reports a full export store as storage_full, not as refused bytes", async () => {
  const s = await prepared();
  const projects = {
    directory: s.directory,
    list: () => [{ id: s.source.id, access: "owner", copyId: "copy" }],
    read: () => ({}),
  } as unknown as MemoryProjects;
  const service = new BrowserExports(projects);
  await service.load();
  const { tabId } = service.connect("owner", s.source);
  const job = service.request("agent", { ...s.request("mp4"), tabId });
  service.poll(tabId, "owner", s.source);
  const { AppError } = await import("../server/errors");
  service.artifacts.save = async () => {
    throw new AppError(413, "Export storage is full.", "export_storage_full");
  };
  await expect(
    service.finish(
      job.id,
      "owner",
      await readFile("tests/fixtures/metadata.mp4"),
    ),
  ).rejects.toMatchObject({ status: 413, code: "export_storage_full" });
  expect(service.status(job.id, "agent")).toMatchObject({ state: "error" });
});
