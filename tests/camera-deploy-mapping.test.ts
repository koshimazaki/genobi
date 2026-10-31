import manifest from "../workflows/ltx-world-builder.endpoints.json";
import { requireQuotedRun } from "../server/take";
import type { QuoteRecord } from "../shared/quote";
import { describe, expect, it } from "vitest";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import {
  DEPLOY_ENDPOINTS,
  deployEndpoint,
} from "../shared/comfy/deploy-catalogue";
import {
  deployGeometry,
  deployTemplates,
  deployValues,
} from "../shared/comfy/deploy-workflows";
import { fillSlots, danglingLinks } from "../shared/comfy/slots";
import { readDeployInput } from "../shared/comfy/deploy-input";
import { validateInput } from "../server/validation";
import { composePrompt } from "../shared/presets";
import { entriesFor, entryFor } from "../shared/registry";
import {
  requireTemplateFor,
  workflowCatalogue,
} from "../shared/comfy/workflows";
import { input } from "./server-harness";

const ticket = "11111111-1111-4111-8111-111111111111";
const recipe = JSON.stringify({
  version: 1,
  fps: 24,
  width: 1024,
  height: 576,
  frames: 193,
});

describe("Comfy Deploy registration and Camera placeholder mapping", () => {
  it("exposes only the curated GPU endpoints and the layout studio preset", () => {
    expect(deployGeometry("ltx-deploy-layout-to-video")).toBe("2560 × 1408");
    expect(
      deployGeometry(
        "ltx-deploy-layout-to-video",
        "world-builder-l2r-a2v-studio",
      ),
    ).toBe("2048 × 1152");
    expect(deployGeometry("ltx-deploy-akuspace")).toBe("1664 × 928");
    expect(DEPLOY_ENDPOINTS).toEqual(
      manifest.endpoints.filter((e) => e.runtime === "gpu").map((e) => e.name),
    );
    expect(deployTemplates.map((t) => t.id)).toEqual([
      "world-builder-l2r-a2v",
      "world-builder-l2r-a2v-studio",
      "ltx-i2v-a2v-akuspace",
    ]);
    expect(
      requireTemplateFor(
        "ltx-deploy-layout-to-video",
        "world-builder-l2r-a2v-studio",
      ).choice.id,
    ).toBe("world-builder-l2r-a2v-studio");
    expect(() =>
      requireTemplateFor("ltx-deploy-akuspace", "world-builder-l2r-a2v-studio"),
    ).toThrow();
    expect(() =>
      requireTemplateFor("ltx-deploy-layout-to-video", "ltx-i2v-a2v-akuspace"),
    ).toThrow();
  });
  it("accepts the documented Comfy host only, with no URL escape hatches", () => {
    expect(
      parseWorkflowDestination("deployment", "https://genobi.run.comfy.app/"),
    ).toEqual({ kind: "deployment", url: "https://genobi.run.comfy.app" });
    for (const url of [
      "http://genobi.run.comfy.app",
      "https://run.comfy.app",
      "https://genobi.run.comfy.app.evil.test",
      "https://a.b.run.comfy.app",
      "https://localhost",
      "https://169.254.169.254",
      "https://evil.test",
      "https://genobi.run.comfy.app:444",
      "https://genobi.run.comfy.app/api/v2",
      "https://genobi.run.comfy.app/?key=x",
      "https://genobi.run.comfy.app/#x",
      "https://user:pass@genobi.run.comfy.app",
    ])
      expect(() => parseWorkflowDestination("deployment", url), url).toThrow();
  });

  it("maps every manifest endpoint without changing source templates or leaving tokens", () => {
    for (const name of DEPLOY_ENDPOINTS) {
      const model = `ltx-deploy-${name}` as const;
      const endpoint = deployEndpoint(model);
      const template = deployTemplates.find(
        (t) => t.file === `workflows/${endpoint.workflow}`,
      )!;
      const original = JSON.stringify(template.graph);
      const needed = [...new Set(original.match(/__[A-Z0-9_]+__/g))].map(
        (token) => token.slice(2, -2),
      );
      const deploy = readDeployInput({
        seed: 4294967297,
        negativePrompt: "No cuts.",
        ...(needed.includes("RECIPE_JSON") ? { recipe } : {}),
        assets: Object.fromEntries(
          needed
            .filter((t) => /(_WEBM|_PNG|_AUDIO)$/.test(t))
            .map((t) => [t, ticket]),
        ),
      });
      const request = validateInput({
        ...input,
        model,
        duration: /^(fall15|vo_)/.test(name) ? 15 : 8,
        aspectRatio: "16:9",
        deploy,
      });
      const prompt = composePrompt(request);
      const values = deployValues(template, request, prompt);
      const graph = fillSlots(template.graph, template.slots, values);
      expect(JSON.stringify(graph), name).not.toMatch(/__[A-Z0-9_]+__/);
      expect(danglingLinks(graph), name).toEqual([]);
      expect(JSON.stringify(template.graph)).toBe(original);
      expect(Object.values(values)).toContain(prompt);
      expect(Object.values(values)).toContain(4294967297);
      if (needed.includes("REVERB_SEED"))
        expect(Object.values(values)).toContain(1);
      expect(template.graph[template.output!.nodeId].class_type).toBe(
        "SaveVideo",
      );
      expect(entryFor("video", model).camera).toBe("ltx-2.5");
    }
  });

  it("requires complete, bounded inputs and keeps the capture timing exact", () => {
    const template = deployTemplates.find(
      (t) => t.id === "world-builder-l2r-a2v",
    )!;
    const request = validateInput({
      ...input,
      model: "ltx-deploy-layout-to-video",
      duration: 8,
      aspectRatio: "16:9",
      deploy: { seed: 0, negativePrompt: "", assets: {} },
    });
    expect(() => deployValues(template, request, "A dive.")).toThrow(/Attach/);
    for (const seed of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "0"])
      expect(() =>
        readDeployInput({ seed, negativePrompt: "", assets: {} }),
      ).toThrow(/Seed/);
    expect(() =>
      readDeployInput({
        seed: 0,
        negativePrompt: "",
        recipe: recipe.replace('"frames":193', '"frames":194'),
        assets: {},
      }),
    ).toThrow(/capture recipe/);
    expect(() =>
      readDeployInput({ seed: 0, negativePrompt: "__PROMPT__", assets: {} }),
    ).toThrow();
    expect(() =>
      validateInput({
        ...input,
        model: "ltx-deploy-layout-to-video",
        duration: 7,
        aspectRatio: "16:9",
        deploy: { seed: 0, negativePrompt: "", assets: {} },
      }),
    ).toThrow(/fixed/);
  });

  it("shows deployment entries only after registration and also on hosted", () => {
    expect(entriesFor("ltx").some((e) => e.deploymentOnly)).toBe(false);
    expect(
      entriesFor("ltx", { deploymentRegistered: true }).filter(
        (e) => e.deploymentOnly,
      ),
    ).toHaveLength(DEPLOY_ENDPOINTS.length);
    expect(
      entriesFor("ltx", { hosted: true, deploymentRegistered: true }).some(
        (e) => e.deploymentOnly,
      ),
    ).toBe(true);
    expect(
      workflowCatalogue().entries.some((e) =>
        e.entry.startsWith("ltx-deploy-"),
      ),
    ).toBe(false);
    expect(
      workflowCatalogue(() => undefined, true, 0, true).entries.some((e) =>
        e.entry.startsWith("ltx-deploy-"),
      ),
    ).toBe(true);
    expect(() =>
      requireTemplateFor("ltx-deploy-layout-to-video", "ltx-i2v-vocalist"),
    ).toThrow();
  });
  it("binds quote destinations", async () => {
    const recipe = {
      id: "ltx-deploy-layout-to-video",
      version: 1,
      route: "workflow" as const,
      workflow: "world-builder-l2r-a2v",
      location: "deployment" as const,
      deployment: { name: "one", url: "https://one.run.comfy.app" },
    };
    expect(() =>
      requireQuotedRun({ recipe } as QuoteRecord, {
        ...recipe,
        deployment: { name: "two", url: "https://two.run.comfy.app" },
      }),
    ).toThrow(expect.objectContaining({ code: "quote_mismatch" }));
  });
});
