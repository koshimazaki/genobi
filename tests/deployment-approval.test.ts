// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deploymentApproval,
  submitWithDeploymentApproval,
} from "../src/deployment-approval";
import type { GenerateInput } from "../shared/types";

const input = {
  generator: "video",
  model: "ltx-deploy-layout-to-video",
} as GenerateInput;
const quote = {
  id: "11111111-1111-4111-8111-111111111111",
  billing: "Comfy deployment GPU time",
  recipe: {
    id: "ltx-deploy-layout-to-video",
    deployment: { url: "https://test.run.comfy.app", name: "test" },
  },
};
afterEach(() => vi.unstubAllGlobals());
describe("deployment quote confirmation in Camera", () => {
  it("cancels without submitting and shows the real billing and deployment", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ quote }));
    vi.stubGlobal("fetch", fetcher);
    const confirm = vi.fn(() => false);
    expect(await deploymentApproval(input, "comfyui-test", confirm)).toBeNull();
    expect(confirm).toHaveBeenCalledWith(
      expect.stringMatching(/test\?[\s\S]*paid GPU time/),
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/quotes");
  });
  it("returns the quoted confirmation and one stable request key, with no paid call", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ quote }));
    vi.stubGlobal("fetch", fetcher);
    expect(await deploymentApproval(input, "comfyui-test", () => true)).toEqual(
      {
        quoteId: quote.id,
        idempotency: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

it("quotes and sends the same resolved upscale input, and cancellation sends nothing", async () => {
  const { useSettingsStore } = await import("../src/settings-store");
  const old = useSettingsStore.getState().location;
  useSettingsStore.setState({ location: "deployment" });
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ quote }));
  vi.stubGlobal("fetch", fetcher);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const send = vi.fn<
    (input: GenerateInput, approval: unknown) => Promise<void>
  >(async () => {});
  const upscale = {
    ...input,
    generator: "upscale" as const,
    model: "seedvr2-upscale" as const,
    sourceId: "resolved-library-source",
    description: "Resolved source title",
  };
  try {
    await submitWithDeploymentApproval(upscale, "comfyui-test", send);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(upscale);
    expect(send).toHaveBeenCalledWith(upscale, {
      quoteId: quote.id,
      idempotency: expect.any(String),
    });
    expect(send.mock.calls[0][0]).toBe(upscale);
    confirm.mockReturnValue(false);
    await submitWithDeploymentApproval(upscale, "comfyui-test", send);
    expect(send).toHaveBeenCalledOnce();
  } finally {
    confirm.mockRestore();
    useSettingsStore.setState({ location: old });
  }
});
