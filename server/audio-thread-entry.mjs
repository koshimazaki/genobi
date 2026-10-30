// The worker thread behind server/audio-thread.ts: it runs the shared audio
// analysis, unchanged, on the samples it was handed, and hands them back with
// the report so the librosa worker can use them afterwards. The server runs
// under tsx, but a worker thread's loader is not guaranteed (a test runner may
// start the server), so the TypeScript module is loaded through tsx's own
// isolated import rather than relying on inherited flags.
import { parentPort, workerData } from "node:worker_threads";
import { tsImport } from "tsx/esm/api";

const { analyseAudio, AudioInputError } = await tsImport(
  "../shared/audio-analysis.ts",
  import.meta.url,
);
const { samples, sampleRate } = workerData;
try {
  const report = analyseAudio(samples, sampleRate);
  parentPort.postMessage({ report, samples }, [samples.buffer]);
} catch (error) {
  // Refused input keeps its fixed code; anything else ends the thread with
  // an error event, which the server answers as a failed request.
  if (!(error instanceof AudioInputError)) throw error;
  parentPort.postMessage(
    { refused: { code: error.code, message: error.message }, samples },
    [samples.buffer],
  );
}
