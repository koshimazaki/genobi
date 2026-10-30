import type { Project } from "../director/types";
import { readyEntry } from "../registry";
import { licenceMarkdown, licenceReport } from "./report";
import { matchesSelection } from "./selection";
import {
  resolvePreferences,
  type ProjectPreferences,
} from "./project-preferences";

/** Snapshot of the rendered revision; never include prompts, paths or job IDs. */
export function renderReport(
  project: Project,
  defaults: ProjectPreferences = {},
) {
  const preferences = resolvePreferences(defaults, project.preferences);
  const layers = project.layers.filter(
    (l) =>
      !l.muted &&
      l.startFrame < project.composition.durationFrames &&
      l.startFrame + l.durationFrames > 0,
  );
  const assets = new Set(
    layers.flatMap((l) => ("assetId" in l ? [l.assetId] : [])),
  );
  const generations = new Set<string>();
  for (const id of assets) {
    const asset = project.assets[id];
    const generation = project.generations.find(
      (g) => g.id === asset?.generationId,
    );
    if (!generation || generations.has(generation.id)) continue;
    generations.add(generation.id);
    for (const input of [
      ...generation.inputAssetIds,
      ...generation.referenceAssetIds,
    ])
      assets.add(input);
  }
  const usedModules = new Set(
    layers.flatMap((l) => ("moduleId" in l ? [l.moduleId] : [])),
  );
  const engineIds = { threejs: "three", animejs: "animejs", p5: "p5" };
  const versions: Record<string, string> = {};
  const gaps: string[] = [];
  const conflicts: string[] = [];
  for (const id of usedModules) {
    const module = project.modules[id];
    const engine = engineIds[module.engine];
    if (versions[engine] && versions[engine] !== module.engineVersion)
      gaps.push(`Multiple versions of ${engine} are recorded.`);
    versions[engine] = module.engineVersion;
  }
  const libraries = preferences.usage
    ? licenceReport(preferences.usage, Object.keys(versions), "used", versions)
    : undefined;
  if (!preferences.usage)
    gaps.push("Intended use and licence preference were not recorded.");
  for (const row of libraries?.rows ?? []) {
    if (row.decision === "excluded")
      conflicts.push(`${row.name}: ${row.reason}`);
    if (row.decision === "review") gaps.push(`${row.name}: ${row.reason}`);
  }
  const models = [...generations].flatMap((id) => {
    const generation = project.generations.find((g) => g.id === id)!;
    // A local media tool's cut is an edit, not a model: its inputs in the
    // project were walked above, and an input outside it goes unrecorded.
    if (generation.derivation) {
      if (generation.derivation.sources.some((source) => !source.assetId))
        gaps.push(
          `A ${generation.derivation.operation} was made from media outside this project; the models behind that media are not recorded here.`,
        );
      return [];
    }
    const recipe = generation.recipe;
    const entry = recipe && readyEntry(recipe.id);
    if (!entry || !recipe) {
      gaps.push("A used generated asset has no recognized model recipe.");
      return "Model not recorded";
    }
    if (
      !matchesSelection(entry, { ...preferences.selection, execution: "any" })
    )
      conflicts.push(
        `${entry.label} conflicts with the requested model family or weights.`,
      );
    const location = recipe.route === "workflow" ? recipe.location : "cloud";
    const wanted = preferences.selection?.execution;
    if (wanted && wanted !== "any") {
      if (!location)
        gaps.push(`${entry.label}: execution location was not recorded.`);
      else if (location !== wanted)
        conflicts.push(
          `${entry.label} ran at ${location}, outside the requested ${wanted} execution.`,
        );
    }
    gaps.push(`${entry.label}: model/API terms and input rights need review.`);
    return `${entry.label} · recipe v${recipe.version} · ${recipe.route} · ${location ?? "location unknown"}`;
  });
  if (assets.size)
    gaps.push("Input media rights are not verified by the project manifest.");
  if (
    [...assets].some(
      (id) =>
        project.assets[id]?.origin === "generated" &&
        !project.assets[id]?.generationId,
    )
  )
    gaps.push("A generated asset has no generation record.");
  // The module inventory is not the whole application/dependency or font audit.
  gaps.push(
    "Runtime dependencies, fonts and fulfilment of licence obligations need separate evidence.",
  );
  gaps.push(
    "This check uses saved global/project preferences; session-only prompt overrides are not recorded here.",
  );
  const { width, height, fps, durationFrames } = project.composition;
  return {
    schema: "genobi.render-report.v1",
    revision: project.revision,
    summary: `${(durationFrames / fps).toFixed(2)} seconds · ${width} × ${height} · ${fps} fps · ${layers.length} active layers`,
    preferences,
    status: conflicts.length ? "Conflict found" : "Needs review",
    models: [...new Set(models)],
    libraryVersions: Object.entries(versions).map(
      ([id, version]) => `${id} ${version}`,
    ),
    libraries,
    gaps: [...new Set(gaps)],
    conflicts: [...new Set(conflicts)],
  };
}
export type RenderReport = ReturnType<typeof renderReport>;
export function renderReadme(report: RenderReport) {
  return [
    "# Director render",
    "",
    report.summary,
    `Project revision: ${report.revision}.`,
    "",
    `Preference check: **${report.status}**. This is an evidence report, not legal clearance.`,
    "",
    "## Requested preferences",
    "",
    "```json",
    JSON.stringify(report.preferences, null, 2),
    "```",
    "",
    "## Recorded models",
    "",
    ...report.models.map((model) => `- ${model}`),
    ...(report.models.length
      ? []
      : [
          "No recognized generation record contributes to this render; imported media may have other origins.",
        ]),
    "",
    "## Creative libraries",
    "",
    ...report.libraryVersions.map((library) => `- ${library}`),
    "",
    "## Conflicts and missing evidence",
    "",
    ...[...report.conflicts, ...report.gaps].map((gap) => `- ${gap}`),
    "",
    ...(report.libraries ? [licenceMarkdown(report.libraries)] : []),
  ].join("\n");
}
