import { describe, expect, it, vi } from "vitest";
import { ComfySdkWorkflows, type SdkOutput } from "../server/comfy-sdk";
import { LocalComfyWorkflows } from "../server/comfy-local";
import type { WorkflowOutput } from "../shared/comfy/workflow";

const key = "comfyui-fixture-private-key";
const base = "https://cloud.comfy.org";
const expected: WorkflowOutput = {
  nodeId: "75",
  media: "video",
  companions: [
    { nodeId: "11", label: "Room impulse response" },
    { nodeId: "13", label: "Room wet mix" },
  ],
};
const signed = (node: string) => `https://storage.googleapis.com/out/${node}`;
const output = (nodeId: string, type = "video") => ({
  nodeId,
  type,
  getDownloadUrl: vi.fn(async () => ({ url: signed(nodeId) })),
});
function sdk(outputs: SdkOutput[], deployment = false) {
  const origin = deployment ? "https://fixture.run.comfy.app" : base;
  const submit = vi.fn();
  const client = new ComfySdkWorkflows({
    env: {},
    ...(deployment
      ? { destination: { kind: "deployment" as const, url: origin } }
      : {}),
    connect: () => ({
      workflows: { fromJson: (graph) => graph },
      submit,
      jobs: {
        get: async () => ({
          id: "job-1",
          status: "succeeded",
          progress: null,
          outputs,
        }),
      },
    }),
  });
  return {
    submit,
    poll: (contract: WorkflowOutput = expected) =>
      client.poll(`${origin}/api/v2/jobs/job-1`, key, contract),
  };
}

describe.each([false, true])(
  "named SDK outputs (deployment=%s)",
  (deployment) => {
    it("does not substitute a guide video for a missing final video", async () => {
      const guide = output("guide");
      const { poll, submit } = sdk([guide], deployment);
      expect(await poll()).toMatchObject({
        status: "Error",
        error: expect.stringContaining("expected video"),
      });
      expect(guide.getDownloadUrl).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    });

    it("requires the declared media kind at the declared node", async () => {
      const wrongKind = output("75", "image");
      const { poll } = sdk([wrongKind, output("guide")], deployment);
      expect((await poll()).status).toBe("Error");
      expect(wrongKind.getDownloadUrl).not.toHaveBeenCalled();
    });

    it("requires every named companion before resolving any delivery URL", async () => {
      for (const wrong of [undefined, output("13"), output("other", "audio")]) {
        const video = output("75");
        const ir = output("11", "audio");
        const { poll } = sdk(
          [video, ir, ...(wrong ? [wrong] : [])],
          deployment,
        );
        const result = await poll();
        expect(result).toMatchObject({
          status: "Error",
          error: expect.stringContaining("required audio"),
        });
        expect(result.result).toBeUndefined();
        expect(video.getDownloadUrl).not.toHaveBeenCalled();
        expect(ir.getDownloadUrl).not.toHaveBeenCalled();
      }
    });

    it("selects exact outputs regardless of provider order and retains their labels", async () => {
      const guide = output("guide");
      const extra = output("other", "audio");
      const { poll } = sdk(
        [
          guide,
          output("13", "audio"),
          extra,
          output("75"),
          output("11", "audio"),
        ],
        deployment,
      );
      expect(await poll()).toEqual({
        id: "job-1",
        status: "Ready",
        result: { sample: signed("75") },
        companions: expected.companions!.map(({ nodeId, label }) => ({
          nodeId,
          label,
          url: signed(nodeId),
        })),
      });
      expect(guide.getDownloadUrl).not.toHaveBeenCalled();
      expect(extra.getDownloadUrl).not.toHaveBeenCalled();
    });

    it("does not require companions for an ordinary image workflow", async () => {
      const { poll } = sdk([output("9", "image")], deployment);
      expect(await poll({ nodeId: "9", media: "image" })).toEqual({
        id: "job-1",
        status: "Ready",
        result: { sample: signed("9") },
      });
    });
  },
);

describe("SDK companion delivery errors", () => {
  const withAudio = (audio: SdkOutput) =>
    sdk([output("75"), output("11", "audio"), audio]);
  it("treats an expired companion like an expired primary", async () => {
    const audio = output("13", "audio");
    audio.getDownloadUrl.mockRejectedValue({ httpStatus: 404 });
    expect(await withAudio(audio).poll()).toEqual({
      id: "job-1",
      status: "Task not found",
    });
  });

  it("keeps a transient URL failure retryable, without exposing provider messages", async () => {
    const audio = output("13", "audio");
    audio.getDownloadUrl.mockRejectedValue({ httpStatus: 503, message: key });
    await expect(withAudio(audio).poll()).rejects.toMatchObject({
      status: 502,
      message: "Comfy Cloud could not complete the request.",
    });
  });

  it("rejects a companion URL outside the delivery allowlist", async () => {
    const audio = output("13", "audio");
    audio.getDownloadUrl.mockResolvedValue({ url: "http://127.0.0.1/private" });
    await expect(withAudio(audio).poll()).rejects.toThrow(
      "unsupported delivery location",
    );
  });
});

const file = (filename: string, extra: object = {}) => ({
  filename,
  subfolder: "",
  type: "output",
  ...extra,
});
function local(outputs: Record<string, unknown>) {
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    if (String(input).endsWith("/queue"))
      return Response.json({ queue_running: [], queue_pending: [] });
    return Response.json({
      "job-1": { status: { status_str: "success" }, outputs },
    });
  });
  const client = new LocalComfyWorkflows({ fetcher });
  return {
    fetcher,
    poll: (contract: WorkflowOutput = expected) =>
      client.poll("http://127.0.0.1:8188/history/job-1", "", contract),
  };
}

describe("named local ComfyUI outputs", () => {
  it("does not replace a missing or invalid final output with another node", async () => {
    for (const primary of [
      undefined,
      file("wrong.png"),
      file("../private.mp4"),
      file("final.mp4", { type: "input" }),
    ]) {
      const { poll } = local({
        guide: { videos: [file("guide.mp4")] },
        "75": { videos: primary ? [primary] : [] },
      });
      expect((await poll()).status).toBe("Error");
    }
  });

  it("refuses a missing or invalid required audio output", async () => {
    for (const audio of [
      undefined,
      file("wrong.mp4"),
      file("wet.wav", { subfolder: "../private" }),
    ]) {
      const { poll } = local({
        "75": { videos: [file("final.mp4")] },
        "11": { audio: [file("ir.wav")] },
        "13": { audio: audio ? [audio] : [] },
        other: { audio: [file("wrong.wav")] },
      });
      expect(await poll()).toMatchObject({
        status: "Error",
        error: expect.stringContaining("required audio"),
      });
    }
  });

  it("returns the exact final video and companions without downloading or submitting", async () => {
    const { poll, fetcher } = local({
      guide: { videos: [file("guide.mp4")] },
      "75": { videos: [file("final.mp4")] },
      "13": { audio: [file("wet.wav", { subfolder: "genobi/audio" })] },
      "11": { audio: [file("ir.wav")] },
    });
    expect(await poll()).toEqual({
      id: "job-1",
      status: "Ready",
      result: {
        sample:
          "http://127.0.0.1:8188/view?filename=final.mp4&subfolder=&type=output",
      },
      companions: [
        {
          nodeId: "11",
          label: "Room impulse response",
          url: "http://127.0.0.1:8188/view?filename=ir.wav&subfolder=&type=output",
        },
        {
          nodeId: "13",
          label: "Room wet mix",
          url: "http://127.0.0.1:8188/view?filename=wet.wav&subfolder=genobi%2Faudio&type=output",
        },
      ],
    });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "http://127.0.0.1:8188/queue",
      "http://127.0.0.1:8188/history/job-1",
    ]);
  });
});
