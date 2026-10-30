// The World Builder node's standalone bundle (custom_nodes/director_world_builder/web)
// is gitignored: each install builds it from src/world-builder with
// `npm run build:scene-adapter`. So parity is checked by building, not by
// comparing a committed file. This builds the bundle twice into scratch
// directories and fails when a build fails, an expected file is missing, or
// the two builds differ (a bundle that is not reproducible cannot be kept in
// parity). When a local node bundle exists, it also fails if that bundle no
// longer matches the sources, so a stale node is caught before it is copied
// into ComfyUI.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const NODE_WEB = "custom_nodes/director_world_builder/web";
const EXPECTED = [
  "adapter.mjs",
  "adapter.css",
  "index.html",
  "media/director-templates/dimensions-mix/mix-track.mp3",
];
// Hand-written or copied, not built from src/world-builder.
const SKIP = new Set(["extension.js", "world-assets"]);

async function hashes(dir) {
  const result = new Map();
  async function walk(rel) {
    for (const entry of await readdir(path.join(dir, rel), {
      withFileTypes: true,
    })) {
      const name = path.posix.join(rel, entry.name);
      if (!rel && SKIP.has(entry.name)) continue;
      if (entry.isDirectory()) await walk(name);
      else
        result.set(
          name,
          createHash("sha256")
            .update(await readFile(path.join(dir, name)))
            .digest("hex"),
        );
    }
  }
  await walk("");
  return result;
}

function differences(a, b) {
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names].filter((n) => a.get(n) !== b.get(n)).sort();
}

const scratch = await mkdtemp(path.join(tmpdir(), "scene-adapter-"));
const problems = [];
try {
  const builds = [];
  for (const run of ["a", "b"]) {
    const out = path.join(scratch, run);
    execFileSync(
      process.execPath,
      ["scripts/build-scene-adapter.mjs", "--out", out],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    builds.push(await hashes(out));
  }
  const [first, second] = builds;
  for (const name of EXPECTED)
    if (!first.has(name)) problems.push(`The build wrote no ${name}.`);
  const drift = differences(first, second);
  if (drift.length)
    problems.push(
      `Two builds from the same sources differ: ${drift.join(", ")}.`,
    );
  if (existsSync(path.join(NODE_WEB, "adapter.mjs"))) {
    const stale = differences(first, await hashes(NODE_WEB));
    if (stale.length)
      problems.push(
        `The local node bundle in ${NODE_WEB} is out of date (${stale.join(", ")}). Run npm run build:scene-adapter.`,
      );
  }
  if (!problems.length)
    console.log(
      `Scene adapter bundle builds and is reproducible (${first.size} files).`,
    );
} catch (error) {
  problems.push(`The scene adapter build failed: ${error.message}`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
