import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { startExportBridge } from "../src/browser-exports/bridge";
import type { ExportStatus, ExportSource } from "../shared/browser-export";

afterEach(() => vi.useRealTimers());
async function harness() {
  vi.useFakeTimers();
  let source: ExportSource = {
    kind: "director",
    id: "test-project",
    revision: 1,
  };
  const job: ExportStatus = {
    id: randomUUID(),
    state: "running",
    progress: 0,
    request: {
      requestId: randomUUID(),
      tabId: randomUUID(),
      source: { ...source },
      format: "project-zip",
    },
  };
  let complete: (value: Blob) => void = () => {};
  let controller: AbortController | undefined;
  const execute = vi.fn((_request, _progress, active) => {
    controller = active;
    return new Promise<Blob>((resolve, reject) => {
      complete = resolve;
      active.signal.addEventListener("abort", () =>
        reject(new Error("Aborted")),
      );
    });
  });
  const status = vi.fn();
  let uploads = 0;
  let loseAnswer = false;
  const fetcher = vi.fn(async (url, init) => {
    const route = String(url).replace("/api/exports", "");
    if (route === "/tabs") return Response.json({ tabId: job.request.tabId });
    if (route.endsWith("/poll")) return Response.json({ job });
    if (init?.method === "DELETE") return Response.json({ disconnected: true });
    if (route.endsWith("/artifact")) {
      uploads++;
      job.state = "done";
      if (loseAnswer) throw new Error("Acknowledgement lost");
      return Response.json(job);
    }
    if (route.endsWith("/progress")) {
      if (job.state !== "done")
        Object.assign(job, JSON.parse(String(init?.body)));
      return Response.json(job);
    }
    throw new Error(`Unexpected ${route}`);
  }) as unknown as typeof fetch;
  const stop = startExportBridge(
    { source: () => source, execute, status },
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(0);
  return {
    job,
    execute,
    status,
    stop,
    finish: () => complete(new Blob(["test"], { type: "application/zip" })),
    controller: () => controller!,
    uploads: () => uploads,
    change: () => {
      source = { ...source, revision: 2 };
    },
    lose: () => {
      loseAnswer = true;
    },
  };
}

it("polls cancellation during encoding and never uploads a cancelled result", async () => {
  const h = await harness();
  expect(h.execute).toHaveBeenCalledOnce();
  h.job.state = "cancelled";
  await vi.advanceTimersByTimeAsync(2000);
  expect(h.controller().signal.aborted).toBe(true);
  expect(h.uploads()).toBe(0);
  h.stop();
});

it("rejects a changed source after packaging and disconnect aborts pending work", async () => {
  const h = await harness();
  h.change();
  h.finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.uploads()).toBe(0);
  expect(h.job.state).toBe("error");
  expect(h.job.error).toMatch(/source changed/);
  h.stop();
  const next = await harness();
  next.stop();
  expect(next.controller().signal.aborted).toBe(true);
});

it("reads the committed result after a lost upload answer without rendering or uploading twice", async () => {
  const h = await harness();
  h.lose();
  h.finish();
  await vi.advanceTimersByTimeAsync(6000);
  expect(h.job.state).toBe("done");
  expect(h.execute).toHaveBeenCalledOnce();
  expect(h.uploads()).toBe(1);
  expect(h.status).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: "done" }),
  );
  expect(h.status).toHaveBeenCalledTimes(2);
  h.stop();
});
