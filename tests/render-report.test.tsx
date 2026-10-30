import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderReadme, renderReport } from "../shared/licensing/render-report";
import { publicGenerationRecipe } from "../shared/director/generation-recipe";
import { validateProject } from "../src/director/validate";
import RenderResult from "../src/director/RenderResult";

const project = () =>
  validateProject(
    JSON.parse(
      readFileSync("docs/director-bundle/example/studio.json", "utf8"),
    ),
  );
const usage = { purpose: "commercial-video", policy: "any-licensed" } as const;

describe("the report attached to a finished render", () => {
  it("reports engines referenced by active layers, not every recommendation", () => {
    const p = project();
    p.layers = p.layers.filter(
      (l) => "moduleId" in l && p.modules[l.moduleId].engine === "animejs",
    );
    const report = renderReport(p, { usage });
    expect(report.libraryVersions).toEqual(["animejs 4.5.0"]);
    expect(renderReadme(report)).not.toContain("Paper Shaders");
    expect(renderReadme(report)).not.toContain("p5 2.3.4");
    expect(report.status).toBe("Needs review");
    expect(report.gaps.join(" ")).toContain("licence obligations");
  });
  it("shows a strict-policy conflict without pretending missing rights passed", () => {
    const report = renderReport(project(), {
      usage: { ...usage, policy: "mit-only" },
    });
    expect(report.status).toBe("Conflict found");
    expect(report.conflicts.join(" ")).toContain("p5");
    expect(report.gaps.join(" ")).toContain("media rights");
  });
  it("uses recorded recipes and never infers a model from free-form tool text", () => {
    const p = project();
    const layer = p.layers.find((l) => "assetId" in l)!;
    if (!("assetId" in layer)) throw new Error("Fixture needs media");
    p.assets[layer.assetId].origin = "generated";
    p.assets[layer.assetId].generationId = "render-source";
    p.generations.push({
      id: "render-source",
      outputAssetIds: [layer.assetId],
      inputAssetIds: [],
      referenceAssetIds: [],
      prompt: "PRIVATE PROMPT",
      tool: "PRIVATE PATH /secret/model",
      recipe: { id: "ltx-2-5-fast", version: 1, route: "router" },
    });
    const report = renderReport(p, {
      usage,
      selection: { family: "flux", execution: "local" },
    });
    expect(report.models[0]).toContain("LTX-2.5 Fast");
    expect(report.status).toBe("Conflict found");
    expect(renderReadme(report)).not.toMatch(/PRIVATE|secret|render-source/);
    delete p.generations.at(-1)!.recipe;
    expect(renderReport(p, { usage }).models).toContain("Model not recorded");
  });
  it("excludes unplaced assets from the used inventory", () => {
    const p = project();
    p.layers = [];
    const report = renderReport(p, { usage });
    expect(report.models).toEqual([]);
    expect(report.gaps.join(" ")).not.toContain("Input media");
  });
  it("strips provider identity and private workflow data from recipe metadata", () => {
    expect(
      publicGenerationRecipe({
        id: "ltx-2-5-fast",
        version: 1,
        route: "router",
        jobId: "private",
        workflow: "/private/path",
        apiKey: "secret",
      }),
    ).toEqual({ id: "ltx-2-5-fast", version: 1, route: "router" });
    expect(
      publicGenerationRecipe({
        id: "https://secret",
        version: 1,
        route: "router",
      }),
    ).toBeUndefined();
  });
  it("keeps provenance for older takes recorded on the cloud route", () => {
    expect(
      publicGenerationRecipe({
        id: "ltx-2-5-fast",
        version: 1,
        route: "cloud",
      }),
    ).toEqual({ id: "ltx-2-5-fast", version: 1, route: "workflow" });
  });
  it("renders inline with video, README and edit actions", () => {
    const html = renderToStaticMarkup(
      <RenderResult
        url="blob:result"
        report={renderReport(project(), { usage })}
        edit={() => {}}
      />,
    );
    expect(html).toContain("<video");
    expect(html).toContain("Download README");
    expect(html).toContain("Edit in Editor");
    expect(html).toContain("Needs review");
    expect(html).not.toContain("<dialog");
  });
});

it("deduplicates a shared conflict across two generated clips", () => {
  const p = project();
  const layer = p.layers.find((l) => l.kind === "image" || l.kind === "video")!;
  if (!("assetId" in layer)) throw new Error("Fixture needs a visual asset");
  const original = p.assets[layer.assetId];
  p.assets[layer.assetId] = {
    ...original,
    origin: "generated",
    generationId: "take-one",
  };
  p.assets["second"] = {
    ...original,
    origin: "generated",
    generationId: "take-two",
  };
  p.layers.push({ ...layer, id: "second-layer", assetId: "second" });
  for (const [id, assetId] of [
    ["take-one", layer.assetId],
    ["take-two", "second"],
  ])
    p.generations.push({
      id,
      outputAssetIds: [assetId],
      inputAssetIds: [],
      referenceAssetIds: [],
      prompt: "test",
      tool: "Genobi",
      recipe: { id: "ltx-2-5-fast", version: 1, route: "router" },
    });
  const report = renderReport(p, { usage, selection: { execution: "local" } });
  expect(report.conflicts).toHaveLength(1);
  expect(report.status).toBe("Conflict found");
  const html = renderToStaticMarkup(
    <RenderResult url="blob:test" report={report} edit={() => {}} />,
  );
  expect(html.split(report.conflicts[0])).toHaveLength(2);
});
