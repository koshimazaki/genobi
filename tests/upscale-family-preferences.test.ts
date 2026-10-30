import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { applyCommand } from "../shared/director/commands";
import { matchesSelection } from "../shared/licensing/selection";
import { renderReport } from "../shared/licensing/render-report";
import { registry } from "../shared/registry";
import { validateProject } from "../src/director/validate";
import { tools } from "../mcp/tools";
import { GenobiApi } from "../mcp/api";

// The Upscale family holds SeedVR2 and FLUX Video Upscale. A saved family
// preference must survive a project reload, and a saved "flux" must still
// take FLUX Video Upscale, BFL's model, wherever it sits in the menu.
const project = () =>
  validateProject(
    JSON.parse(
      readFileSync("docs/director-bundle/example/studio.json", "utf8"),
    ),
  );
const ids = (family: string) =>
  registry
    .filter((e) => matchesSelection(e, { family } as never))
    .map((e) => e.id);

describe("family preferences after the Upscale family", () => {
  it("saves h3 and upscale and validates them again on reload", () => {
    for (const family of ["h3", "upscale"] as const) {
      const preferences = { selection: { family } };
      const result = applyCommand(
        { project: project(), prompt: "" },
        { op: "set-preferences", preferences },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const reloaded = validateProject(
        JSON.parse(JSON.stringify(result.copy.project)),
      );
      expect(reloaded.preferences).toEqual(preferences);
    }
  });

  it("keeps FLUX Video Upscale under a saved flux, and SeedVR2 out of it", () => {
    expect(ids("flux")).toContain("flux-video-upscale");
    expect(ids("flux")).not.toContain("seedvr2-upscale");
    expect(ids("upscale")).toEqual(["seedvr2-upscale", "flux-video-upscale"]);
    // LTX's Router entries are not BFL's, so flux still leaves them out.
    expect(ids("flux")).not.toContain("ltx-2-5-fast");
  });

  it("reports no family conflict for a FLUX upscale under a saved flux", () => {
    const p = project();
    const layer = p.layers.find((l) => "assetId" in l)!;
    if (!("assetId" in layer)) throw new Error("Fixture needs media");
    p.assets[layer.assetId].origin = "generated";
    p.assets[layer.assetId].generationId = "upscaled";
    p.generations.push({
      id: "upscaled",
      outputAssetIds: [layer.assetId],
      inputAssetIds: [],
      referenceAssetIds: [],
      prompt: "",
      tool: "",
      recipe: { id: "flux-video-upscale", version: 1, route: "router" },
    });
    const report = renderReport(p, {
      usage: { purpose: "commercial-video", policy: "any-licensed" },
      selection: { family: "flux" },
    });
    expect(report.models[0]).toContain("FLUX Video Upscale");
    expect(report.conflicts.join(" ")).not.toContain("model family");
  });

  it("lists FLUX Video Upscale in genobi_models for flux, both for upscale", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("No request allowed"));
    const api = new GenobiApi(new URL("http://127.0.0.1:4317"), fetcher);
    const tool = tools.find((t) => t.name === "genobi_models")!;
    const list = async (family: string) =>
      (
        (await tool.run(
          api,
          z
            .object(tool.inputSchema)
            .parse({ status: "ready", selection: { family } }),
        )) as { id: string }[]
      ).map((row) => row.id);
    expect(await list("flux")).toContain("flux-video-upscale");
    expect(await list("upscale")).toEqual([
      "seedvr2-upscale",
      "flux-video-upscale",
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
