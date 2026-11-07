// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { submitWithDeploymentApproval } from "../src/deployment-approval";
import { CLOUD_GPU_ESTIMATE, CLOUD_UNCHECKED } from "../shared/quote";
import type { GenerateInput } from "../shared/types";

const input = { generator: "video", model: "ltx-2.5-open" } as GenerateInput;
const expected = {
  "Genobi-Run-Location": "cloud",
  "Genobi-Workflow": "ltx-2-5-t2v",
};
const offer = {
  id: "11111111-1111-4111-8111-111111111111",
  estimateUsd: 0.5,
  recipe: { id: "ltx-2-5-open", route: "workflow", location: "cloud" },
  availability: CLOUD_UNCHECKED,
  estimateNote: CLOUD_GPU_ESTIMATE,
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const serve = (quote: object) => {
  const fetcher = vi.fn(async () => Response.json({ quote }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};

it("shows unknown availability before a direct Generate and cancellation sends nothing", async () => {
  const fetcher = serve(offer);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const send = vi.fn(async () => {});
  expect(
    await submitWithDeploymentApproval(
      input,
      "comfyui-fixture",
      send,
      expected,
    ),
  ).toBe(false);
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining(CLOUD_UNCHECKED),
  );
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining(CLOUD_GPU_ESTIMATE),
  );
  expect(send).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("sends a checked Cloud run with its quote and no additional confirmation", async () => {
  const { availability: _unknown, ...checked } = offer;
  serve(checked);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const send = vi.fn(async () => {});
  expect(
    await submitWithDeploymentApproval(
      input,
      "comfyui-fixture",
      send,
      expected,
    ),
  ).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith(input, {
    quoteId: offer.id,
    idempotency: expect.any(String),
  });
});

it("never retries an uncertain submission after accepting unknown availability", async () => {
  const fetcher = serve(offer);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const send = vi.fn(async () => {
    throw new Error("submission_unknown");
  });
  await expect(
    submitWithDeploymentApproval(input, "comfyui-fixture", send, expected),
  ).rejects.toThrow("submission_unknown");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledOnce();
});

it("a refused Cloud quote leaves the paid request unsent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "Missing model", code: "workflow_unsent" },
        { status: 400 },
      ),
    ),
  );
  const send = vi.fn(async () => {});
  await expect(
    submitWithDeploymentApproval(input, "comfyui-fixture", send, expected),
  ).rejects.toThrow("Missing model");
  expect(send).not.toHaveBeenCalled();
});
