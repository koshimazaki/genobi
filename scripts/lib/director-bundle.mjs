// Offline proposal validator. Reuses the locked ESLint toolchain's Ajv;
// this is not an application import or the future untrusted-upload boundary.
import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const eslintRequire = createRequire(require.resolve("eslint/package.json"));
const Ajv = eslintRequire("ajv");
const ajv = new Ajv({ allErrors: true, strictKeywords: true });
const schemaRoot = new URL(
  "../../docs/director-bundle/schema/",
  import.meta.url,
);
for (const file of ["resources", "layers"]) {
  ajv.addSchema(
    JSON.parse(readFileSync(new URL(`${file}.schema.json`, schemaRoot))),
  );
}
const shape = ajv.compile(
  JSON.parse(readFileSync(new URL("project.schema.json", schemaRoot))),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export function validateBundle(project, directory) {
  assert(shape(project), `Schema: ${ajv.errorsText(shape.errors)}`);
  const root = realpathSync(directory);
  const files = [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
  ];
  for (const { file } of files) {
    const path = realpathSync(resolve(root, file.path));
    assert(path.startsWith(root + sep), `Outside bundle: ${file.path}`);
    const bytes = readFileSync(path);
    assert(
      createHash("sha256").update(bytes).digest("hex") === file.sha256,
      `Hash mismatch: ${file.path}`,
    );
  }
  const { fps, durationFrames } = project.composition;
  const seen = new Set();
  for (const layer of project.layers) {
    assert(!seen.has(layer.id), `Duplicate layer: ${layer.id}`);
    seen.add(layer.id);
    assert(
      layer.startFrame + layer.durationFrames <= durationFrames,
      `Outside composition: ${layer.id}`,
    );
    if (layer.assetId) {
      const asset = project.assets[layer.assetId];
      assert(
        asset && asset.kind === layer.kind,
        `Wrong media kind: ${layer.id}`,
      );
      assert(asset.use === "production", `Reference-only media: ${layer.id}`);
      if (layer.kind !== "image")
        assert(
          (layer.sourceStartFrame + layer.durationFrames) / fps <=
            asset.durationSeconds + 1e-9,
          `Source overrun: ${layer.id}`,
        );
    } else {
      const module = project.modules[layer.moduleId];
      assert(module, `Unknown module: ${layer.id}`);
      assert(
        module.mode === (layer.kind === "filter" ? "filter" : "overlay"),
        `Wrong module mode: ${layer.id}`,
      );
      assert(
        ajv.validateSchema(module.parameterSchema),
        `Invalid parameter schema: ${layer.moduleId}`,
      );
      const validParameters = ajv.compile(module.parameterSchema);
      assert(
        validParameters(layer.parameters),
        `Invalid parameters: ${layer.id}`,
      );
    }
  }
  // Tracks: one family, no overlap, adjacent in layer order (shared/director/tracks.ts).
  const family = (kind) => (kind === "image" ? "video" : kind);
  const runs = [];
  for (const layer of project.layers) {
    const lane = layer.track ?? layer.id;
    if (runs.at(-1)?.lane === lane) runs.at(-1).layers.push(layer);
    else runs.push({ lane, layers: [layer] });
  }
  const lanes = new Set();
  for (const { lane, layers } of runs) {
    assert(!lanes.has(lane), `Track not adjacent: ${lane}`);
    lanes.add(lane);
    const sorted = [...layers].sort((a, b) => a.startFrame - b.startFrame);
    sorted.forEach((layer, i) => {
      assert(
        family(layer.kind) === family(sorted[0].kind),
        `Mixed track: ${lane}`,
      );
      const next = sorted[i + 1];
      assert(
        !next || layer.startFrame + layer.durationFrames <= next.startFrame,
        `Overlapping track: ${lane}`,
      );
    });
  }
  const generationIds = new Set();
  for (const generation of project.generations) {
    assert(
      !generationIds.has(generation.id),
      `Duplicate generation: ${generation.id}`,
    );
    generationIds.add(generation.id);
    for (const id of [
      ...generation.inputAssetIds,
      ...generation.referenceAssetIds,
      ...generation.outputAssetIds,
    ]) {
      assert(project.assets[id], `Unknown generation asset: ${id}`);
    }
    for (const id of generation.outputAssetIds) {
      assert(
        project.assets[id].origin === "generated" &&
          project.assets[id].generationId === generation.id,
        `Generation output backlink: ${id}`,
      );
    }
  }
  for (const [id, asset] of Object.entries(project.assets)) {
    if (asset.origin === "generated") {
      assert(
        generationIds.has(asset.generationId),
        `Missing generation: ${id}`,
      );
      assert(
        project.generations
          .find((g) => g.id === asset.generationId)
          .outputAssetIds.includes(id),
        `Missing generation output: ${id}`,
      );
    } else assert(!asset.generationId, `Fixture/upload has generation: ${id}`);
  }
  const planIds = new Set();
  for (const plan of project.generationPlans) {
    assert(!planIds.has(plan.id), `Duplicate generation plan: ${plan.id}`);
    planIds.add(plan.id);
    assert(
      project.assets[plan.replaceAssetId]?.use === "production",
      `Invalid replacement: ${plan.id}`,
    );
    for (const id of plan.referenceAssetIds)
      assert(project.assets[id], `Unknown reference: ${id}`);
  }
  return { layers: project.layers.length, files: files.length };
}
