// The run's own memory file (docs/genobi-teaser-run/README.md, "The run's
// memory file"): what
// run A decided and why, so run B can repeat it from this file alone. The
// verifier holds it to its shape and asks for one decision per section.
import type { Finding } from "./check";
import { SECTIONS } from "./similarity";

export const MEMORY_SCHEMA = "genobi-teaser-run-memory/1";
const SOURCES = new Set(["rule", "example", "owner", "memory"]);
const STEPS = new Set([
  "brief",
  "analyse",
  "sections",
  "cut",
  "overlays",
  "claims",
  "verify",
  "render",
  "review",
]);

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = 2000) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Shape problems as findings; one decision per section is a warning. */
export function checkMemory(raw: unknown): Finding[] {
  const out: Finding[] = [];
  const fail = (where: string, message: string, fix: string) =>
    out.push({ level: "fail", code: "memory", where, message, fix });
  const m = raw as Record<string, unknown> | null;
  if (!isObject(m)) {
    fail(
      "memory.json",
      "Not a JSON object.",
      "Copy examples/memory.example.json.",
    );
    return out;
  }
  if (m.schema !== MEMORY_SCHEMA)
    fail(
      "schema",
      `schema must be "${MEMORY_SCHEMA}".`,
      "Set the schema field.",
    );
  if (!isText(m.runId, 40))
    fail("runId", "runId is missing.", 'Use "a" or "b".');
  const runner = isObject(m.runner) ? m.runner : undefined;
  for (const key of ["agent", "model", "provider", "profile"])
    if (!isText(runner?.[key], 120))
      fail(`runner.${key}`, `runner.${key} is missing.`, "Write what ran you.");
  const brief = isObject(m.brief) ? m.brief : undefined;
  if (!isText(brief?.text, 4000))
    fail("brief.text", "The brief is missing.", "Copy brief.json's text.");
  const analysis = isObject(m.analysis) ? m.analysis : undefined;
  for (const key of ["bpm", "firstDownbeatSeconds"])
    if (typeof analysis?.[key] !== "number")
      fail(
        `analysis.${key}`,
        `analysis.${key} must be a number.`,
        "Copy it from the helper's sections output.",
      );
  if (!Array.isArray(analysis?.drops))
    fail(
      "analysis.drops",
      "analysis.drops must be a list.",
      "Copy the helper's drops.",
    );

  const decisions = Array.isArray(m.decisions) ? m.decisions : null;
  if (!decisions)
    fail("decisions", "decisions must be a list.", "Add one per section.");
  const seen = new Set<string>();
  for (const [i, d] of (decisions ?? []).entries()) {
    if (!isObject(d)) {
      fail(
        `decisions[${i}]`,
        "A decision must be an object.",
        "See examples/memory.example.json.",
      );
      continue;
    }
    const e = d;
    if (!isText(e.id, 80) || seen.has(String(e.id)))
      fail(
        `decisions[${i}]`,
        "Each decision needs a unique id.",
        'Use "d-<section>-<n>".',
      );
    seen.add(String(e.id));
    if (!SECTIONS.some((s) => s.id === e.section))
      fail(
        `decisions[${i}]`,
        `Unknown section "${String(e.section)}".`,
        `Use one of: ${SECTIONS.map((s) => s.id).join(", ")}.`,
      );
    if (!isText(e.choice, 500) || !isText(e.because, 500))
      fail(
        `decisions[${i}]`,
        "choice and because are required.",
        "Say what you chose and which rule or example made you.",
      );
    if (!SOURCES.has(String(e.source)))
      fail(
        `decisions[${i}]`,
        "source must be rule, example, owner or memory.",
        "Name where the choice came from.",
      );
  }
  for (const s of SECTIONS)
    if (decisions && !decisions.some((d) => isObject(d) && d.section === s.id))
      out.push({
        level: "warn",
        code: "memory",
        where: `decisions`,
        message: `No decision recorded for section ${s.id}.`,
        fix: "Record at least one decision per section so run B can repeat it.",
      });

  if (!Array.isArray(m.corrections))
    fail(
      "corrections",
      "corrections must be a list (it may be empty).",
      "Copy the owner's corrections from the skill.",
    );
  const checkpoints = Array.isArray(m.checkpoints) ? m.checkpoints : null;
  if (!checkpoints)
    fail("checkpoints", "checkpoints must be a list.", "Add one per step.");
  for (const [i, c] of (checkpoints ?? []).entries()) {
    const e = isObject(c) ? c : {};
    if (!STEPS.has(String(e.step)) || !isText(e.summary, 1000))
      fail(
        `checkpoints[${i}]`,
        "Each checkpoint needs a step and a summary.",
        `Steps: ${[...STEPS].join(", ")}.`,
      );
  }
  const outputs = isObject(m.outputs) ? m.outputs : undefined;
  if (!isText(outputs?.cut, 200))
    fail("outputs.cut", "outputs.cut is missing.", 'Write "cut.json".');
  return out;
}
