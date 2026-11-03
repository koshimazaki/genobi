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

it("a queued run quotes under the location it was queued with, not the current one", async () => {
  const { useSettingsStore } = await import("../src/settings-store");
  const old = useSettingsStore.getState().location;
  // Queued while local; the setting moved to the deployment since.
  useSettingsStore.setState({ location: "deployment" });
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ quote }));
  vi.stubGlobal("fetch", fetcher);
  const send = vi.fn(async () => {});
  const upscale = {
    ...input,
    generator: "upscale" as const,
    model: "seedvr2-upscale" as const,
  };
  try {
    await submitWithDeploymentApproval(upscale, "", send, {
      "Genobi-Run-Location": "local",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(upscale, undefined);
  } finally {
    useSettingsStore.setState({ location: old });
  }
});

it("marks a failed quote so the note says nothing was sent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ error: "Bad gateway" }, { status: 502 }),
    ),
  );
  const { GenerationQueue } = await import("../src/generation-queue");
  const send = vi.fn(async () => {});
  const notes: string[] = [];
  const queue = new GenerationQueue<GenerateInput>(
    (run) => submitWithDeploymentApproval(run, "", send),
    { change: () => {}, halt: (note) => notes.push(note) },
  );
  queue.add(input);
  await vi.waitFor(() => expect(notes).toHaveLength(1));
  expect(send).not.toHaveBeenCalled();
  expect(notes[0]).toMatch(/nothing was sent/);
  expect(notes[0]).not.toMatch(/may have started/);
});
