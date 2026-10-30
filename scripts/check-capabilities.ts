// Checks the capability map (plugins/genobi/capabilities.json) against the
// tool and skill registry and the repository, and that docs/capabilities.md is
// rendered from it. `--write` rewrites the page and lays the JSON out in its
// committed layout; without it nothing is written.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPABILITIES_FILE,
  CAPABILITIES_PAGE,
  checkCapabilities,
  readCapabilities,
  serializeCapabilities,
} from "./lib/capabilities";
import { capabilitiesPage } from "./lib/capabilities-page";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const map = readCapabilities(root);
const problems = checkCapabilities(root, map);
if (problems.length) {
  console.error(`Capability map problems (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
const files = new Map([
  [CAPABILITIES_FILE, serializeCapabilities(map)],
  [CAPABILITIES_PAGE, await capabilitiesPage(root, map)],
]);
const stale: string[] = [];
for (const [file, text] of files) {
  const target = path.join(root, file);
  if (write) await writeFile(target, text);
  else if ((await readFile(target, "utf8").catch(() => "")) !== text)
    stale.push(file);
}
if (stale.length) {
  console.error(
    `Stale or not in the committed layout: ${stale.join(", ")}. Run npm run capabilities.`,
  );
  process.exit(1);
}
const count = (status: string) =>
  map.capabilities.filter((entry) => entry.status === status).length;
console.log(
  `Capabilities ${write ? "written" : "current"}: ${map.capabilities.length} features (${count("verified")} verified, ${count("implemented")} implemented, ${count("planned")} planned).`,
);
