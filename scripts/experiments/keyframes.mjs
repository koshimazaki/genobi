/**
 * Extract the first, closed and open guide frames of a captured study as PNG.
 * `node scripts/experiments/keyframes.mjs <study dir> [...]`
 * The band series is the one the scene used: recipe.json's bandEnvelopes
 * (after band gain, smoothing and release). Indices are exact 0-based frames
 * of rgb.webm snapped to LTX's 8-frame latent grid, so a Klein edit of a still can be pinned at the same index as
 * a second image guide.
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { keyframeFile, pickKeyframes } from "./keyframe-pick.mjs";

const BAND = "low";

export async function writeKeyframes(directory) {
  const recipe = JSON.parse(
    await readFile(join(directory, "recipe.json"), "utf8"),
  );
  const series = recipe.bandEnvelopes?.[BAND];
  if (!Array.isArray(series) || series.length !== recipe.frames)
    throw new Error(
      `${directory}: recipe.json lacks a ${BAND} band per frame.`,
    );
  const video = join(directory, "rgb.webm");
  const frames = [];
  for (const pick of pickKeyframes(series)) {
    const file = keyframeFile(pick.role, pick.index);
    // Decode in order and keep exactly the n-th frame; no seeking, no rate change.
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-y",
      "-i",
      video,
      "-vf",
      `select=eq(n\\,${pick.index})`,
      "-fps_mode",
      "passthrough",
      "-frames:v",
      "1",
      join(directory, file),
    ]);
    frames.push({ ...pick, file });
  }
  const receipt = {
    band: BAND,
    source: "recipe.json bandEnvelopes (scaled, smoothed, released)",
    smoothing: "centred 5-frame moving average",
    openSearchFrom: 8,
    indexBase: 0,
    // `index` is snapped to the LTX latent grid; `source` is the raw extreme.
    latentStride: 8,
    frames,
  };
  await writeFile(
    join(directory, "keyframes.json"),
    JSON.stringify(receipt, null, 2),
  );
  return receipt;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.log("node scripts/experiments/keyframes.mjs <study dir> [...]");
    process.exit(1);
  }
  for (const dir of dirs) {
    const { frames } = await writeKeyframes(resolve(dir));
    console.log(
      `${dir}: ${frames.map((f) => `${f.role}=${f.index}`).join(" ")}`,
    );
  }
}
