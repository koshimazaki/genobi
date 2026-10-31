import { beforeEach, describe, expect, it } from "vitest";
import {
  call,
  cloudCatalogue,
  cloudRequests,
  mf,
  useWorker,
} from "./worker-harness";
import { infoFor } from "./comfy-readiness-fixture";
import { kleinWorkflow } from "../shared/comfy/klein";

useWorker();
beforeEach(() => {
  cloudCatalogue.body = infoFor(kleinWorkflow.graph);
  cloudCatalogue.status = 200;
  cloudRequests.length = 0;
});
describe("hosted Cloud workflow readiness", () => {
  it("requires a visitor Comfy key and performs only the requested metadata read", async () => {
    expect((await call("/api/settings/workflows")).status).toBe(200);
    expect(cloudRequests).toHaveLength(0);
    for (const key of [undefined, "bfl-fixture-key"]) {
      const response = await call("/api/settings/workflows?check=cloud", {
        headers: key ? { "x-byo-key": key } : {},
      });
      expect(response.status).toBe(400);
    }
    expect(cloudRequests).toHaveLength(0);
    const response = await call("/api/settings/workflows?check=cloud", {
      headers: { "x-byo-key": "comfyui-hosted-fixture" },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      cloud: { templates: Record<string, { status: string }> };
    };
    expect(result.cloud.templates[kleinWorkflow.id].status).toBe("compatible");
    expect(cloudRequests).toEqual([
      {
        method: "GET",
        path: "/api/object_info",
        apiKey: true,
        bearer: false,
        idempotency: null,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("comfyui-hosted-fixture");
    const db = await mf.getD1Database("DB");
    expect(await db.prepare("SELECT count(*) AS n FROM jobs").first("n")).toBe(
      0,
    );
    expect(
      await db
        .prepare("SELECT count(*) AS n FROM deployment_settings")
        .first("n"),
    ).toBe(0);
  });

  it("does not turn a Cloud access failure into an empty successful catalogue", async () => {
    cloudCatalogue.status = 401;
    cloudCatalogue.body = { error: "provider-private-detail" };
    const response = await call("/api/settings/workflows?check=cloud", {
      headers: { "x-byo-key": "comfyui-hosted-fixture" },
    });
    expect(response.status).toBe(401);
    const result = await response.text();
    expect(result).toContain("workflow_check_access");
    expect(result).not.toContain("provider-private-detail");
  });
});
