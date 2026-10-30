import { describe, expect, it, vi } from "vitest";
import {
  ComfySdkWorkflows,
  destinationFetch,
  type Connect,
  type SdkClient,
  type SdkJob,
} from "../server/comfy-sdk";
import { akuspaceValues, akuspaceWorkflow } from "../shared/comfy/akuspace";

// The workflow route through @comfyorg/sdk, with no network: either a fake SDK
// client, or the real SDK handed a fake fetch.
const key = "comfyui-fixture-private-key";
const values = akuspaceValues(
  { duration: 6, aspectRatio: "16:9", resolution: "hd" },
  "A drummer warms up. AKUSPACE in an empty club",
  () => 0.5,
);
const signed = "https://storage.googleapis.com/out/clip.mp4?X-Goog-Sig=1";
const run = (client: ComfySdkWorkflows) =>
  client.run(akuspaceWorkflow, values, key, { idempotencyKey: "job-a" });
const v2Job = (status: string, outputs: object[] = []) => ({
  id: "job-1",
  status,
  created_at: "2026-10-21T00:00:00Z",
  started_at: null,
  completed_at: null,
  expires_at: "2026-10-22T00:00:00Z",
  queue_position: null,
  progress: status === "running" ? { value: 0.4 } : null,
  outputs,
  error: null,
  urls: { self: "/api/v2/jobs/job-1", events: "", cancel: "" },
});
const video = {
  id: "asset-1",
  node_id: "75",
  name: "clip.mp4",
  type: "video",
  content_type: "video/mp4",
  size_bytes: 3,
};

function fakeSdk(job: Partial<SdkJob> = {}) {
  const submitted: { graph: unknown; idempotencyKey: string }[] = [];
  const client: SdkClient = {
    workflows: { fromJson: (graph) => graph },
    async submit(graph, { idempotencyKey }) {
      submitted.push({ graph, idempotencyKey });
      return { id: "job-1" };
    },
    jobs: {
      get: async () => ({
        id: "job-1",
        status: "running",
        progress: null,
        outputs: [],
        ...job,
      }),
    },
  };
  const connect = vi.fn<Connect>(() => client);
  return { connect, submitted };
}

describe("the workflow route on Comfy Cloud through the SDK", () => {
  it("submits the filled graph once under the reserved job's key", async () => {
    const { connect, submitted } = fakeSdk();
    const client = new ComfySdkWorkflows({ connect, env: {} });
    expect(await run(client)).toBe("https://cloud.comfy.org/api/v2/jobs/job-1");
    expect(connect).toHaveBeenCalledOnce();
    expect(connect.mock.calls[0][0]).toBe(key);
    expect(submitted).toHaveLength(1);
    expect(submitted[0].idempotencyKey).toBe("job-a");
    const graph = submitted[0].graph as Record<
      string,
      { inputs: Record<string, unknown> }
    >;
    expect(graph["398:376"].inputs.value).toBe(values.prompt);
    expect(graph["900"].inputs.lora_name).toBe(
      "akuspace-ltx25-v0.5.safetensors",
    );
    expect(JSON.stringify(graph)).not.toContain(key);
  });

  it("speaks Comfy API v2 with the real SDK: one POST, job read, signed link", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn<typeof fetch>(async (target, init) => {
      const url = String(target);
      calls.push({ url, init });
      if (url === "https://cloud.comfy.org/api/v2/jobs")
        return Response.json(v2Job("queued"), { status: 201 });
      if (url === "https://cloud.comfy.org/api/v2/jobs/job-1")
        return Response.json(v2Job("succeeded", [video]));
      if (url === "https://cloud.comfy.org/api/v2/assets/asset-1/content")
        return new Response(null, {
          status: 302,
          headers: { Location: signed },
        });
      if (url === signed) return new Response("mp4");
      return new Response("unexpected", { status: 500 });
    });
    const client = new ComfySdkWorkflows({ fetcher, env: {} });
    const handle = await run(client);
    expect(await client.poll(handle, key)).toEqual({
      id: "job-1",
      status: "Ready",
      result: { sample: signed },
    });
    await client.download(signed);
    expect(calls.map((c) => `${c.init?.method ?? "GET"} ${c.url}`)).toEqual([
      "POST https://cloud.comfy.org/api/v2/jobs",
      "GET https://cloud.comfy.org/api/v2/jobs/job-1",
      "GET https://cloud.comfy.org/api/v2/assets/asset-1/content",
      `GET ${signed}`,
    ]);
    const headers = (i: number) => new Headers(calls[i].init?.headers);
    for (const i of [0, 1, 2]) {
      expect(headers(i).get("Authorization")).toBe(`Bearer ${key}`);
      expect(calls[i].init?.redirect).toBe("manual");
    }
    expect(headers(0).get("Idempotency-Key")).toBe("job-a");
    // The signed storage URL is fetched without the key.
    expect(headers(3).get("Authorization")).toBeNull();
    const body = JSON.parse(String(calls[0].init?.body));
    expect(Object.keys(body)).toEqual(["workflow"]);
    expect(body.workflow["398:376"].inputs.value).toBe(values.prompt);
    for (const call of calls) {
      expect(call.url).not.toContain(key);
      expect(String(call.init?.body ?? "")).not.toContain(key);
    }
  });

  it("never retries an uncertain submission", async () => {
    for (const fetcher of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { code: "error", message: key } },
            { status: 503 },
          ),
        ),
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("not json", { status: 201 })),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ id: "../x" }, { status: 201 })),
    ]) {
      const refusal = run(new ComfySdkWorkflows({ fetcher, env: {} }));
      await expect(refusal).rejects.toMatchObject({
        code: "submission_unknown",
      });
      await expect(refusal).rejects.not.toThrow(key);
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });

  it("names the node Cloud refused, and the LoRA fix", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "invalid_workflow",
            message: "bad",
            details: {
              node_errors: { "900": { class_type: "LoraLoaderModelOnly" } },
            },
          },
        },
        { status: 422 },
      ),
    );
    await expect(
      run(new ComfySdkWorkflows({ fetcher, env: {} })),
    ).rejects.toMatchObject({
      code: "workflow_rejected",
      message: expect.stringContaining("Import akuspace-ltx25-v0.5"),
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps job states, progress, a missing output and a gone job", async () => {
    const handle = "https://cloud.comfy.org/api/v2/jobs/job-1";
    const poll = (job: Partial<SdkJob>) =>
      new ComfySdkWorkflows({ connect: fakeSdk(job).connect, env: {} }).poll(
        handle,
        key,
      );
    expect(await poll({ status: "running", progress: { value: 0.4 } })).toEqual(
      { id: "job-1", status: "Generating", progress: 0.4 },
    );
    expect(await poll({ status: "queued", progress: { value: 7 } })).toEqual({
      id: "job-1",
      status: "Pending",
    });
    expect(await poll({ status: "failed" })).toEqual({
      id: "job-1",
      status: "Error",
    });
    // The failure detail reaches the job in Genobi's words, not as written.
    expect(
      await poll({
        status: "failed",
        error: {
          code: "execution_error",
          message: "CUDA out of memory. Tried to allocate 2 GiB at /srv/x",
          class_type: "TextGenerate",
        },
      }),
    ).toEqual({
      id: "job-1",
      status: "Error",
      error:
        "Comfy Cloud ran out of GPU memory at the TextGenerate node. Try a smaller size.",
    });
    expect((await poll({ status: "canceled" })).status).toBe("stopped");
    expect((await poll({ status: "succeeded", outputs: [] })).status).toBe(
      "Error",
    );
    const unsafe = await poll({
      status: "succeeded",
      outputs: [
        {
          nodeId: "75",
          type: "video",
          getDownloadUrl: async () => ({ url: "http://10.0.0.1/clip.mp4" }),
        },
      ],
    }).catch((error: Error) => error.message);
    expect(unsafe).toContain("delivery location");
    const gone = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { code: "not_found", message: "gone" } },
          { status: 404 },
        ),
      );
    expect(
      await new ComfySdkWorkflows({ fetcher: gone, env: {} }).poll(handle, key),
    ).toEqual({ id: "job-1", status: "Task not found" });
  });
});

describe("refusals before anything is sent", () => {
  it("a local ComfyUI destination refuses before any network call", async () => {
    // A deployment runs through the SDK on its own base (comfy-deployment.test.ts).
    for (const destination of [
      { kind: "local", url: "http://127.0.0.1:8188" },
    ] as const) {
      const fetcher = vi.fn<typeof fetch>();
      const { connect } = fakeSdk();
      const client = new ComfySdkWorkflows({
        destination,
        fetcher,
        connect,
        env: {},
      });
      await expect(run(client)).rejects.toMatchObject({
        status: 503,
        code: "workflow_not_configured",
        message: expect.stringContaining("Nothing was sent or charged."),
      });
      await expect(
        client.poll("https://cloud.comfy.org/api/v2/jobs/job-1", key),
      ).rejects.toMatchObject({ code: "workflow_not_configured" });
      expect(connect).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("refuses a BFL key and an environment that would move the SDK", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new ComfySdkWorkflows({ fetcher, env: {} }).run(
        akuspaceWorkflow,
        values,
        "bfl-visitor-key",
        { idempotencyKey: "job-a" },
      ),
    ).rejects.toMatchObject({ code: "workflow_unsent" });
    await expect(
      run(
        new ComfySdkWorkflows({
          fetcher,
          env: { COMFY_BASE_URL: "https://elsewhere.example" },
        }),
      ),
    ).rejects.toMatchObject({ code: "workflow_unsent" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lets the SDK reach Comfy Cloud only, never following a redirect", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    const guarded = destinationFetch("https://cloud.comfy.org", fetcher);
    await expect(
      guarded("https://elsewhere.example/api/v2/jobs", { method: "POST" }),
    ).rejects.toMatchObject({ code: "workflow_unsent" });
    expect(fetcher).not.toHaveBeenCalled();
    await guarded("https://cloud.comfy.org/api/v2/jobs/job-1", {
      redirect: "follow",
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });
});
