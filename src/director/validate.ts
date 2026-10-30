import { COMPOSITION_MAX_PIXELS } from "../../shared/director/resolution";
import validators from "./generated-validators.mjs";
import knownProject from "../../docs/director-bundle/example/studio.json";
import { effectModules } from "./effect-modules";
const canonical = (v: unknown): string =>
  JSON.stringify(
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, JSON.parse(canonical(v))]),
        )
      : v,
  );
import { FEEDBACK_BASE_BYTES, jsonBytes } from "../../shared/director/feedback";
import {
  checkReferences,
  LAYER_LIMIT,
  type Project,
} from "../../shared/director/types";
const shape = validators.project;
export function validateProject(value: unknown): Project {
  if (!shape(value))
    throw new Error(
      `Invalid bundle: ${(shape.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join(", ")}`,
    );
  const p = value as Project;
  checkProject(p);
  checkFeedbackBase(p);
  return p;
}

/**
 * What the schema cannot see: preview limits, references, and recipes from
 * the trusted registry with its own parameter schemas, so no pattern or rule
 * a file brings with it is ever run.
 */
function checkProject(p: Project) {
  if (
    p.layers.length > LAYER_LIMIT ||
    Object.keys(p.assets).length > 100 ||
    Object.keys(p.modules).length > 32
  )
    throw new Error(
      `Preview limit: ${LAYER_LIMIT} layers, 100 assets, 32 modules`,
    );
  if (
    p.composition.width * p.composition.height > COMPOSITION_MAX_PIXELS ||
    p.composition.durationFrames / p.composition.fps > 120
  )
    throw new Error("First renderer supports up to 1080p and 120 seconds");
  checkReferences(p);
  for (const [id, m] of Object.entries(p.modules)) {
    const trusted = [
      ...Object.values(knownProject.modules),
      ...Object.values(effectModules),
    ].find(
      (k) =>
        k.file.sha256 === m.file.sha256 &&
        k.engine === m.engine &&
        k.engineVersion === m.engineVersion &&
        k.mode === m.mode,
    );
    if (!trusted)
      throw new Error(
        `Unregistered graphics module: ${id}. Add this recipe to the local source before importing.`,
      );
    if (canonical(m.parameterSchema) !== canonical(trusted.parameterSchema))
      throw new Error(`Recipe parameter schema changed: ${id}`);
    const parameters = validators[`module_${trusted.file.sha256}`];
    for (const l of p.layers)
      if ("moduleId" in l && l.moduleId === id && !parameters(l.parameters))
        throw new Error(`Invalid parameters: ${l.name}`);
  }
}

/**
 * The agent's revision the feedback is measured from: the same project at an
 * earlier or the same revision, held to every check a project is (its
 * recipes included, since feedback replays commands against it) and to
 * `FEEDBACK_BASE_BYTES`. The schema has already refused a base in the base.
 */
function checkFeedbackBase(p: Project) {
  if (!p.feedbackBase) return;
  const base = p.feedbackBase.project;
  if (base.id !== p.id || base.revision > p.revision)
    throw new Error("The agent's revision belongs to another project");
  if (jsonBytes(p.feedbackBase) > FEEDBACK_BASE_BYTES)
    throw new Error("The agent's revision is over 1 MB");
  try {
    checkProject(base);
  } catch (error) {
    throw new Error(
      `The agent's revision: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
}
