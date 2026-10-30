// Records the Genobi teaser's brief and owner corrections
// (docs/genobi-teaser-memory.json) as project memory on a project copy in
// the running studio, the way AGENTS.md "Save memory as you go" asks: each
// correction a `decision` with source "interpretation" quoting the owner,
// then each reusable rule a Taste proposal citing those events. Proposals
// are never activated here; the owner activates them in My reusable taste.
// Nothing is generated or paid for.
//
//   node scripts/seed-genobi-teaser-memory.mjs <copyId> [--url http://127.0.0.1:4317]
//
// The copy is the teaser project in the studio (`genobi projects` lists
// copies; open /director?example=genobi-teaser and save it to get one).
// Re-running is safe: identical decisions return the existing record.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [copyId, ...rest] = process.argv.slice(2);
if (!copyId) {
  console.error("Usage: seed-genobi-teaser-memory.mjs <copyId> [--url URL]");
  process.exit(2);
}
const url = rest[rest.indexOf("--url") + 1] ?? "http://127.0.0.1:4317";
const cli = (command, input) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "plugins/genobi/server/genobi-cli.mjs",
        command,
        "--url",
        url,
        "--input",
        "-",
      ],
      { input: JSON.stringify(input), encoding: "utf8" },
    ),
  );
const seed = JSON.parse(
  await readFile("docs/genobi-teaser-memory.json", "utf8"),
);

const project = cli("project", { copyId });
let baseRevision = project.revision ?? project.project?.revision;
let { memoryRevision } = cli("context", { copyId });
const events = new Map();
for (const d of seed.decisions) {
  const result = cli("decision", {
    copyId,
    id: d.id,
    baseRevision,
    memoryRevision,
    kind: d.kind,
    objectIds: [],
    source: "interpretation",
    reason: d.value.slice(0, 500),
    guidance: { topic: d.topic, value: d.value.slice(0, 500) },
  });
  memoryRevision = result.memoryRevision ?? memoryRevision + 1;
  baseRevision = result.projectRevision ?? baseRevision;
  events.set(d.id, result.event?.id ?? result.id ?? d.id);
  console.log(`decision ${d.id}`);
}
const taste = cli("taste", { copyId, action: "read" });
let revision = taste.tasteRevision ?? taste.revision ?? 0;
for (const t of seed.taste) {
  const result = cli("taste", {
    copyId,
    action: "propose",
    revision,
    preference: {
      id: t.id,
      topic: t.topic,
      value: t.value,
      scope: t.scope,
      evidence: t.evidence.map((id) => ({ copyId, eventId: events.get(id) })),
    },
  });
  revision = result.tasteRevision ?? result.revision ?? revision + 1;
  console.log(`taste proposal ${t.id} (awaiting the owner's activation)`);
}
