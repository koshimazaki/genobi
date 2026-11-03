import { describe, expect, it } from "vitest";
import {
  GenerationQueue,
  haltNote,
  isRefusal,
  quoteFailure,
} from "../src/generation-queue";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = () => new Promise((done) => setTimeout(done, 0));
const refusal = (message: string, status = 429) =>
  Object.assign(new Error(message), { status });

function harness() {
  const calls: { run: string; answer: ReturnType<typeof deferred<boolean>> }[] =
    [];
  const notes: string[] = [];
  const queue = new GenerationQueue<string>(
    (run) => {
      const answer = deferred<boolean>();
      calls.push({ run, answer });
      return answer.promise;
    },
    { change: () => {}, halt: (note) => notes.push(note) },
  );
  return { queue, calls, notes };
}

describe("generation queue", () => {
  it("sends a run at once when idle and the next only after it is accepted", async () => {
    const { queue, calls } = harness();
    queue.add("a");
    queue.add("b");
    queue.add("c");
    expect(calls.map((c) => c.run)).toEqual(["a"]);
    expect(queue.queued).toBe(2);
    calls[0].answer.resolve(true);
    await settle();
    expect(calls.map((c) => c.run)).toEqual(["a", "b"]);
    expect(queue.queued).toBe(1);
    calls[1].answer.resolve(true);
    await settle();
    calls[2].answer.resolve(true);
    await settle();
    expect(calls.map((c) => c.run)).toEqual(["a", "b", "c"]);
    expect(queue.queued).toBe(0);
    expect(queue.busy).toBe(false);
  });

  it("stops on an uncertain submission, never retries it and drops the rest", async () => {
    const { queue, calls, notes } = harness();
    queue.add("a");
    calls[0].answer.resolve(true);
    await settle();
    queue.add("b");
    queue.add("c");
    queue.add("d");
    calls[1].answer.reject(new TypeError("Failed to fetch"));
    await settle();
    // Only b was tried; it is not sent again and c, d are dropped.
    expect(calls.map((c) => c.run)).toEqual(["a", "b"]);
    expect(queue.queued).toBe(0);
    expect(queue.busy).toBe(false);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/Failed to fetch/);
    expect(notes[0]).toMatch(/not retried/);
    expect(notes[0]).toMatch(/2 queued runs were not sent/);
  });

  it("stops on a server refusal such as the budget or session limit", async () => {
    const { queue, calls, notes } = harness();
    queue.add("a");
    queue.add("b");
    calls[0].answer.reject(
      refusal("This session's generation limit is reached."),
    );
    await settle();
    expect(calls).toHaveLength(1);
    expect(notes).toEqual([
      "This session's generation limit is reached. The queue stopped: 1 queued run was not sent.",
    ]);
  });

  it("says nothing was sent when a quote fails, even on a 5xx", async () => {
    const { queue, calls, notes } = harness();
    queue.add("a");
    calls[0].answer.resolve(true);
    await settle();
    queue.add("b");
    queue.add("c");
    calls[1].answer.reject(quoteFailure(refusal("Bad gateway", 502)));
    await settle();
    expect(calls).toHaveLength(2);
    expect(notes).toEqual([
      "Bad gateway The quote failed, so nothing was sent. The queue stopped: 1 queued run was not sent.",
    ]);
    expect(notes[0]).not.toMatch(/may have started|not retried/);
  });

  it("stops when a run's confirmation is declined", async () => {
    const { queue, calls, notes } = harness();
    queue.add("a");
    queue.add("b");
    calls[0].answer.resolve(false);
    await settle();
    expect(calls).toHaveLength(1);
    expect(notes[0]).toMatch(/not approved.*1 queued run was not sent/);
  });

  it("reads a lone manual failure as before, with no queue wording", async () => {
    const { queue, calls, notes } = harness();
    queue.add("a");
    calls[0].answer.reject(new Error("Network down"));
    await settle();
    expect(notes).toEqual(["Network down"]);
  });

  it("clears unsent runs, keeps the one being sent, and notes leaving Camera", async () => {
    const { queue, calls, notes } = harness();
    queue.add("a");
    queue.add("b");
    expect(queue.clear()).toBe(1);
    calls[0].answer.resolve(true);
    await settle();
    expect(calls.map((c) => c.run)).toEqual(["a"]);
    expect(notes).toEqual([]);
    queue.add("c");
    queue.add("d");
    queue.leave();
    expect(notes[0]).toMatch(/left Camera, so 1 queued run was not sent/);
    calls[1].answer.resolve(true);
    await settle();
    expect(calls.map((c) => c.run)).toEqual(["a", "c"]);
  });

  it("tells a refusal from an unknown outcome by status", () => {
    expect(isRefusal(refusal("x", 400))).toBe(true);
    expect(isRefusal(refusal("x", 429))).toBe(true);
    expect(isRefusal(refusal("x", 502))).toBe(false);
    expect(isRefusal(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRefusal(new SyntaxError("Unexpected token <"))).toBe(false);
    expect(haltNote("declined", 0)).toBe("");
  });
});
