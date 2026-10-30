// Validates UI-format ComfyUI workflows against a live /object_info.
//
//   node scripts/check-ui-workflows.mjs --object-info http://127.0.0.1:8188 \
//     workflows/world-builder-akuspace-ltx.json ...
//
// `--object-info` takes a server URL or a saved /object_info JSON file. Packs
// the server lacks are filled from scripts/comfy-schemas/*.json (transcribed
// from their pinned source). Model filenames are compared with
// comfy-build/models/*.txt and reported when a list does not name them.
// Nothing is queued.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  checkGuideSizes,
  checkSchemas,
  checkStructure,
  listedModels,
  modelFiles,
} from "./lib/ui-workflow-check.mjs";

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const args = process.argv.slice(2);
const at = args.indexOf("--object-info");
if (at < 0 || !args[at + 1]) {
  console.error(
    "usage: check-ui-workflows.mjs --object-info <url|file> <workflow.json>...",
  );
  process.exit(2);
}
const source = args[at + 1];
const files = args.filter((_, i) => i !== at && i !== at + 1);

const info = /^https?:/.test(source)
  ? await (await fetch(new URL("/object_info", source))).json()
  : JSON.parse(await readFile(source, "utf8"));
const overlays = path.join(root, "scripts/comfy-schemas");
for (const name of await readdir(overlays))
  if (name.endsWith(".json")) {
    const extra = JSON.parse(await readFile(path.join(overlays, name), "utf8"));
    for (const [cls, schema] of Object.entries(extra))
      if (!cls.startsWith("_") && !info[cls]) info[cls] = schema;
  }
const lists = path.join(root, "comfy-build/models");
const listed = listedModels(
  await Promise.all(
    (await readdir(lists))
      .filter((n) => n.endsWith(".txt"))
      .map((n) => readFile(path.join(lists, n), "utf8")),
  ),
);

let failed = false;
for (const file of files) {
  const wf = JSON.parse(await readFile(file, "utf8"));
  if (!Array.isArray(wf.nodes) || !Array.isArray(wf.links)) {
    console.log(`${file}: not UI format (no nodes/links arrays)`);
    failed = true;
    continue;
  }
  const errors = [
    ...checkStructure(wf),
    ...checkSchemas(wf, info),
    ...checkGuideSizes(wf),
  ];
  const unlisted = modelFiles(wf).filter((m) => !listed.has(m.file));
  const classes = new Set(wf.nodes.map((n) => n.type));
  console.log(
    `${file}: ${wf.nodes.length} nodes, ${wf.links.length} links, ${classes.size} classes, ` +
      `${errors.length ? `${errors.length} errors` : "ok"}`,
  );
  for (const e of errors) console.log(`  error: ${e}`);
  for (const m of unlisted)
    console.log(`  not in comfy-build/models: ${m.file} (${m.type} ${m.node})`);
  failed ||= errors.length > 0;
}
process.exit(failed ? 1 : 0);
