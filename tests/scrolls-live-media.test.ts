import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { studio } from "./project-copy-harness";
import { wav } from "./audio-fixtures";
import { createScroll } from "../shared/scrolls/commands";
import { scrollLiveAdapter } from "../src/scrolls/live-agent";
import { studioStore } from "../src/studio/store";
import type { useScrolls } from "../src/scrolls/useScrolls";
import type { ScrollBundle } from "../src/scrolls/files";
import type { LiveScrollStatus } from "../shared/scrolls/live";
import { GenobiApi } from "../mcp/api";
import { scrollsLiveTools } from "../mcp/scrolls-live-tools";
import { AGENT_MARK_HEADER } from "../shared/agent-session-events";

const nativeFetch = fetch;
afterEach(() => {
  vi.unstubAllGlobals();
  studioStore.setState({ director: { history: [], drafts: {} } });
});
async function prepared() {
  const s = await studio();
  await s.upload(s.cookie);
  await s.push(s.cookie, null, 1);
  const agent = await s.fresh(),
    stranger = await s.fresh();
  const { code } = await s.send(s.cookie, `/${s.project.id}/link`, "POST");
  const linked = await s.send(agent, "/link", "POST", { code });
  const copyId = (linked.project as { copyId: string }).copyId;
  let bundle: ScrollBundle = {
    document: createScroll("storyboard", 2, "live-media"),
    files: new Map(),
  };
  const state = {
    current: () => bundle,
    currentMount: () => "mount",
    currentCell: () => "cell-1",
    setSelectedCell: () => {},
    commit: (next: ScrollBundle, before: ScrollBundle) => {
      if (bundle !== before) throw Error("Scroll changed");
      bundle = next;
    },
    run: async (task: () => Promise<void>) => {
      try {
        await task();
        return true;
      } catch {
        return false;
      }
    },
    setMessage: () => {},
  } as unknown as ReturnType<typeof useScrolls>;
  const adapter = scrollLiveAdapter(() => state);
  const send = async (
    route: string,
    body?: unknown,
    cookie = s.cookie,
    marked = false,
  ) => {
    const response = await nativeFetch(`${s.base}/api/exports${route}`, {
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
  const source = { kind: "scrolls", id: bundle.document.id, revision: 0 };
  const {
    data: { tabId },
  } = await send("/tabs", source);
  await send(`/scrolls/tabs/${tabId}/poll`, adapter.snapshot());
  const {
    data: { code: scrollCode },
  } = await send(`/tabs/${tabId}/link`, source);
  await send("/link", { code: scrollCode }, agent);
  const api = new GenobiApi(new URL(s.base), (url, init) =>
    nativeFetch(url, { ...init, headers: { ...init?.headers, cookie: agent } }),
  );
  const tool = (args: Record<string, unknown>) =>
    scrollsLiveTools[0].run(api, args);
  const stage = async (
    bytes: Uint8Array<ArrayBuffer>,
    type: string,
    cookie = agent,
  ) => {
    const sha = createHash("sha256").update(bytes).digest("hex");
    const response = await nativeFetch(
      `${s.base}/api/projects/${copyId}/media/${sha}`,
      {
        method: "POST",
        headers: { cookie, "Content-Type": type },
        body: bytes,
      },
    );
    expect([200, 201]).toContain(response.status);
    return (await response.json()).receipt.receiptId as string;
  };
  const request = async (command: Record<string, unknown>) => {
    await send(`/scrolls/tabs/${tabId}/poll`, adapter.snapshot());
    return tool({
      action: "request",
      requestId: randomUUID(),
      tabId,
      context: adapter.snapshot().context,
      command: { revision: bundle.document.revision, ...command },
    }) as Promise<LiveScrollStatus>;
  };
  vi.stubGlobal("fetch", (url: string | URL | Request, init?: RequestInit) =>
    nativeFetch(new URL(String(url), s.base), {
      ...init,
      headers: { ...init?.headers, cookie: s.cookie },
    }),
  );
  const execute = async (job: LiveScrollStatus) => {
    const dispatched = await send(
      `/scrolls/tabs/${tabId}/poll`,
      adapter.snapshot(),
    );
    expect(dispatched.data.job.state).toBe("running");
    const snapshot = await adapter.execute(job.request, job);
    const result = await send(`/scrolls/commands/${job.id}/result`, {
      snapshot,
    });
    expect(result.status).toBe(200);
    return result.data as LiveScrollStatus;
  };
  return {
    ...s,
    agent,
    stranger,
    copyId,
    stage,
    request,
    execute,
    send,
    tool,
    adapter,
    state,
    tabId,
  };
}
it(
  "attaches inspected image/audio through the real service and hands selected panels to the actual Director store",
  { timeout: 15000 },
  async () => {
    const s = await prepared();
    const image = new Uint8Array(
      await readFile("docs/director-bundle/templates/poster-motion.png"),
    );
    const sha = await s.stage(image, "image/png");
    const job = await s.request({
      op: "attach-media",
      copyId: s.copyId,
      receiptId: sha,
      role: "panel",
      cellId: "cell-1",
      name: "Creature panel",
    });
    const attached = await s.execute(job);
    expect(attached.state).toBe("done");
    const assetId = attached.result!.attachment!.assetId;
    expect(attached.result!.availableAssetIds).toContain(assetId);
    expect(
      Buffer.from(s.state.current().files.values().next().value!).equals(
        Buffer.from(image),
      ),
    ).toBe(true);
    const replay = (await s.tool({
      action: "request",
      ...job.request,
    })) as LiveScrollStatus;
    expect(replay.id).toBe(job.id);
    expect(s.state.current().document.assets).toHaveLength(1);
    const audio = await s.stage(wav(2), "audio/wav"),
      sound = await s.execute(
        await s.request({
          op: "attach-media",
          copyId: s.copyId,
          receiptId: audio,
          role: "audio",
          name: "Rhythm",
        }),
      );
    const audioId = sound.result!.attachment!.assetId;
    await s.execute(await s.request({ op: "select", ids: [assetId] }));
    await s.execute(
      await s.request({
        op: "cell",
        cell: { ...s.state.current().document.cells[0], assetId },
      }),
    );
    await s.execute(
      await s.request({ op: "timing", timing: { enabled: true, audioId } }),
    );
    const handoffJob = await s.request({
      op: "handoff-director",
      director: s.adapter.snapshot().director,
    });
    const handed = await s.execute(handoffJob),
      receipt = handed.result!.handoff!;
    const actual = studioStore.getState().director.bundle!;
    expect(receipt).toEqual({
      destinationProjectId: actual.project.id,
      destinationRevision: actual.project.revision,
      assetIds: Object.keys(actual.project.assets),
      layerIds: actual.project.layers.map((l) => l.id),
    });
    expect(receipt.assetIds).toContain(assetId);
    expect(receipt.assetIds).toContain(audioId);
    expect(receipt.layerIds).toContain("scroll-shot-1");
    expect(
      (
        (await s.tool({
          action: "request",
          ...handoffJob.request,
        })) as LiveScrollStatus
      ).result!.handoff,
    ).toEqual(receipt);
    await expect(
      s.request({ op: "handoff-director", director: null }),
    ).rejects.toThrow("Director changed");
    const repeat = await s.request({
      op: "handoff-director",
      director: s.adapter.snapshot().director,
    });
    await expect(s.adapter.execute(repeat.request, repeat)).rejects.toThrow(
      "already has a Director draft",
    );
    expect(s.bfl.submissions).toBe(0);
  },
);
it("refuses foreign receipts, mismatched media kinds, missing cells and agent media dispatch", async () => {
  const s = await prepared();
  const bytes = wav(1),
    sha = await s.stage(bytes, "audio/wav", s.cookie);
  await expect(
    s.request({
      op: "attach-media",
      copyId: s.copyId,
      receiptId: sha,
      role: "audio",
      name: "Foreign",
    }),
  ).rejects.toThrow("receipt missing");
  await s.stage(bytes, "audio/wav");
  await expect(
    s.request({
      op: "attach-media",
      copyId: s.copyId,
      receiptId: sha,
      role: "panel",
      name: "Wrong kind",
    }),
  ).rejects.toThrow("accepts images");
  await expect(
    s.request({
      op: "attach-media",
      copyId: s.copyId,
      receiptId: sha,
      role: "panel",
      cellId: "gone",
      name: "Missing cell",
    }),
  ).rejects.toThrow("disappeared");
  const job = await s.request({
    op: "attach-media",
    copyId: s.copyId,
    receiptId: sha,
    role: "audio",
    name: "Sound",
  });
  await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.adapter.snapshot());
  expect(
    (await s.send(`/scrolls/commands/${job.id}/media`, undefined, s.agent))
      .status,
  ).toBe(404);
  expect(
    (
      await s.send(
        `/scrolls/commands/${job.id}/media`,
        undefined,
        s.cookie,
        true,
      )
    ).status,
  ).toBe(403);
  expect(s.state.current().document.assets).toHaveLength(0);
});

it("preserves human edits and cancellation while receipt bytes are in flight", async () => {
  const s = await prepared();
  const receiptId = await s.stage(wav(1), "audio/wav");
  const job = await s.request({
    op: "attach-media",
    copyId: s.copyId,
    receiptId,
    role: "audio",
    name: "Sound",
  });
  await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.adapter.snapshot());
  const fetcher = fetch;
  let release!: () => void, started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/media")) {
        started();
        await wait;
      }
      return fetcher(url, init);
    },
  );
  const pending = s.adapter.execute(job.request, job);
  await began;
  const before = s.state.current();
  s.state.commit(
    {
      ...before,
      document: {
        ...before.document,
        revision: before.document.revision + 1,
        prompt: "Human correction stays",
      },
    },
    before,
  );
  release();
  await expect(pending).rejects.toThrow("changed");
  expect(s.state.current().document).toMatchObject({
    prompt: "Human correction stays",
    assets: [],
  });
  const abort = new AbortController();
  abort.abort();
  await expect(
    s.adapter.execute(job.request, job, abort.signal),
  ).rejects.toThrow();
  expect(s.state.current().document.assets).toHaveLength(0);
});

it("refuses a handoff if its source is edited during Director preparation", async () => {
  const s = await prepared();
  const receiptId = await s.stage(
    new Uint8Array(
      await readFile("docs/director-bundle/templates/poster-motion.png"),
    ),
    "image/png",
  );
  const attached = await s.execute(
    await s.request({
      op: "attach-media",
      copyId: s.copyId,
      receiptId,
      role: "character",
      name: "Creature",
    }),
  );
  await s.execute(
    await s.request({
      op: "select",
      ids: [attached.result!.attachment!.assetId],
    }),
  );
  const job = await s.request({
    op: "handoff-director",
    director: s.adapter.snapshot().director,
  });
  await s.send(`/scrolls/tabs/${s.tabId}/poll`, s.adapter.snapshot());
  const pending = s.adapter.execute(job.request, job);
  const before = s.state.current();
  s.state.commit(
    {
      ...before,
      document: {
        ...before.document,
        revision: before.document.revision + 1,
        prompt: "Human correction during handoff",
      },
    },
    before,
  );
  await expect(pending).rejects.toThrow("changed");
  expect(studioStore.getState().director.bundle).toBeUndefined();
  expect(s.state.current().document.prompt).toBe(
    "Human correction during handoff",
  );
});
