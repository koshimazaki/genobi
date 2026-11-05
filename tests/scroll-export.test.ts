import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { setup } from "./server-harness";
import { createScroll } from "../shared/scrolls/commands";
import { addFile, openScroll } from "../src/scrolls/bundle";
import { scrollArchiveBytes, scrollJsonBytes } from "../src/scrolls/archive";
import { scrollExportAdapter } from "../src/scrolls/agent-export";
import type { useScrolls } from "../src/scrolls/useScrolls";
import type { ScrollBundle } from "../src/scrolls/files";
import { GenobiApi } from "../mcp/api";
import { exportTools } from "../mcp/export-tools";
import { wav } from "./audio-fixtures";
import { AGENT_MARK_HEADER } from "../shared/agent-session-events";

async function prepared() {
  const s = await setup();
  const agent = (await fetch(`${s.base}/api/health`)).headers
    .get("set-cookie")!
    .split(";")[0];
  const send = async (
    route: string,
    body?: unknown,
    cookie = s.cookie,
    marked = false,
  ) => {
    const response = await fetch(`${s.base}/api/exports${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        ...(marked ? { [AGENT_MARK_HEADER]: "1" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  const bundle: ScrollBundle = {
    document: createScroll("storyboard", 2, "export-scroll"),
    files: new Map(),
  };
  const source = {
    kind: "scrolls" as const,
    id: bundle.document.id,
    revision: bundle.document.revision,
  };
  const {
    data: { tabId },
  } = await send("/tabs", source);
  const api = new GenobiApi(new URL(s.base), (url, init) =>
    fetch(url, { ...init, headers: { ...init?.headers, cookie: agent } }),
  );
  const link = async (currentSource = source) => {
    const {
      data: { code },
    } = await send(`/tabs/${tabId}/link`, currentSource);
    return exportTools[0].run(api, { action: "link", code });
  };
  return { ...s, send, agent, tabId, source, bundle, link, api };
}

it("links only one Scroll tab, consumes codes once and refuses agent browser dispatch", async () => {
  const s = await prepared();
  const second = (await s.send("/tabs", { ...s.source, id: "second-scroll" }))
    .data.tabId;
  expect((await s.send("/targets", undefined, s.agent)).data.targets).toEqual(
    [],
  );
  expect(
    (await s.send(`/tabs/${s.tabId}/link`, s.source, s.cookie, true)).status,
  ).toBe(403);
  expect((await s.send("/tabs", s.source, s.cookie, true)).status).toBe(403);
  expect(
    (
      await s.send(`/tabs/${s.tabId}/link`, {
        ...s.source,
        revision: s.source.revision + 1,
      })
    ).status,
  ).toBe(409);
  const {
    data: { code },
  } = await s.send(`/tabs/${s.tabId}/link`, s.source);
  expect(
    (await s.send(`/tabs/${s.tabId}/link`, s.source, s.agent)).status,
  ).toBe(404);
  expect((await s.send("/link", { code }, s.agent)).data).toMatchObject({
    tabId: s.tabId,
    formats: ["scroll-zip", "scroll-json"],
  });
  expect((await s.send("/link", { code }, s.agent)).status).toBe(404);
  expect(
    (await s.send("/targets", undefined, s.agent)).data.targets.map(
      (t: { tabId: string }) => t.tabId,
    ),
  ).toEqual([s.tabId]);
  const request = {
    requestId: randomUUID(),
    tabId: second,
    source: { ...s.source, id: "second-scroll" },
    format: "scroll-json",
  };
  expect((await s.send("", request, s.agent)).status).toBe(404);
  expect(
    (
      await s.send(
        "",
        { ...request, tabId: s.tabId, source: s.source, format: "mp4" },
        s.agent,
      )
    ).status,
  ).toBe(400);
  expect(
    (await s.send(`/tabs/${s.tabId}/poll`, s.source, s.cookie, true)).status,
  ).toBe(403);
  expect(
    (await s.send(`/tabs/${s.tabId}/poll`, { ...s.source, id: "changed" }))
      .status,
  ).toBe(409);
});

it.each(["scroll-json", "scroll-zip"] as const)(
  "exports %s through MCP and reopens receipt bytes with original source and media",
  { timeout: 15_000 },
  async (format) => {
    const s = await prepared();
    let bundle = await addFile(
      s.bundle,
      new File([await readFile("public/scrolls/creature.png")], "creature.png"),
      "character",
    );
    bundle = await addFile(bundle, new File([wav(1)], "rhythm.wav"), "audio");
    bundle.document.prompt = "Keep the original creature and rhythm.";
    const source = { ...s.source, revision: bundle.document.revision };
    await s.send(`/tabs/${s.tabId}/poll`, source);
    await s.link(source);
    const request = {
      action: "request",
      requestId: randomUUID(),
      tabId: s.tabId,
      source,
      format,
    };
    const job = (await exportTools[0].run(s.api, request)) as { id: string };
    await s.send(`/tabs/${s.tabId}/poll`, source);
    const bytes =
      format === "scroll-json"
        ? scrollJsonBytes(bundle.document)
        : await scrollArchiveBytes(bundle);
    const response = await fetch(`${s.base}/api/exports/${job.id}/artifact`, {
      method: "POST",
      headers: {
        cookie: s.cookie,
        "Content-Type":
          format === "scroll-json" ? "application/json" : "application/zip",
      },
      body: bytes,
    });
    expect(response.status).toBe(200);
    const done = await response.json();
    expect(done.receipt).toMatchObject({
      source,
      format,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    const download = await fetch(`${s.base}${done.receipt.download}`, {
      headers: { cookie: s.agent },
    });
    const actual = new Uint8Array(await download.arrayBuffer());
    // Native byte equality avoids blocking the event loop while Vitest walks
    // a multi-megabyte image, which can expire an idle HTTP connection in CI.
    expect(Buffer.from(actual).equals(Buffer.from(bytes))).toBe(true);
    const restored = await openScroll(
      new File(
        [actual],
        format === "scroll-json" ? "scroll.json" : "scroll.zip",
      ),
      format === "scroll-json" ? bundle : undefined,
    );
    expect(restored.document).toEqual(bundle.document);
    expect([...restored.files.keys()]).toEqual([...bundle.files.keys()]);
    for (const [path, bytes] of bundle.files)
      expect(
        Buffer.from(restored.files.get(path)!).equals(Buffer.from(bytes)),
      ).toBe(true);
    expect(await exportTools[0].run(s.api, request)).toEqual(done);
    expect(s.bfl.submissions).toBe(0);
  },
);

it("does not accept a different source or broken media and keeps completed JSON replay after restart", async () => {
  const s = await prepared();
  await s.link();
  const request = {
    requestId: randomUUID(),
    tabId: s.tabId,
    source: s.source,
    format: "scroll-json",
  };
  const job = (await s.send("", request, s.agent)).data;
  await s.send(`/tabs/${s.tabId}/poll`, s.source);
  const other = createScroll("storyboard", 2, "other-scroll");
  const invalid = await fetch(`${s.base}/api/exports/${job.id}/artifact`, {
    method: "POST",
    headers: { cookie: s.cookie, "Content-Type": "application/json" },
    body: scrollJsonBytes(other),
  });
  expect(invalid.status).toBe(422);
  expect(
    (await s.send(`/${job.id}`, undefined, s.agent)).data.receipt,
  ).toBeUndefined();
  const goodRequest = { ...request, requestId: randomUUID() };
  const good = (await s.send("", goodRequest, s.agent)).data;
  await s.send(`/tabs/${s.tabId}/poll`, s.source);
  await fetch(`${s.base}/api/exports/${good.id}/artifact`, {
    method: "POST",
    headers: { cookie: s.cookie, "Content-Type": "application/json" },
    body: scrollJsonBytes(s.bundle.document),
  });
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
    body: JSON.stringify(goodRequest),
  });
  expect(await replay.json()).toMatchObject({
    state: "done",
    receipt: { format: "scroll-json" },
  });
  const bundle = await addFile(
    s.bundle,
    new File([await readFile("public/scrolls/creature.png")], "image.png"),
    "panel",
  );
  bundle.files.set(bundle.document.assets[0].file.path, new Uint8Array([1]));
  await expect(scrollArchiveBytes(bundle)).rejects.toThrow(/changed media/);
});

it("does not publish bytes after a human edit or cancellation during Scroll packaging", async () => {
  let bundle: ScrollBundle = {
    document: createScroll("storyboard", 2, "guarded-scroll"),
    files: new Map(),
  };
  bundle = await addFile(
    bundle,
    new File([await readFile("public/scrolls/creature.png")], "creature.png"),
    "character",
  );
  const state = {
    current: () => bundle,
    run: async (task: () => Promise<void>) => {
      await task();
      return true;
    },
  } as ReturnType<typeof useScrolls>;
  const adapter = scrollExportAdapter(() => state);
  const request = {
    requestId: randomUUID(),
    tabId: randomUUID(),
    source: adapter.source()!,
    format: "scroll-zip" as const,
  };
  const pending = adapter.execute(request, () => {}, new AbortController());
  bundle = {
    ...bundle,
    document: { ...bundle.document, revision: bundle.document.revision + 1 },
  };
  await expect(pending).rejects.toThrow(/changed while/);
  const controller = new AbortController();
  controller.abort();
  await expect(
    adapter.execute(
      { ...request, source: adapter.source()! },
      () => {},
      controller,
    ),
  ).rejects.toThrow();
});
