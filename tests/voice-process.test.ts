// The worker line protocol against a stand-in script, not the model. Skipped
// where no python3 is on PATH: the suite never needs Python.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { startWorker } from "../server/voice-process";

const python = (() => {
  try {
    return execFileSync("sh", ["-c", "command -v python3"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
})();
const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-voice-proc-"));
afterAll(() => rm(folder, { recursive: true, force: true }));

/** Prints ready, echoes the request's context as one segment, or fails. */
const STAND_IN = `
import json, sys
model = sys.argv[sys.argv.index("--model") + 1]
print("library noise on stdout is not a protocol line", flush=True)
if model == "fail":
    print(json.dumps({"event": "error", "code": "local_model_missing"}), flush=True)
    sys.exit(2)
print(json.dumps({"event": "ready", "model": "Stand-in · CPU", "loadSeconds": 0.1}), flush=True)
request = json.loads(sys.stdin.readline())
print(json.dumps({"event": "result", "language": "English", "inferSeconds": 0.2,
  "segments": [{"start": 0, "end": 1, "text": request["context"]}, {"text": 5}]}), flush=True)
`;

describe.skipIf(!python)("the voice worker protocol", () => {
  const script = path.join(folder, "stand_in.py");
  const request = {
    schema: 1 as const,
    pcmPath: "/unused.f32",
    chunks: [[0, 16_000]] as [number, number][],
    context: "Genobi, Ninja",
  };

  it("waits for ready, sends one request and reads the result", async () => {
    await writeFile(script, STAND_IN);
    const worker = startWorker({ python, script, model: "ok" });
    expect(await worker.ready).toEqual({
      model: "Stand-in · CPU",
      loadSeconds: 0.1,
    });
    expect(await worker.run(request)).toEqual({
      segments: [{ start: 0, end: 1, text: "Genobi, Ninja" }],
      language: "English",
      inferSeconds: 0.2,
    });
    worker.kill();
  });

  it("passes on a fixed failure code", async () => {
    await writeFile(script, STAND_IN);
    const worker = startWorker({ python, script, model: "fail" });
    await expect(worker.run(request)).rejects.toMatchObject({
      code: "local_model_missing",
    });
  });

  it("reports a Python that cannot start", async () => {
    const worker = startWorker({
      python: path.join(folder, "no-python"),
      script,
      model: "ok",
    });
    await expect(worker.ready).rejects.toMatchObject({
      code: "python_missing",
    });
  });
});
