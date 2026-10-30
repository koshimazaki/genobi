// Confirm before spending, review fixes: Approve honours the settings hold;
// a lost answer is read back with backoff until the outcome is known, never
// resent; an approved run reaches the gallery even when its first read
// fails; an upscale's plan shows what the upscale sends.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentApproval } from "../shared/agent-approval";
import { approvalPlan } from "../shared/agent-approval";
import type { AgentSession } from "../shared/agent-session";
import type { Job } from "../shared/types";
import { AgentApprovals, planLine } from "../src/agent/AgentApprovals";
import { ApprovalHeld, approveStep } from "../src/agent/api";
import {
  Recoveries,
  recoverApproval,
  recovering,
  recoverStep,
  resetRecoveriesForTests,
  onRecoveredSession,
} from "../src/agent/approval-recovery";
import { onApprovedJob } from "../src/agent/approved-jobs";
import {
  handOffApprovedJob,
  resetHandoffsForTests,
  retryPendingHandoffs,
  STUCK_AFTER,
  stuckHandoffs,
} from "../src/agent/approved-jobs";
import { useSettingsStore } from "../src/settings-store";
import { input } from "./server-harness";

afterEach(() => {
  resetRecoveriesForTests();
  resetHandoffsForTests();
  useSettingsStore.setState({ restoring: false, saving: {}, held: {} });
  vi.unstubAllGlobals();
});

const pending = (extra: Partial<AgentApproval> = {}): AgentApproval => ({
  quoteId: "0f6c3c2e-6b1a-4f0e-9a43-3d7b0f3c9a11",
  status: "pending",
  plan: {
    entry: "flux-3-video",
    label: "FLUX 3 · Video",
    generator: "video",
    model: "flux-3",
    description: "A vessel.",
    route: "bfl",
  },
  estimateUsd: 0.85,
  expiresAt: new Date(Date.now() + 9 * 60_000).toISOString(),
  payer: "server",
  ...extra,
});
const session = (approvals: AgentApproval[]): AgentSession => ({
  id: "s",
  runner: "claude",
  status: "waiting",
  prompt: "p",
  startedAt: "2026-10-22T12:00:00Z",
  lines: [],
  approvals,
});

describe("Approve and the settings hold", () => {
  it.each([
    [{ restoring: true }, "restoring", /being restored/],
    [{ saving: { "run-location": true } }, "saving", /being saved/],
    [{ held: { workflow: true } }, "checking", /checking the run location/],
  ] as const)(
    "%o refuses in the API and disables the button",
    async (state, hold, reason) => {
      useSettingsStore.setState(state);
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await expect(
        approveStep("s", pending().quoteId, pending().plan),
      ).rejects.toBeInstanceOf(ApprovalHeld);
      await expect(
        approveStep("s", pending().quoteId, pending().plan),
      ).rejects.toThrow(reason);
      expect(fetcher).not.toHaveBeenCalled();
      const html = renderToStaticMarkup(
        <AgentApprovals
          session={session([pending()])}
          onChange={() => {}}
          settingsHold={hold}
        />,
      );
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve \$0\.85/);
      expect(html).toMatch(reason);
    },
  );

  it("sends once the settings are confirmed", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ session: session([]), job: { id: "j" } }),
    );
    vi.stubGlobal("fetch", fetcher);
    await approveStep("s", pending().quoteId, pending().plan);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("recovering a lost approval answer", () => {
  it("reads back with backoff until the step leaves submitting", async () => {
    const answers: (() => AgentSession)[] = [
      () => {
        throw new Error("offline");
      },
      () => session([pending({ status: "submitting" })]),
      () => session([pending({ status: "submitting" })]),
      () => session([pending({ status: "started", jobId: "job-1" })]),
    ];
    const read = vi.fn(async () => answers.shift()!());
    const waits: number[] = [];
    const done = await recoverStep({
      sessionId: "s",
      quoteId: pending().quoteId,
      read,
      wait: async (ms) => void waits.push(ms),
    });
    expect(done?.approvals?.[0]).toMatchObject({
      status: "started",
      jobId: "job-1",
    });
    expect(read).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it("treats a step that is gone with no result as unknown, and reads on", async () => {
    const answers: AgentSession[] = [
      session([]),
      session([]),
      {
        ...session([]),
        results: [
          { quoteId: pending().quoteId, status: "started", jobId: "job-9" },
        ],
      },
    ];
    const read = vi.fn(async () => answers.shift()!);
    const done = await recoverStep({
      sessionId: "s",
      quoteId: pending().quoteId,
      read,
      wait: async () => {},
    });
    expect(read).toHaveBeenCalledTimes(3);
    expect(done?.results?.[0].jobId).toBe("job-9");
  });

  it("stops when the panel goes away", async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => {
      controller.abort();
      return session([pending({ status: "submitting" })]);
    });
    const done = await recoverStep({
      sessionId: "s",
      quoteId: pending().quoteId,
      read,
      wait: async () => {},
      signal: controller.signal,
    });
    expect(done).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("recoveries per step", () => {
  it("runs two side by side; each found run reaches the gallery", async () => {
    const first = pending({ quoteId: "q-1" });
    const second = pending({ quoteId: "q-2" });
    let reads = 0;
    // Both steps read as submitting until the fourth read.
    const read = vi.fn(async () =>
      ++reads < 4
        ? session([
            { ...first, status: "submitting" },
            { ...second, status: "submitting" },
          ])
        : session([
            { ...first, status: "started", jobId: "job-1" },
            { ...second, status: "started", jobId: "job-2" },
          ]),
    );
    const jobs: string[] = [];
    const active: string[][] = [];
    const recoveries = new Recoveries({
      sessionId: "s",
      read,
      onSession: () => {},
      onJob: (id) => jobs.push(id),
      onActive: (ids) => active.push(ids),
      wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    });
    recoveries.start("q-1");
    recoveries.start("q-2");
    recoveries.start("q-1"); // already recovering: not a second reader
    expect(recoveries.active()).toEqual(["q-1", "q-2"]);
    await vi.waitFor(() => expect(recoveries.active()).toEqual([]));
    expect(jobs.sort()).toEqual(["job-1", "job-2"]);
    expect(active[1]).toEqual(["q-1", "q-2"]);
  });

  it("stops every recovery when the panel closes", async () => {
    const read = vi.fn(async () =>
      session([pending({ status: "submitting" })]),
    );
    const jobs: string[] = [];
    const recoveries = new Recoveries({
      sessionId: "s",
      read,
      onSession: () => {},
      onJob: (id) => jobs.push(id),
      wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    });
    recoveries.start(pending().quoteId);
    recoveries.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(read.mock.calls.length).toBeLessThanOrEqual(2);
    expect(jobs).toEqual([]);
  });
});

describe("recovery outlives the bubble", () => {
  it("keeps reading while no view is open, and the job reaches the gallery", async () => {
    const step = pending({ quoteId: "q-lost" });
    let reads = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const read = vi.fn(async () => {
      if (++reads === 1) throw new Error("the answer was lost");
      await gate; // the bubble is tucked away meanwhile
      return reads < 3
        ? session([{ ...step, status: "submitting" }])
        : session([{ ...step, status: "started", jobId: "job-lost" }]);
    });
    const jobs: string[] = [];
    const stopJobs = onApprovedJob(({ id }) => jobs.push(id));
    const seen: AgentSession[] = [];
    const stopSessions = onRecoveredSession((s) => seen.push(s));
    // Approve's answer was lost: the step is handed to the long-lived owner.
    recoverApproval("s", "q-lost", {
      read,
      wait: () => new Promise((resolve) => setTimeout(resolve, 1)),
    });
    // The bubble closes and reopens: the view shows the recovery still on.
    const reopened = renderToStaticMarkup(
      <AgentApprovals
        session={session([{ ...step, status: "submitting" }])}
        onChange={() => {}}
      />,
    );
    expect(reopened).toContain("Checking what happened to this approval");
    // Starting it again from the reopened view is not a second reader.
    recoverApproval("s", "q-lost", { read });
    expect(recovering("s")).toEqual(["q-lost"]);
    release();
    await vi.waitFor(() => expect(jobs).toEqual(["job-lost"]));
    expect(recovering("s")).toEqual([]);
    expect(seen.at(-1)?.approvals?.[0].status).toBe("started");
    stopJobs();
    stopSessions();
  });
});

describe("a recovery that ends while the bubble is tucked away", () => {
  it("is what a reopened bubble shows: settled, with no Approve", async () => {
    const step = pending({ quoteId: "q-away" });
    const jobs: string[] = [];
    const stop = onApprovedJob(({ id }) => jobs.push(id));
    recoverApproval("s", "q-away", {
      read: async () =>
        session([{ ...step, status: "started", jobId: "job-away" }]),
    });
    await vi.waitFor(() => expect(recovering("s")).toEqual([]));
    expect(jobs).toEqual(["job-away"]);
    // The panel still holds the step as it was before the Approve.
    const html = renderToStaticMarkup(
      <AgentApprovals session={session([step])} onChange={() => {}} />,
    );
    expect(html).not.toContain("Approve $");
    expect(html).toContain("The run started; it is in your gallery.");
    stop();
  });

  it("hands an uncertain step's reserved run to the gallery too", async () => {
    const jobs: string[] = [];
    const stop = onApprovedJob(({ id }) => jobs.push(id));
    recoverApproval("s2", "q-unsure", {
      read: async () =>
        session([
          pending({
            quoteId: "q-unsure",
            status: "uncertain",
            jobId: "job-unsure",
          }),
        ]),
    });
    await vi.waitFor(() => expect(jobs).toEqual(["job-unsure"]));
    stop();
  });
});

describe("the approved run reaches the gallery", () => {
  it("inserts the job the approve answer returned, without a read", async () => {
    const add = vi.fn();
    const track = vi.fn();
    const job = { id: "job-1" } as Job;
    expect(await handOffApprovedJob({ id: "job-1", job }, { add, track })).toBe(
      true,
    );
    expect(add).toHaveBeenCalledWith(job);
    expect(track).not.toHaveBeenCalled();
  });

  it("tries the read-only handoff again after one failed read", async () => {
    const track = vi
      .fn<(id: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const wait = vi.fn(async () => {});
    expect(
      await handOffApprovedJob({ id: "job-1" }, { add: vi.fn(), track, wait }),
    ).toBe(true);
    expect(track).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});

describe("a handoff is never abandoned", () => {
  it("keeps trying past the old budget, shows it as stuck, and lands when reads work again", async () => {
    let calls = 0;
    const online = STUCK_AFTER + 6; // well past the old 12 tries
    const track = vi.fn(async () => ++calls > online);
    const seenStuck: string[][] = [];
    const add = vi.fn();
    const done = handOffApprovedJob(
      { id: "job-late" },
      {
        add,
        track,
        wait: async () => void seenStuck.push([...stuckHandoffs()]),
      },
    );
    expect(await done).toBe(true);
    expect(track).toHaveBeenCalledTimes(online + 1);
    expect(seenStuck.some((ids) => ids.includes("job-late"))).toBe(true);
    // Landed: no longer shown as stuck.
    expect(stuckHandoffs()).toEqual([]);
  });

  it("retries at once when connectivity returns, without waiting out the backoff", async () => {
    let up = false;
    const track = vi.fn(async () => up);
    const done = handOffApprovedJob(
      { id: "job-online" },
      { add: vi.fn(), track },
    );
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    up = true;
    const started = Date.now();
    retryPendingHandoffs(); // the window's online event, or a history load
    expect(await done).toBe(true);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("shows a stuck run with Refresh history in the bubble", () => {
    let calls = 0;
    void handOffApprovedJob(
      { id: "job-stuck" },
      {
        add: vi.fn(),
        track: async () => false,
        wait: async () => {
          if (++calls > STUCK_AFTER) await new Promise(() => {});
        },
      },
    );
    return vi.waitFor(() => {
      expect(stuckHandoffs()).toEqual(["job-stuck"]);
      const html = renderToStaticMarkup(
        <AgentApprovals session={session([pending()])} onChange={() => {}} />,
      );
      expect(html).toContain("A paid run could not be shown yet.");
      expect(html).toContain("Refresh history");
    });
  });
});

describe("an upscale's plan", () => {
  const quote = {
    id: "q",
    estimateUsd: 1.2,
    recipe: { id: "flux-video-upscale", version: 1, route: "bfl" as const },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const upscale = {
    ...input,
    generator: "upscale",
    sourceId: "clip-1",
    upscaleFactor: 2,
    upscaleCreativity: 1,
    upscalePrompt: "  finer\ngrain ",
  } as never;
  const source = {
    id: "clip-1",
    label: "Harbour",
    width: 640,
    height: 360,
    duration: 4.2,
  };

  it("shows the measured source, factor, creativity and prompt, not video fields", () => {
    const plan = approvalPlan(upscale, quote, source);
    expect(plan).not.toHaveProperty("duration");
    expect(plan).not.toHaveProperty("aspectRatio");
    expect(plan).not.toHaveProperty("resolution");
    expect(plan.description).toBe("finer grain");
    expect(plan.upscale).toEqual({
      sourceId: "clip-1",
      sourceLabel: "Harbour",
      width: 640,
      height: 360,
      duration: 4.2,
      factor: 2,
      outputWidth: 1280,
      outputHeight: 720,
      creativity: "Creative",
      prompt: "finer grain",
    });
    expect(planLine(pending({ plan }))).toBe(
      `${plan.label} · 2× Creative · “Harbour” 640×360, 4.2 s → 1280×720 · BFL`,
    );
  });

  it("has no plan without the server's record of its source", () => {
    expect(() => approvalPlan(upscale, quote)).toThrow(/measured source/);
    expect(() =>
      approvalPlan(upscale, quote, { ...source, id: "other" }),
    ).toThrow(/measured source/);
  });
});
