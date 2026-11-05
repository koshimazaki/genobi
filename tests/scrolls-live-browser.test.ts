import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createScroll } from "../shared/scrolls/commands";
import { scrollLiveAdapter } from "../src/scrolls/live-agent";
import { startScrollLiveBridge } from "../src/scrolls/live-bridge";
import type { useScrolls } from "../src/scrolls/useScrolls";
import type { ScrollBundle } from "../src/scrolls/files";
import type { LiveScrollStatus } from "../shared/scrolls/live";
function mounted() {
  let mountId = randomUUID();
  let bundle: ScrollBundle = {
      document: createScroll("storyboard", 2, "live-browser"),
      files: new Map(),
    },
    cell: string | null = "cell-1";
  const state = {
    currentMount: () => mountId,
    current: () => bundle,
    currentCell: () => cell,
    setSelectedCell: (value: string | null) => {
      cell = value;
    },
    commit: (next: ScrollBundle, before: ScrollBundle) => {
      if (bundle !== before) throw Error("Changed");
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
    setMessage: vi.fn(),
  } as unknown as ReturnType<typeof useScrolls>;
  const adapter = scrollLiveAdapter(() => state);
  const request = {
    requestId: randomUUID(),
    tabId: randomUUID(),
    context: adapter.snapshot().context,
    command: { op: "brief", revision: 0, prompt: "Original cell conversation" },
  };
  return {
    adapter,
    request,
    state,
    reopen: () => {
      mountId = randomUUID();
    },
    switch: () => {
      bundle = {
        ...bundle,
        document: createScroll("storyboard", 2, "different"),
      };
    },
  };
}
afterEach(() => vi.useRealTimers());
it("guards the actual document and cell again at execution, including disappeared cells", async () => {
  const s = mounted();
  s.state.setSelectedCell("cell-2");
  await expect(s.adapter.execute(s.request)).rejects.toThrow(
    "selected cell changed",
  );
  s.state.setSelectedCell("cell-1");
  const result = await s.adapter.execute(s.request);
  expect(result.document).toMatchObject({
    revision: 1,
    prompt: "Original cell conversation",
  });
  await expect(s.adapter.execute(s.request)).rejects.toThrow("changed");
  const other = mounted();
  other.switch();
  await expect(other.adapter.execute(other.request)).rejects.toThrow("changed");
  const reopened = mounted();
  reopened.reopen();
  await expect(reopened.adapter.execute(reopened.request)).rejects.toThrow(
    "reopened",
  );
  const absent = mounted();
  absent.state.setSelectedCell("removed-cell");
  await expect(absent.adapter.execute(absent.request)).rejects.toThrow(
    "snapshot",
  );
});
it("resends a lost acknowledgement without applying the same edit twice", async () => {
  vi.useFakeTimers();
  const s = mounted(),
    execute = vi.fn(s.adapter.execute);
  const job: LiveScrollStatus = {
    id: randomUUID(),
    request: s.request,
    state: "running",
  };
  let acknowledgements = 0;
  const fetcher = (async (url: string | URL | Request) => {
    if (String(url).endsWith("/poll")) return Response.json({ job });
    acknowledgements++;
    if (acknowledgements === 1) throw new Error("Lost acknowledgement");
    job.state = "done";
    return Response.json(job);
  }) as typeof fetch;
  const stop = startScrollLiveBridge(
    s.request.tabId,
    s.request.context.documentId,
    { ...s.adapter, execute },
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(6000);
  expect(execute).toHaveBeenCalledOnce();
  expect(acknowledgements).toBe(2);
  expect(s.adapter.snapshot().document.revision).toBe(1);
  stop();
});

it("does not announce an old handoff after the connection was stopped", async () => {
  vi.useFakeTimers();
  const s = mounted(),
    status = vi.fn();
  const job: LiveScrollStatus = {
    id: randomUUID(),
    request: s.request,
    state: "running",
  };
  let acknowledge!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    acknowledge = resolve;
  });
  const fetcher = (async (url: string | URL | Request) =>
    String(url).endsWith("/poll")
      ? Response.json({ job })
      : pending) as typeof fetch;
  const stop = startScrollLiveBridge(
    s.request.tabId,
    s.request.context.documentId,
    { ...s.adapter, status },
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(0);
  stop();
  acknowledge(Response.json({ ...job, state: "done" }));
  await vi.advanceTimersByTimeAsync(0);
  expect(status).not.toHaveBeenCalled();
});
