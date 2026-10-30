import { describe, expect, it } from "vitest";
import type { Job, Source } from "../shared/types";
import { trackJob } from "../src/track-job";

// A chain stage handed to the poller: registered by its own read, and, when
// first read as Ready, measured through history so its upscale can be priced.
const job = (status: Job["status"], extra: Partial<Job> = {}) =>
  ({ id: "stage-1", generator: "video", status, ...extra }) as Job;
const clip = {
  id: "stage-1",
  mediaType: "video",
  origin: "generated",
  width: 1280,
  height: 720,
  duration: 5,
} as Source;

function harness(read: Job, { failReads = 0, failRefreshes = 0 } = {}) {
  const jobs: Job[] = [];
  let sources: Source[] = [];
  const calls = { reads: 0, refreshes: 0 };
  const track = () =>
    trackJob({
      id: "stage-1",
      jobs,
      sources,
      readJob: async () => {
        calls.reads++;
        if (failReads-- > 0) throw new Error("Failed to fetch");
        return read;
      },
      add: (item) => jobs.push(item),
      refresh: async () => {
        calls.refreshes++;
        if (failRefreshes-- > 0) throw new Error("History is unavailable.");
        sources = [clip];
      },
    });
  return { track, jobs, calls };
}

describe("a chain stage reaches the poller", () => {
  it("registers a running stage by its own read, with no history read", async () => {
    const { track, jobs, calls } = harness(job("Generating"));
    expect(await track()).toBe(true);
    expect(jobs.map((item) => item.id)).toEqual(["stage-1"]);
    expect(calls).toEqual({ reads: 1, refreshes: 0 });
  });

  it("measures a stage first read as Ready, so the review can quote it", async () => {
    const { track, calls } = harness(job("Ready"));
    expect(await track()).toBe(true);
    expect(calls).toEqual({ reads: 1, refreshes: 1 });
  });

  it("answers false on a failed read or refresh, and finishes on a retry", async () => {
    const failing = harness(job("Ready"), { failRefreshes: 1 });
    expect(await failing.track()).toBe(false);
    // Registered already: the retry only reads history again.
    expect(await failing.track()).toBe(true);
    expect(failing.calls).toEqual({ reads: 1, refreshes: 2 });
    // Measured now: nothing more to read.
    expect(await failing.track()).toBe(true);
    expect(failing.calls).toEqual({ reads: 1, refreshes: 2 });

    const unread = harness(job("Generating"), { failReads: 1 });
    expect(await unread.track()).toBe(false);
    expect(unread.jobs).toEqual([]);
    expect(await unread.track()).toBe(true);
  });

  it("does not read history for a take with no clip to measure", async () => {
    for (const read of [
      job("Ready", { mediaAvailable: false }),
      job("Ready", { generator: "image" }),
      job("Error"),
    ]) {
      const { track, calls } = harness(read);
      expect(await track()).toBe(true);
      expect(calls.refreshes).toBe(0);
    }
  });
});
