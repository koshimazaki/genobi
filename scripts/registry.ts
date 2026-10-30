// Writes the tool and skill registry (plugins/genobi/registry.json) and its
// wiki pages (docs/registry*.md) from the MCP tool definitions and the skills'
// frontmatter. `--check` writes nothing and fails on an unknown tag, a linked
// doc that does not exist, or a committed file that no longer matches.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./lib/tool-registry";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { registry, problems, files } = await generate(root);
if (problems.length) {
  console.error(`Registry problems (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
const count = (kind: string) =>
  registry.entries.filter((entry) => entry.kind === kind).length;
const stale: string[] = [];
for (const [file, text] of files) {
  const target = path.join(root, file);
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== text) stale.push(file);
  } else await writeFile(target, text);
}
if (stale.length) {
  console.error(`Stale: ${stale.join(", ")}. Run npm run registry.`);
  process.exit(1);
}
console.log(
  `Registry ${process.argv.includes("--check") ? "current" : "written"}: ${count("tool")} tools, ${count("skill")} skills, ${files.size} files.`,
);
