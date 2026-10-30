import { writeFile } from "node:fs/promises";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import type { Run } from "../server/ffmpeg";
import { AnalysisThread, threadTimeoutMs } from "../server/audio-thread";
import { analyseAudio } from "../shared/audio-analysis";
import { audioApp } from "./audio-harness";
import { clickTrack, RATE, wav16 } from "./audio-signals";

// The uncached analysis runs on a worker thread (server/audio-thread.ts): the
// server keeps answering meanwhile, the report is the inline one, and a
// thread that crashes, hangs or is stopped answers rather than hangs.
const SERVER_ERROR = {
  error: "The local server could not complete this request.",
};

/** A fake ffmpeg that hands back these samples with async file I/O only. */
function decodesTo(samples: Float32Array): Run {
  const bytes = new Uint8Array(samples.buffer.slice(0));
  return async (_command, args) => {
    if (args[0] === "-version") return "ffmpeg version test";
    await writeFile(args.at(-1)!, bytes);
    return "";
  };
}

/** The longest gap between 20 ms ticks beyond 20 ms, while `work` runs. */
async function blocked(work: () => unknown) {
  let worst = 0;
  let last = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 20);
    last = now;
  }, 20);
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await work();
  await new Promise((resolve) => setTimeout(resolve, 50));
  histogram.disable();
  clearInterval(tick);
  return { worst, maxDelayMs: histogram.max / 1e6 };
}

const thread = (body: string) =>
  new URL(`data:text/javascript,${encodeURIComponent(body)}`);

describe("audio analysis off the event loop", () => {
  it("answers health checks within 100 ms during a long analysis, with the inline report", async () => {
    // Four minutes: under a second inline here, long enough to measure.
    const samples = clickTrack(98, 0.37, 240);
    let inline: unknown;
    const before = await blocked(() => {
      inline = analyseAudio(samples, RATE);
    });
    // The measurement sees the inline analysis block the loop.
    expect(before.maxDelayMs).toBeGreaterThan(200);

    const { upload, analyze, base, cookie } = await audioApp(
      decodesTo(samples),
    );
    const source = await upload(wav16(samples), "audio/wav");
    let report: unknown;
    let done = false;
    const health: number[] = [];
    const after = await blocked(async () => {
      const answer = analyze({ sourceId: source.id }).then(async (r) => {
        expect(r.status).toBe(200);
        report = (await r.json()).report;
        done = true;
      });
      while (!done) {
        const started = performance.now();
        const ok = await fetch(`${base}/api/health`, { headers: { cookie } });
        expect(ok.status).toBe(200);
        await ok.arrayBuffer();
        health.push(performance.now() - started);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await answer;
    });
    expect(after.worst).toBeLessThan(100);
    expect(after.maxDelayMs).toBeLessThan(100);
    expect(health.length).toBeGreaterThan(5);
    expect(Math.max(...health)).toBeLessThan(100);
    expect(report).toEqual({
      ...JSON.parse(JSON.stringify(inline)),
      librosa: { status: "not-requested" },
    });
  }, 60_000);

  it.each([
    ["throws", "throw new Error('boom');"],
    ["exits", "process.exit(3);"],
    [
      "answers in the wrong shape",
      "import { parentPort } from 'node:worker_threads'; parentPort.postMessage({ report: 1 });",
    ],
    ["hangs", "setInterval(() => {}, 1000);"],
  ])(
    "answers 500 when the thread %s, and serves the next request",
    async (_name, body) => {
      const samples = clickTrack(98, 0.37, 20);
      const { upload, analyze } = await audioApp(decodesTo(samples), {
        thread: { entry: thread(body), timeoutMs: () => 300 },
      });
      const source = await upload(wav16(samples), "audio/wav");
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await analyze({ sourceId: source.id });
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual(SERVER_ERROR);
      }
    },
  );

  it("sets the time limit from the audio's length, read before the transfer", async () => {
    const seen: number[] = [];
    const analysis = new AnalysisThread({
      entry: thread("setInterval(() => {}, 1000);"),
      timeoutMs: (seconds) => {
        seen.push(seconds);
        return threadTimeoutMs(seconds);
      },
    });
    const samples = new Float32Array(240 * RATE);
    const running = analysis.run(samples, RATE);
    // The array went to the thread, and its length was read first.
    expect(samples.length).toBe(0);
    expect(seen).toEqual([240]);
    expect(threadTimeoutMs(seen[0])).toBe(54_000);
    await analysis.close();
    await expect(running).rejects.toThrow();
  });

  it("bounds the queue and stops a running thread on close", async () => {
    const samples = clickTrack(98, 0.37, 20);
    const { upload, analyze, audio } = await audioApp(decodesTo(samples), {
      thread: { entry: thread("setInterval(() => {}, 1000);") },
    });
    const source = await upload(wav16(samples), "audio/wav");
    // One runs (and hangs) and three wait; the fifth is told to retry.
    const queued = Array.from({ length: 4 }, () =>
      analyze({ sourceId: source.id }),
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    const busy = await analyze({ sourceId: source.id });
    expect(busy.status).toBe(503);
    expect((await busy.json()).code).toBe("audio_busy");
    // Shutdown stops the hung thread; every waiting request still answers.
    await audio.close();
    for (const response of await Promise.all(queued)) {
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual(SERVER_ERROR);
    }
  });
});
