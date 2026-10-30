import { expect, it, vi } from "vitest";
import { newArena, type Arena, type ArenaSlot } from "../shared/arena";
import type { Job, GenerateInput } from "../shared/types";
import type { Quote } from "../shared/quote";
import { runnable } from "../src/arena/run-state";
import { submitArenaRuns } from "../src/arena/submit-runs";
import { pollArenaRuns } from "../src/arena/poll-runs";

const slot = (id = "rgb", jobId?: string): ArenaSlot => ({
  ...newArena().slots[0],
  id,
  run: { entry: "flux-3-video", ...(jobId ? { jobId } : {}) },
});
const job = (id: string, status: Job["status"]): Job => ({ id, status }) as Job;
const arena = (id = "a", jobId = "job-a"): Arena => ({
  ...newArena(),
  id,
  revision: 1,
  updatedAt: "2026-10-26T00:00:00Z",
  media: [],
  slots: [slot("rgb", jobId), slot("canny")],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it("blocks unresolved or active runs for that approach, while other approaches stay runnable", () => {
  const active = slot("rgb", "job-a");
  expect(runnable(active, {})).toBe(false);
  expect(runnable(active, { rgb: job("another-job", "Ready") })).toBe(false);
  expect(runnable(active, { rgb: job("job-a", "Generating") })).toBe(false);
  expect(runnable(active, { rgb: job("job-a", "Ready") })).toBe(true);
  expect(runnable(active, { rgb: job("job-a", "Error") })).toBe(true);
  expect(runnable(slot("canny"), { rgb: job("job-a", "Generating") })).toBe(
    true,
  );
  expect(
    runnable(
      { ...slot(), run: { entry: "flux-3-video", key: crypto.randomUUID() } },
      {},
    ),
  ).toBe(true);
});

it("submits three independent approved approaches before any response, without retries", async () => {
  const slots = [slot("rgb"), slot("canny"), slot("depth")];
  const replies = slots.map(() => deferred<Job>());
  const inputs = slots.map(
    (s) => ({ generator: "video", description: s.id }) as GenerateInput,
  );
  const quotes = slots.map((s) => ({ id: `quote-${s.id}` }) as Quote);
  const keys = new Map(slots.map((s) => [s.id, `saved-${s.id}`]));
  const submit = vi.fn(
    (_input: GenerateInput, _headers: Record<string, string>) =>
      replies[submit.mock.calls.length - 1].promise,
  );
  const record = vi.fn();
  const pending = submitArenaRuns(slots, inputs, quotes, keys, submit, record);
  expect(submit).toHaveBeenCalledTimes(3);
  slots.forEach((s, i) =>
    expect(submit.mock.calls[i]).toEqual([
      inputs[i],
      { "Idempotency-Key": `saved-${s.id}`, "Quote-Id": `quote-${s.id}` },
    ]),
  );
  replies[2].resolve(job("third", "Generating"));
  replies[0].resolve(job("first", "Generating"));
  replies[1].resolve(job("second", "Generating"));
  expect(await pending).toEqual({
    started: { rgb: "first", canny: "second", depth: "third" },
    failures: [],
  });
  expect(record).toHaveBeenCalledTimes(3);
  expect(submit).toHaveBeenCalledTimes(3);
});

it("keeps the other submissions when one approach fails, without retrying it", async () => {
  const slots = [slot("rgb"), slot("canny"), slot("depth")];
  const submit = vi.fn(async (input: GenerateInput) => {
    if (input.description === "canny") throw new Error("Answer unavailable");
    return job(input.description, "Generating");
  });
  const record = vi.fn();
  const result = await submitArenaRuns(
    slots,
    slots.map((s) => ({ description: s.id }) as GenerateInput),
    slots.map((s) => ({ id: s.id }) as Quote),
    new Map(slots.map((s) => [s.id, s.id])),
    submit,
    record,
  );
  expect(result.started).toEqual({ rgb: "rgb", depth: "depth" });
  expect(result.failures).toEqual([`${slots[1].label}: Answer unavailable`]);
  expect(submit).toHaveBeenCalledTimes(3);
  expect(record).toHaveBeenCalledTimes(2);
});

function harness() {
  let state = { arena: arena(), dirty: false, busy: false };
  const read = vi.fn(async (id: string) => job(id, "Ready"));
  const attach = vi.fn(async () => ({
    ...state.arena,
    revision: state.arena.revision + 1,
  }));
  const record = vi.fn<(id: string, value: Job) => void>();
  const adopt = vi.fn((a: Arena) => {
    state = { ...state, arena: a };
  });
  const options = {
    current: () => state,
    hidden: () => false,
    known: (): Job | undefined => undefined,
    read,
    attach,
    record,
    adopt,
  };
  return {
    options,
    read,
    attach,
    record,
    adopt,
    change: (next: Partial<typeof state>) => {
      state = { ...state, ...next };
    },
  };
}

it("drops an old comparison's status response after switching, even with the same slot ids", async () => {
  const h = harness(),
    reply = deferred<Job>();
  h.read.mockImplementation(() => reply.promise);
  const poller = pollArenaRuns(h.options),
    pending = poller.tick();
  h.change({ arena: arena("b", "job-b") });
  reply.resolve(job("job-a", "Ready"));
  await pending;
  expect(h.record).not.toHaveBeenCalled();
  expect(h.attach).not.toHaveBeenCalled();
  expect(h.adopt).not.toHaveBeenCalled();
});

it.each(["dirty", "busy"] as const)(
  "does not attach a ready result when %s changes during the status request",
  async (field) => {
    const h = harness(),
      reply = deferred<Job>();
    h.read.mockImplementation(() => reply.promise);
    const pending = pollArenaRuns(h.options).tick();
    h.change({ [field]: true });
    reply.resolve(job("job-a", "Ready"));
    await pending;
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.attach).not.toHaveBeenCalled();
    expect(h.adopt).not.toHaveBeenCalled();
  },
);

it.each(["comparison", "run", "dirty", "busy", "stopped", "revision"])(
  "does not adopt an in-flight result after %s changes",
  async (change) => {
    const h = harness(),
      reply = deferred<Arena>();
    h.attach.mockImplementation(() => reply.promise);
    const poller = pollArenaRuns(h.options),
      pending = poller.tick();
    await vi.waitFor(() => expect(h.attach).toHaveBeenCalledTimes(1));
    if (change === "comparison") h.change({ arena: arena("b", "job-b") });
    if (change === "run") h.change({ arena: arena("a", "new-job") });
    if (change === "dirty") h.change({ dirty: true });
    if (change === "busy") h.change({ busy: true });
    if (change === "stopped") poller.stop();
    if (change === "revision") h.change({ arena: { ...arena(), revision: 3 } });
    reply.resolve({ ...arena(), revision: 2 });
    await pending;
    expect(h.adopt).not.toHaveBeenCalled();
  },
);

it("allows only one polling tick and resolves persisted ready jobs once after reload", async () => {
  const h = harness(),
    reply = deferred<Job>();
  h.read.mockImplementation(() => reply.promise);
  const known: Record<string, Job> = {};
  h.options.known = () => known["job-a"];
  h.record.mockImplementation((_id: string, value: Job) => {
    known[value.id] = value;
  });
  h.change({
    arena: {
      ...arena(),
      slots: [{ ...slot("rgb", "job-a"), status: "ready" }],
    },
  });
  const poller = pollArenaRuns(h.options),
    pending = poller.tick();
  await poller.tick();
  expect(h.read).toHaveBeenCalledTimes(1);
  reply.resolve(job("job-a", "Ready"));
  await pending;
  await poller.tick();
  expect(h.read).toHaveBeenCalledTimes(1);
  expect(h.record).toHaveBeenCalledTimes(1);
  expect(h.attach).not.toHaveBeenCalled();
  expect(h.adopt).not.toHaveBeenCalled();
});

it.each([
  [404, true],
  [500, false],
  [429, false],
])(
  "settles a saved run the studio answers %i for only when it is gone",
  async (status, settles) => {
    const h = harness();
    const known: Record<string, Job> = {};
    h.options.known = () => known["job-a"];
    h.record.mockImplementation((_id: string, value: Job) => {
      known[value.id] = value;
    });
    h.read.mockRejectedValue(
      Object.assign(new Error("Job not found."), { status }),
    );
    await pollArenaRuns(h.options).tick();
    const saved = slot("rgb", "job-a");
    // Expired or never ours: Run again opens; a passing failure keeps waiting.
    expect(runnable(saved, known["job-a"] ? { rgb: known["job-a"] } : {})).toBe(
      settles,
    );
    expect(h.attach).not.toHaveBeenCalled();
    if (settles) {
      expect(known["job-a"].status).toBe("Error");
      await pollArenaRuns(h.options).tick();
      expect(h.read).toHaveBeenCalledTimes(1);
    }
  },
);
