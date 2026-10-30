import { expect, it, vi } from "vitest";
import { tools } from "../mcp/tools";
import { GenobiApi } from "../mcp/api";
import { entryFor } from "../shared/registry";
import { runLocations } from "../shared/licensing/selection";

it("keeps Camera-only deployment models out of terminal discovery and local execution claims", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const api = new GenobiApi(new URL("http://127.0.0.1:4317"), fetcher);
  const tool = tools.find((t) => t.name === "genobi_models")!;
  const models = (await tool.run(api, { status: "ready" })) as { id: string }[];
  expect(models.length).toBeGreaterThan(0);
  expect(models.some((m) => m.id.startsWith("ltx-deploy-"))).toBe(false);
  expect(runLocations(entryFor("video", "ltx-deploy-layout-to-video"))).toEqual(
    ["cloud"],
  );
  expect(runLocations(entryFor("video", "ltx-deploy-akuspace"))).toEqual([
    "cloud",
  ]);
  expect(fetcher).not.toHaveBeenCalled();
});
