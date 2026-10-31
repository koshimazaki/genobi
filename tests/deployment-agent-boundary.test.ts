import { expect, it, vi } from "vitest";
import { tools } from "../mcp/tools";
import { GenobiApi } from "../mcp/api";
import { entryFor } from "../shared/registry";
import { runLocations } from "../shared/licensing/selection";

it("discovers deployment models with their stage prerequisite and never claims local execution", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const api = new GenobiApi(new URL("http://127.0.0.1:4317"), fetcher);
  const tool = tools.find((t) => t.name === "genobi_models")!;
  const models = (await tool.run(api, { status: "ready" })) as {
    id: string;
    inputModel: string;
    requiresDeployment?: boolean;
    stageTool?: string;
  }[];
  expect(models.length).toBeGreaterThan(0);
  expect(models.filter((m) => m.id.startsWith("ltx-deploy-"))).toEqual([
    expect.objectContaining({
      id: "ltx-deploy-layout-to-video",
      inputModel: "ltx-deploy-layout-to-video",
      requiresDeployment: true,
      stageTool: "genobi_deployment_stage",
    }),
    expect.objectContaining({
      id: "ltx-deploy-akuspace",
      inputModel: "ltx-deploy-akuspace",
      requiresDeployment: true,
      stageTool: "genobi_deployment_stage",
    }),
  ]);
  expect(runLocations(entryFor("video", "ltx-deploy-layout-to-video"))).toEqual(
    ["cloud"],
  );
  expect(runLocations(entryFor("video", "ltx-deploy-akuspace"))).toEqual([
    "cloud",
  ]);
  expect(fetcher).not.toHaveBeenCalled();
});
