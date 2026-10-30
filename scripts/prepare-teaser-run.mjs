// A standalone editable ZIP for the render step; never swaps tracked files.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { register } from "tsx/esm/api";
const target = process.argv[2];
if (!target || process.argv.length !== 3) {
  console.error("Usage: node scripts/prepare-teaser-run.mjs <run-folder>");
  process.exit(64);
}
register();
const { runBundle } = await import("./lib/teaser-run/bundle.ts");
try {
  const output = path.join(target, "project.zip");
  writeFileSync(output, runBundle(target));
  console.log(output);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
