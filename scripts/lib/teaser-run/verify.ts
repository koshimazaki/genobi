// Loads a teaser run (a folder with cut.json, or a cut file), runs every
// check and the similarity report, and returns the text the verifier prints
// with its exit code. The CLI is scripts/verify-teaser-run.mjs.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRUSTED_RECIPES } from "../../../shared/director/graphic-commands";
import { LAYER_LIMIT } from "../../../shared/director/types";
import { genobiTeaser } from "../../../shared/templates/genobi-teaser";
import type { TemplateMix } from "../../../shared/templates/types";
import { runMedia } from "./legacy";
import type { MixMedia, MixSpec } from "../../../shared/templates/mix";
import validators from "../../../src/director/generated-validators.mjs";
import {
  checkCut,
  summary,
  type Deps,
  type Finding,
  type TrackAnalysis,
} from "./check";
import { onScreenText } from "./claims";
import { checkMemory } from "./memory";
import { compare, copiedFrom, type Similarity } from "./similarity";

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const KIT = path.join(ROOT, "docs/genobi-teaser-run");
export const REFERENCES: Record<string, string> = {
  v1: path.join(ROOT, "tests/fixtures/teaser-run/v1.cut.json"),
  v2: path.join(ROOT, "tests/fixtures/teaser-run/v2.cut.json"),
  current: path.join(ROOT, "shared/templates/genobi-teaser.cut.json"),
};

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, "utf8"));
/** A file's JSON, or the parse error's message when it is not JSON. */
const tryJson = (file: string): { value: unknown; error: string | null } => {
  try {
    return { value: readJson(file), error: null };
  } catch (error) {
    return { value: null, error: (error as Error).message };
  }
};

export interface LoadedRun {
  cutPath: string;
  cut: unknown;
  dir: string | null;
  memory: unknown;
  /** Files that are not JSON, with the parser's message. */
  unreadable: { file: string; error: string }[];
}

/** A run folder (cut.json, memory.json, render/) or one cut file. */
export function loadRun(target: string): LoadedRun {
  const full = path.resolve(target);
  if (!existsSync(full)) throw new Error(`${target} does not exist.`);
  const dir = statSync(full).isDirectory() ? full : null;
  const cutPath = dir ? path.join(dir, "cut.json") : full;
  if (!existsSync(cutPath))
    throw new Error(`${cutPath} is missing: a run folder holds cut.json.`);
  const memoryPath = dir && path.join(dir, "memory.json");
  const cut = tryJson(cutPath);
  const memory =
    memoryPath && existsSync(memoryPath)
      ? tryJson(memoryPath)
      : { value: null, error: null };
  const unreadable = [
    ...(cut.error ? [{ file: "cut.json", error: cut.error }] : []),
    ...(memory.error ? [{ file: "memory.json", error: memory.error }] : []),
  ];
  return { cutPath, cut: cut.value, dir, memory: memory.value, unreadable };
}

/** v1, current, a run folder or a cut file. */
export function loadReference(name: string): { label: string; cut: MixSpec } {
  const file = REFERENCES[name];
  if (file) return { label: name, cut: readJson(file) as MixSpec };
  const run = loadRun(name);
  return { label: name, cut: run.cut as MixSpec };
}

/**
 * Checks against the given media: today's template media by default (the
 * repository's own cut), or a run's (`runMedia`: v1's or v2's), which is
 * what bundle.ts packages, so a run that verifies also renders.
 */
export function repoDeps(
  mediaIn: TemplateMix["media"] = genobiTeaser.mix!.media,
): Deps {
  const media = mediaIn as unknown as Record<
    string,
    MixMedia & { url?: string }
  >;
  const fns = validators;
  return {
    media,
    modules: new Set(Object.keys(TRUSTED_RECIPES)),
    kindOf: (module) =>
      TRUSTED_RECIPES[module].mode === "filter" ? "filter" : "graphics",
    layerLimit: LAYER_LIMIT,
    validate(module, parameters) {
      const fn = fns[`module_${TRUSTED_RECIPES[module].file.sha256}`];
      if (!fn) return `no validator for ${module}`;
      if (fn(parameters)) return true;
      const e = fn.errors?.[0];
      return e ? `${e.instancePath || "parameters"} ${e.message}` : "invalid";
    },
    exists: (publicPath) =>
      publicPath.startsWith("/") &&
      !publicPath.includes("..") &&
      existsSync(path.join(ROOT, "public", publicPath)),
    // The wording the owner already merged: v1, and the bundled cut.
    approvedText: Object.values(REFERENCES)
      .filter((f) => existsSync(f))
      .flatMap((f) => onScreenText(readJson(f) as MixSpec).map((t) => t.text)),
  };
}

export const loadAnalysis = (file = path.join(KIT, "track-analysis.json")) =>
  readJson(file) as TrackAnalysis;

export interface VerifyOptions {
  reference?: string;
  minSimilarity?: number;
  allowNewWording?: boolean;
  requireRender?: boolean;
  toleranceSeconds?: number;
}

/** Everything the verifier prints, and its exit code. */
export function verify(target: string, options: VerifyOptions = {}) {
  const run = loadRun(target);
  const analysis = loadAnalysis();
  const findings: Finding[] = run.unreadable.map((u) => ({
    level: "fail",
    code: "shape",
    where: u.file,
    message: `${u.file} is not valid JSON: ${u.error}`,
    fix: "Write one JSON object: double-quoted keys and strings, no trailing commas, no comments.",
  }));
  if (!run.unreadable.some((u) => u.file === "cut.json"))
    findings.push(
      ...checkCut(run.cut, repoDeps(runMedia(run.cut as MixSpec)), {
        analysis,
        allowNewWording: options.allowNewWording,
        toleranceSeconds: options.toleranceSeconds,
      }),
    );
  if (!findings.some((f) => f.code === "shape")) {
    const seen = new Set<string>();
    for (const [name, file] of Object.entries(REFERENCES)) {
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      if (seen.has(text)) continue;
      seen.add(text);
      if (copiedFrom(run.cut as MixSpec, JSON.parse(text) as MixSpec))
        findings.push({
          level: "fail",
          code: "copied-reference",
          where: "cut.json",
          message: `The cut is a copy of ${name === "current" ? "the cut bundled in shared/templates" : `the ${name} reference cut`}.`,
          fix: "Derive every shot and overlay from the brief, the track analysis and the capture log with the rules in docs/genobi-teaser-run/decision-table.md. Never copy another cut.",
        });
    }
  }
  if (run.memory !== null) findings.push(...checkMemory(run.memory));
  else if (run.dir)
    findings.push({
      level: "warn",
      code: "memory",
      where: "memory.json",
      message: "The run folder has no memory.json.",
      fix: "Write memory.json as you go (docs/genobi-teaser-run/README.md, the run's memory file); run B starts from it.",
    });
  if (run.dir)
    for (const file of ["render/render.mp4", "render/contact-sheet.png"])
      if (!existsSync(path.join(run.dir, file)))
        findings.push({
          level: options.requireRender ? "fail" : "warn",
          code: "render",
          where: file,
          message: `${file} is missing.`,
          fix: "Render with scripts/render-genobi-teaser.mjs <run>/render (step 9 of the skill).",
        });

  let similarity: Similarity | null = null;
  let referenceLabel = "";
  if (options.reference && !findings.some((f) => f.code === "shape")) {
    const ref = loadReference(options.reference);
    referenceLabel = ref.label;
    similarity = compare(run.cut as MixSpec, ref.cut);
    if (
      options.minSimilarity !== undefined &&
      similarity.score < options.minSimilarity
    )
      findings.push({
        level: "fail",
        code: "similarity",
        where: "cut",
        message: `Similarity ${similarity.score} is under ${options.minSimilarity}.`,
        fix: "Read the differences below; a repeat run changes nothing its memory.json did not record.",
      });
  }
  const fails = findings.filter((f) => f.level === "fail").length;
  const text = report(run, findings, similarity, referenceLabel);
  return { text, findings, similarity, exitCode: fails ? 1 : 0 };
}

function report(
  run: LoadedRun,
  findings: Finding[],
  similarity: Similarity | null,
  referenceLabel: string,
) {
  const lines: string[] = [];
  const fails = findings.filter((f) => f.level === "fail");
  const warns = findings.filter((f) => f.level === "warn");
  lines.push(
    `Teaser run check: ${path.relative(ROOT, run.cutPath) || run.cutPath}`,
  );
  lines.push(
    `cut.json sha256 ${createHash("sha256").update(readFileSync(run.cutPath)).digest("hex")}`,
  );
  if (!findings.some((f) => f.code === "shape")) {
    const s = summary(run.cut as MixSpec);
    lines.push(
      `${s.beats} beats, ${s.seconds} s, ${s.shots} shots, ${s.overlays} overlays, ${s.layers} layers in the Director`,
    );
  }
  lines.push(
    fails.length
      ? `RESULT: FAIL (${fails.length} to fix, ${warns.length} warnings)`
      : `RESULT: PASS (${warns.length} warnings)`,
  );
  for (const [title, list] of [
    ["Fix these", fails],
    ["Warnings", warns],
  ] as const) {
    if (!list.length) continue;
    lines.push("", `${title}:`);
    for (const [i, f] of list.entries())
      lines.push(
        `${i + 1}. [${f.code}] ${f.where}: ${f.message}`,
        `   Fix: ${f.fix}`,
      );
  }
  if (similarity) {
    const p = similarity.parts;
    lines.push(
      "",
      `Similarity to ${referenceLabel}: ${similarity.score}`,
      `  cuts on the same beats ${p.cuts} · same footage per section ${p.footage} · overlay counts ${p.overlays} · wording ${p.wording} · identical shots ${p.exactShots}`,
      "  Sections (present · footage · overlays run/reference):",
    );
    for (const s of similarity.sections)
      lines.push(
        `    ${s.id.padEnd(12)} ${s.present ? "yes" : "NO "} · ${s.footage} · ${s.overlays.run}/${s.overlays.reference}`,
      );
    lines.push("  Overlays by recipe (run/reference):");
    for (const [m, c] of Object.entries(similarity.overlayCounts))
      lines.push(`    ${m.padEnd(13)} ${c.run}/${c.reference}`);
    lines.push(
      similarity.differences.length
        ? `  Differences (${similarity.differences.length}):`
        : "  Differences: none",
    );
    for (const d of similarity.differences) lines.push(`    - ${d}`);
  }
  return lines.join("\n");
}
