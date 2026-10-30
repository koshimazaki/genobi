/**
 * The LTX camera test: one scene through each movement, one take each, so the
 * studio claims only the moves that work. Spends real credits.
 *
 *   npm run camera-test -- ltx-2-5-fast movements
 *
 * The key is the one saved in the studio (the Keychain, macOS), or
 * COMFY_API_KEY, which wins.
 *
 * Writes test/ltx/<term>.mp4 and test/ltx/run.json (prompt, request id, credits,
 * wall-clock per move; never the key). Score the clips by eye and record the
 * verdicts in docs/camera-wording.md.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cameraSections, termsFor } from "../shared/camera";
import { ltxBody } from "../shared/comfy/ltx";
import { ComfyRouter } from "../shared/comfy/router";
import { composePrompt } from "../shared/presets";
import type { VideoModel } from "../shared/types";
import { comfyKey } from "./lib/comfy-key.mjs";
import { validKey } from "./lib/router-check.mjs";

const found = await comfyKey();
const key = found.key ?? "";
if (!validKey(key)) {
  console.error(
    "No Comfy key: save one in the studio's key dialog, or set COMFY_API_KEY (comfyui-…). Nothing was sent.",
  );
  process.exit(2);
}
console.log(`Key from ${found.source}.`);
const [route = "ltx-2-5-fast", sectionId = "movements"] = process.argv.slice(2);
const model: VideoModel = route === "ltx-2-5-pro" ? "ltx-2.5-pro" : "ltx-2.5";
const section = cameraSections.find((s) => s.id === sectionId);
if (!section) {
  console.error(
    `No section ${sectionId}. Sections: ${cameraSections.map((s) => s.id).join(", ")}`,
  );
  process.exit(2);
}
const scene =
  "A log cabin stands in a snowy pine forest at dusk. Smoke rises from the chimney.";
const out = path.resolve("test/ltx");
await mkdir(out, { recursive: true });
const router = new ComfyRouter();
const manifest: Record<string, unknown>[] = [];
const started = Date.now();

for (const term of termsFor(section, model)) {
  const prompt = composePrompt({
    generator: "video",
    model,
    description: scene,
    cameraEnabled: true,
    camera: {
      "shot-sizes": null,
      angles: null,
      movements: null,
      [section.id]: term.id,
    },
    cameraEdits: {},
  });
  const body = ltxBody(
    { duration: 5, aspectRatio: "16:9", resolution: "hd" },
    prompt,
  );
  const t0 = Date.now();
  const row: Record<string, unknown> = { term: term.id, prompt, body };
  try {
    const job = await router.submit("video", body, key, {
      model,
      idempotencyKey: `camera-test-${term.id}-${started}`,
    });
    row.requestId = job.id;
    let result = await router.poll(job.polling_url, key);
    while (result.status === "Pending" || result.status === "Generating") {
      await new Promise((r) => setTimeout(r, 5_000));
      result = await router.poll(job.polling_url, key);
    }
    row.status = result.status;
    row.credits = result.credits ?? null;
    if (result.status === "Ready" && result.result?.sample) {
      const media = await router.download(result.result.sample);
      const file = path.join(out, `${term.id}.mp4`);
      await writeFile(file, Buffer.from(await media.arrayBuffer()));
      row.file = path.relative(process.cwd(), file);
    }
  } catch (error) {
    row.status = "Error";
    row.error = error instanceof Error ? error.message : String(error);
  }
  row.seconds = Math.round((Date.now() - t0) / 1000);
  manifest.push(row);
  console.log(
    `${String(term.id).padEnd(14)} ${String(row.status).padEnd(10)} ${row.credits ?? "—"} cr  ${row.seconds}s  ${row.file ?? row.error ?? ""}`,
  );
  await writeFile(
    path.join(out, "run.json"),
    JSON.stringify(
      {
        route,
        section: sectionId,
        scene,
        started: new Date(started).toISOString(),
        runs: manifest,
      },
      null,
      2,
    ),
  );
}
const spent = manifest.reduce(
  (sum, r) => sum + (typeof r.credits === "number" ? r.credits : 0),
  0,
);
console.log(`spent ${spent.toFixed(1)} cr · manifest test/ltx/run.json`);
