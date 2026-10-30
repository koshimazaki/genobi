// The librosa worker's line protocol against a stand-in script, and the
// checks on what it returns. Skipped where no python3 is on PATH: the suite
// never needs Python. With GENOBI_AUDIO_PYTHON set to a venv holding
// server/audio-worker/requirements.txt, the real worker runs too.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkAudioWorker,
  librosaPart,
  runAudioWorker,
} from "../server/audio-worker";
import { clickTrack, RATE } from "./audio-signals";

const python = (() => {
  try {
    return execFileSync("sh", ["-c", "command -v python3"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
})();
const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-audio-proc-"));
afterAll(() => rm(folder, { recursive: true, force: true }));

/** Reads the header and samples, then answers by the first sample's value. */
const STAND_IN = `
import json, struct, sys, time
if "--check" in sys.argv:
    print(json.dumps({"event": "ready", "version": "stand-in"}), flush=True)
    sys.exit(0)
header = json.loads(sys.stdin.buffer.readline())
data = sys.stdin.buffer.read(header["samples"] * 4)
first = struct.unpack("<f", data[:4])[0]
print("library noise is not a protocol line", flush=True)
if first < 0:
    print(json.dumps({"event": "error", "code": "analysis_failed"}), flush=True)
elif first > 1:
    time.sleep(10)
else:
    print(json.dumps({"event": "result", "samples": len(data) // 4,
      "rate": header["sampleRate"], "beats": [0.5, 1.0]}), flush=True)
`;

describe.skipIf(!python)("the librosa worker protocol", () => {
  const script = path.join(folder, "stand_in.py");
  const samples = (first: number) => {
    const x = new Float32Array(RATE);
    x[0] = first;
    return x;
  };

  it("sends a header and the samples, and reads one result", async () => {
    await writeFile(script, STAND_IN);
    expect(await checkAudioWorker({ python, script })).toBe(true);
    expect(
      await runAudioWorker({ python, script }, samples(0.5), RATE, 10_000),
    ).toMatchObject({ event: "result", samples: RATE, rate: RATE });
  });

  it("passes on a fixed failure code", async () => {
    await writeFile(script, STAND_IN);
    await expect(
      runAudioWorker({ python, script }, samples(-1), RATE, 10_000),
    ).rejects.toMatchObject({ code: "analysis_failed" });
  });

  it("kills a worker that runs past its time", async () => {
    await writeFile(script, STAND_IN);
    const began = Date.now();
    await expect(
      runAudioWorker({ python, script }, samples(2), RATE, 300),
    ).rejects.toMatchObject({ code: "audio_timeout" });
    expect(Date.now() - began).toBeLessThan(5000);
  });

  it("reports a Python that cannot start", async () => {
    const missing = { python: path.join(folder, "no-python"), script };
    await expect(
      runAudioWorker(missing, samples(0.5), RATE, 10_000),
    ).rejects.toMatchObject({ code: "python_missing" });
    expect(await checkAudioWorker(missing)).toBe(false);
  });
});

describe("the librosa part of the report", () => {
  const good = {
    beats: [0.5, 1, 1.5, 2, 2.5, 3],
    beatLowEnergy: [3, 1, 1, 1, 3, 1],
    onsets: { kick: [0.5, 1, 1.5, 2, 2.5, 3], snare: [1], hat: [] },
    sections: [2],
    version: "0.11.0",
  };

  it("fits the grid from the worker's raw beats", () => {
    expect(librosaPart(good, 4)).toMatchObject({
      status: "used",
      beatFound: true,
      grid: { bpm: 120, firstBeatSeconds: 0 },
      composition: { bpm: 120, beatOffsetSeconds: 0.5, beatsPerBar: 4 },
    });
  });

  it("reports no beat when the worker's beats land on no onsets", () => {
    expect(
      librosaPart({ ...good, onsets: { kick: [], snare: [], hat: [] } }, 4),
    ).toMatchObject({
      status: "used",
      beatFound: false,
      grid: null,
      composition: null,
    });
  });

  it.each([
    { beats: [1, 0.5, 2, 3, 4, 5] },
    { beats: [0.5, 1, 1.5, 2, 2.5, 99] },
    { beatLowEnergy: [1] },
    { onsets: { kick: ["0.5"], snare: [], hat: [] } },
    { sections: null },
  ])("refuses a malformed result: %j", (change) => {
    expect(librosaPart({ ...good, ...change }, 4)).toEqual({
      status: "failed",
      code: "invalid_result",
    });
  });
});

const venv = process.env.GENOBI_AUDIO_PYTHON?.trim();
describe.skipIf(!venv)("the real librosa worker", () => {
  it("recovers a 98 BPM click track", async () => {
    const script = path.resolve("server/audio-worker/audio_worker.py");
    const message = await runAudioWorker(
      { python: venv!, script },
      clickTrack(98, 0.37, 30),
      RATE,
      120_000,
    );
    const part = librosaPart(message, 30);
    expect(part.status).toBe("used");
    expect(Math.abs(part.grid!.bpm - 98)).toBeLessThan(1);
    expect(Math.abs(part.grid!.firstBeatSeconds - 0.37)).toBeLessThan(0.03);
  }, 120_000);
});
