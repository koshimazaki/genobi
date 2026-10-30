// Start the studio first (`PORT=4317 npm run dev`, no key needed). Makes a
// click track with known tempo and offset using ffmpeg, then launches the
// built plugin server over stdio exactly as an agent would, uploads the file
// by path with genobi_audio_upload, analyses it with genobi_audio_analysis,
// and checks the grid it reads.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BPM = 98;
const OFFSET = 0.37;
const SECONDS = 30;
const period = 60 / BPM;
const folder = mkdtempSync(path.join(os.tmpdir(), "genobi-audio-check-"));
const file = path.join(folder, "click.wav");
// A 2 ms click every beat from OFFSET, at 44.1 kHz, 16-bit mono.
const since = `mod(t-${OFFSET},${period})`;
execFileSync(
  process.env.FFMPEG_PATH ?? "ffmpeg",
  [
    ...["-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "lavfi"],
    "-i",
    `aevalsrc=exprs='if(gte(t,${OFFSET})*lt(${since},0.002),0.9*(1-${since}/0.002),0)':s=44100:d=${SECONDS}`,
    ...["-c:a", "pcm_s16le", file],
  ],
  { stdio: "ignore" },
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["plugins/genobi/server/genobi-mcp.mjs"],
  env: {
    PATH: process.env.PATH ?? "",
    GENOBI_URL: process.env.GENOBI_URL ?? "http://127.0.0.1:4317",
  },
});
const client = new Client({ name: "check-audio-mcp", version: "0" });
await client.connect(transport);
try {
  const { tools } = await client.listTools();
  const hint = (name) => tools.find((t) => t.name === name)?.annotations;
  assert.equal(hint("genobi_audio_upload")?.readOnlyHint, false);
  assert.equal(hint("genobi_audio_analysis")?.readOnlyHint, true);
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name}: ${result.content?.[0]?.text}`);
    return JSON.parse(result.content[0].text);
  };
  const began = performance.now();
  const { sourceId } = await call("genobi_audio_upload", { filePath: file });
  const report = await call("genobi_audio_analysis", {
    sourceId,
    librosa: true,
  });
  const { grid, composition, downbeat, onsets, moments, librosa } = report;
  assert.equal(report.beatFound, true);
  assert.ok(Math.abs(grid.bpm - BPM) < 1, `bpm ${grid.bpm}`);
  assert.ok(
    Math.abs(grid.firstBeatSeconds - OFFSET) < 0.01,
    `first beat ${grid.firstBeatSeconds}`,
  );
  const beats = (composition.beatOffsetSeconds - OFFSET) / period;
  assert.ok(Math.abs(beats - Math.round(beats)) < 0.02, "offset on a beat");
  console.log(
    JSON.stringify(
      {
        expected: { bpm: BPM, firstBeatSeconds: OFFSET },
        seconds: Number(((performance.now() - began) / 1000).toFixed(2)),
        durationSeconds: report.durationSeconds,
        beatFound: report.beatFound,
        grid,
        downbeat,
        composition,
        onsets: Object.fromEntries(
          ["kick", "snare", "hat"].map((band) => [band, onsets[band].length]),
        ),
        moments,
        librosa: librosa.grid
          ? {
              status: librosa.status,
              version: librosa.version,
              beatFound: librosa.beatFound,
              grid: librosa.grid,
              composition: librosa.composition,
              sections: librosa.sections,
            }
          : librosa,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
  rmSync(folder, { recursive: true, force: true });
}
