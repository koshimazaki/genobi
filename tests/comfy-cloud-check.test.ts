import { describe, expect, it, vi } from "vitest";
import {
  checkComfyCloud,
  COMFY_INFO_MAX_BYTES,
} from "../server/comfy-cloud-check";
import { kleinWorkflow } from "../shared/comfy/klein";
import { infoFor } from "./comfy-readiness-fixture";

const key = "comfyui-readiness-fixture";
const templates = [kleinWorkflow];
describe("read-only Cloud catalogue transport", () => {
  it("reads the fixed Cloud v1 endpoint with X-API-Key and never submits", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(infoFor(kleinWorkflow.graph)));
    const report = await checkComfyCloud(templates, key, fetcher);
    expect(report.templates[kleinWorkflow.id].status).toBe("compatible");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://cloud.comfy.org/api/object_info",
      expect.objectContaining({
        method: "GET",
        headers: { "X-API-Key": key, Accept: "application/json" },
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(JSON.stringify(report)).not.toContain(key);
  });

  it("refuses wrong or missing keys without any request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const value of [undefined, "", "bfl-key-fixture"])
      await expect(
        checkComfyCloud(templates, value, fetcher),
      ).rejects.toMatchObject({ code: "invalid_key" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not follow redirects or report network/provider failures as compatibility", async () => {
    for (const status of [302, 401, 403, 429, 500]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(`private ${key}`, {
          status,
          headers: { Location: "https://elsewhere.example" },
        }),
      );
      await expect(
        checkComfyCloud(templates, key, fetcher),
      ).rejects.not.toThrow(key);
      expect(fetcher).toHaveBeenCalledOnce();
    }
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(key));
    await expect(
      checkComfyCloud(templates, key, fetcher),
    ).rejects.toMatchObject({ code: "workflow_check_unavailable" });
  });

  it("bounds streamed bytes even without Content-Length and rejects malformed schemas", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(COMFY_INFO_MAX_BYTES + 1));
      },
      cancel,
    });
    const oversized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream));
    await expect(
      checkComfyCloud(templates, key, oversized),
    ).rejects.toMatchObject({ code: "workflow_check_unavailable" });
    expect(cancel).toHaveBeenCalledOnce();
    const cancelDeclared = vi.fn();
    const declared = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new ReadableStream({ cancel: cancelDeclared }), {
        headers: { "Content-Length": String(COMFY_INFO_MAX_BYTES + 1) },
      }),
    );
    await expect(
      checkComfyCloud(templates, key, declared),
    ).rejects.toMatchObject({ code: "workflow_check_unavailable" });
    expect(cancelDeclared).toHaveBeenCalledOnce();
    for (const body of ["not JSON", "[]", "{}", '{"error":"private"}']) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(body));
      await expect(
        checkComfyCloud(templates, key, fetcher),
      ).rejects.toMatchObject({ code: "workflow_check_unavailable" });
    }
  });
});
