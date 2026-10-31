import { describe, expect, it, vi } from "vitest";
import { ServerKeys } from "../server/keys";
import { kleinWorkflow } from "../shared/comfy/klein";
import { GenobiApi, studioUrl } from "../mcp/api";
import { workflowTools } from "../mcp/workflow-tools";
import { GENOBI_TOOLS } from "../shared/agent-tools";
import { infoFor } from "./comfy-readiness-fixture";
import { setup } from "./server-harness";

describe("local Cloud readiness route and agent tool", () => {
  it("checks only on request and uses a visitor's key before the saved Comfy slot", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(infoFor(kleinWorkflow.graph)),
    );
    const app = await setup(
      undefined,
      undefined,
      undefined,
      new ServerKeys({
        comfy: "comfyui-saved-fixture",
        bfl: "bfl-saved-fixture",
      }),
      undefined,
      undefined,
      { cloudCheckFetcher: fetcher },
    );
    const get = (query = "", key?: string) =>
      fetch(`${app.base}/api/settings/workflows${query}`, {
        headers: { cookie: app.cookie, ...(key ? { "x-byo-key": key } : {}) },
      });
    expect((await get()).status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await (await get("?check=cloud")).json()).cloud.destination).toBe(
      "cloud",
    );
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      "X-API-Key": "comfyui-saved-fixture",
    });
    const result = await (
      await get("?check=cloud", "comfyui-visitor-fixture")
    ).json();
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      "X-API-Key": "comfyui-visitor-fixture",
    });
    expect(JSON.stringify(result)).not.toContain("visitor-fixture");
    expect((await get("?check=cloud", "bfl-visitor-fixture")).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(app.store.data.jobs).toHaveLength(0);
    expect(app.store.data.settings).toHaveLength(0);
  });

  it("lets studio agents discover Cloud readiness with the same MCP/CLI tool", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(infoFor(kleinWorkflow.graph)),
    );
    const app = await setup(
      undefined,
      undefined,
      undefined,
      new ServerKeys({ comfy: "comfyui-agent-fixture" }),
      undefined,
      undefined,
      { cloudCheckFetcher: fetcher },
    );
    const api = new GenobiApi(studioUrl(app.base), fetch, true);
    const tool = workflowTools.find(
      (item) => item.name === "genobi_workflows",
    )!;
    expect(GENOBI_TOOLS).toContain("genobi_workflows");
    const result = await tool.run(api, { checkCloud: true });
    expect(result).toMatchObject({ cloud: { destination: "cloud" } });
    await expect(
      tool.run(api, { checkCloud: true, checkLocal: true }),
    ).rejects.toThrow("Choose one check");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(app.store.data.jobs).toHaveLength(0);
  });
});
