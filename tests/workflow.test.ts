import { describe, expect, it, vi } from "vitest";
import { akuspaceValues, akuspaceWorkflow } from "../shared/comfy/akuspace";
import {
  isUnsent,
  NotYetWorkflow,
  pollError,
  submitError,
  workflowHandle,
  workflowJobId,
  workflowState,
} from "../shared/comfy/workflow";
import {
  notConfigured,
  parseWorkflowDestination,
} from "../shared/comfy/destination";
import { currentRoute } from "../shared/legacy-route";
import {
  danglingLinks,
  fillSlots,
  isLink,
  type ApiGraph,
} from "../shared/comfy/slots";
import akuspace from "../workflows/ltx-2-5-akuspace-t2v.json";
import plain from "../workflows/ltx-2-5-t2v.json";

const values = akuspaceValues(
  { duration: 6, aspectRatio: "16:9", resolution: "hd" },
  "A drummer warms up. AKUSPACE in an empty club",
  () => 0.5,
);

describe("the shipped graphs", () => {
  const graphs = { akuspace, plain } as unknown as Record<string, ApiGraph>;
  it("link only to nodes they hold, without the MiniMax upscaler", () => {
    for (const graph of Object.values(graphs)) {
      expect(danglingLinks(graph)).toEqual([]);
      expect(graph["405"]).toBeUndefined();
      expect(
        Object.values(graph).some((node) =>
          JSON.stringify(node.inputs).includes("minimax"),
        ),
      ).toBe(false);
      // Text to video, and no prompt enhancer rewriting the camera or the room.
      expect(graph["398:363"].inputs.value).toBe(true);
      expect(graph["398:383"].inputs.value).toBe(false);
    }
  });
  it("put the AKUSPACE LoRA between the UNET and both guiders", () => {
    const graph = graphs.akuspace;
    expect(graph["398:384"].class_type).toBe("UNETLoader");
    expect(graph["900"]).toMatchObject({
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["398:384", 0],
        lora_name: "akuspace-ltx25-v0.5.safetensors",
        strength_model: 1,
      },
    });
    for (const guider of ["398:388", "398:391"]) {
      expect(graph[guider].class_type).toBe("LTXVDualCFGGuider");
      expect(graph[guider].inputs.model).toEqual(["900", 0]);
    }
    const unetUsers = Object.entries(graph).filter(([, node]) =>
      Object.values(node.inputs).some(
        (value) => isLink(value) && value[0] === "398:384",
      ),
    );
    expect(unetUsers.map(([id]) => id)).toEqual(["900"]);
    // The plain graph is the same without it.
    expect(graphs.plain["900"]).toBeUndefined();
    expect(graphs.plain["398:388"].inputs.model).toEqual(["398:384", 0]);
    expect(graphs.plain["398:391"].inputs.model).toEqual(["398:384", 0]);
  });
  it("hold the nodes and models the template requires, and a literal at every slot", () => {
    const graph = akuspaceWorkflow.graph;
    const classes = Object.values(graph).map((node) => node.class_type);
    for (const node of akuspaceWorkflow.requiredNodes)
      expect(classes).toContain(node);
    for (const model of akuspaceWorkflow.requiredModels)
      expect(JSON.stringify(graph)).toContain(model);
    for (const { path } of Object.values(akuspaceWorkflow.slots)) {
      const dot = path.indexOf(".");
      const input = graph[path.slice(0, dot)]?.inputs[path.slice(dot + 1)];
      expect(input, path).toBeDefined();
      expect(isLink(input), path).toBe(false);
    }
    expect(akuspaceWorkflow.graph["398:372"].inputs.value).toBe(1280);
  });
});

describe("slot filling", () => {
  it("writes each value at its path on a copy", () => {
    const before = JSON.stringify(akuspaceWorkflow.graph);
    const filled = fillSlots(
      akuspaceWorkflow.graph,
      akuspaceWorkflow.slots,
      values,
    );
    expect(JSON.stringify(akuspaceWorkflow.graph)).toBe(before);
    expect(filled["398:376"].inputs.value).toBe(values.prompt);
    expect(filled["398:362"].inputs.value).toBe(6);
    expect(filled["398:361"].inputs.value).toBe(24);
    expect(filled["398:372"].inputs.value).toBe(1280);
    expect(filled["398:360"].inputs.value).toBe(704);
    expect(filled["900"].inputs.strength_model).toBe(1);
    expect(filled["398:339"].inputs.noise_seed).toBe(2 ** 47);
    expect(filled["398:338"].inputs.noise_seed).toBe(2 ** 47);
    // A dotted input name splits at the node id's first dot only.
    expect(
      fillSlots(
        akuspaceWorkflow.graph,
        { t: { path: "398:380.sampling_mode.seed", kind: "number" } },
        { t: 7 },
      )["398:380"].inputs["sampling_mode.seed"],
    ).toBe(7);
  });
  it("always asks for audio: the saved video carries the decoded track", () => {
    const filled = fillSlots(
      akuspaceWorkflow.graph,
      akuspaceWorkflow.slots,
      values,
    );
    // No slot can switch it off; the Router bodies send generate_audio: true.
    expect(
      Object.values(akuspaceWorkflow.slots).some((slot) =>
        /audio/i.test(slot.path),
      ),
    ).toBe(false);
    const save = Object.values(filled).find(
      (node) => node.class_type === "SaveVideo",
    )!;
    const [videoId] = save.inputs.video as [string, number];
    expect(filled[videoId].class_type).toBe("CreateVideo");
    const [audioId] = filled[videoId].inputs.audio as [string, number];
    expect(filled[audioId].class_type).toBe("LTXVAudioVAEDecode");
  });
  it("refuses a value it cannot place, before anything is sent", () => {
    const { graph, slots } = akuspaceWorkflow;
    for (const [extra, wrong] of [
      [{}, { unknown: 1 }],
      [{}, { prompt: 5 }],
      [{ link: { path: "398:388.model", kind: "text" } }, { link: "x" }],
      [{ gone: { path: "405.model_name", kind: "text" } }, { gone: "x" }],
      [{ bad: { path: "398:376.missing", kind: "text" } }, { bad: "x" }],
    ] as const)
      expect(() => fillSlots(graph, { ...slots, ...extra }, wrong)).toThrow(
        expect.objectContaining({ code: "cloud_unavailable" }),
      );
  });
  it("sends aligned dimensions for each tier without capping, and fresh seeds", () => {
    const at = (resolution: "hd" | "fhd" | "qhd" | "uhd") =>
      akuspaceValues({ duration: 5, aspectRatio: "16:9", resolution }, "p");
    expect(
      [at("hd"), at("fhd"), at("qhd"), at("uhd")].map((v) => [
        v.width,
        v.height,
      ]),
    ).toEqual([
      [1280, 704],
      [1920, 1088],
      [2560, 1472],
      [3840, 2176],
    ]);
    const random = vi.fn().mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    expect(
      akuspaceValues(
        { duration: 7, aspectRatio: "16:9", resolution: "hd" },
        "p",
        random,
      ),
    ).toMatchObject({ duration: 7, seed: 2 ** 46, refine_seed: 3 * 2 ** 46 });
  });
});

describe("the workflow route's shared contract", () => {
  it("stores a Comfy Cloud v2 job URL and reads the earlier status URL too", () => {
    const handle = workflowHandle("job-1");
    expect(handle).toBe("https://cloud.comfy.org/api/v2/jobs/job-1");
    expect(workflowJobId(handle)).toBe("job-1");
    // A run reserved by the pre-SDK client keeps polling.
    expect(workflowJobId("https://cloud.comfy.org/api/job/p-1/status")).toBe(
      "p-1",
    );
    for (const bad of [
      "https://evil.example/api/v2/jobs/job-1",
      "http://cloud.comfy.org/api/v2/jobs/job-1",
      "https://user:pw@cloud.comfy.org/api/v2/jobs/job-1",
      "https://cloud.comfy.org:8443/api/v2/jobs/job-1",
      "https://cloud.comfy.org/api/v2/jobs/job-1?key=x",
      "https://cloud.comfy.org/api/v2/jobs/../assets",
      "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/r/status",
    ])
      expect(() => workflowJobId(bad)).toThrow("delivery location");
    expect(() => workflowHandle("../job")).toThrow("could not be confirmed");
  });
  it("maps every v2 job state to the job vocabulary", () => {
    expect(
      [
        "queued",
        "running",
        "canceling",
        "succeeded",
        "failed",
        "canceled",
        "expired",
      ].map(workflowState),
    ).toEqual([
      "Pending",
      "Generating",
      "Generating",
      "Ready",
      "Error",
      "stopped",
      "Task not found",
    ]);
    expect(() => workflowState("paused")).toThrow("unexpected job state");
  });
  it("calls a stated refusal final and anything uncertain unconfirmed", () => {
    const key = "comfyui-fixture-private-key";
    for (const uncertain of [
      { httpStatus: 503, code: "error" },
      { httpStatus: 500 },
      { httpStatus: 422, code: "idempotency_key_reuse" },
      new TypeError("fetch failed"),
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      new SyntaxError("Unexpected token"),
    ])
      expect(submitError(uncertain)).toMatchObject({
        code: "submission_unknown",
      });
    expect(
      submitError({
        httpStatus: 422,
        code: "invalid_workflow",
        details: {
          node_errors: { "900": { class_type: "LoraLoaderModelOnly" } },
        },
      }).message,
    ).toContain("Import akuspace-ltx25-v0.5");
    const atNode = submitError({
      httpStatus: 422,
      code: "invalid_workflow",
      details: { "395": { class_type: "LoadImage", errors: [key] } },
    });
    expect(atNode).toMatchObject({
      code: "workflow_rejected",
      message: "Comfy Cloud refused this workflow at LoadImage.",
    });
    expect(atNode.message).not.toContain(key);
    for (const [status, message] of [
      [401, "The API key was not accepted."],
      [402, "Your Comfy account does not have enough credits."],
      [403, "This key does not have access to Comfy Cloud."],
      [429, "Comfy is busy. Please wait before trying again."],
    ] as const)
      expect(submitError({ httpStatus: status })).toMatchObject({
        status: status === 429 ? 429 : 502,
        message,
      });
    expect(pollError({ httpStatus: 404 })).toBe("gone");
    expect(pollError(new TypeError("fetch failed"))).toMatchObject({
      status: 502,
    });
  });
  it("marks only refusals made before sending as uncharged", async () => {
    await expect(new NotYetWorkflow().run()).rejects.toSatisfy(isUnsent);
    expect(
      isUnsent(notConfigured({ kind: "local", url: "http://127.0.0.1" })),
    ).toBe(true);
    expect(isUnsent(submitError({ httpStatus: 503 }))).toBe(false);
  });
});

describe("workflow destinations", () => {
  it("default to Comfy Cloud and accept https deployments and loopback ComfyUI", () => {
    expect(parseWorkflowDestination(undefined)).toEqual({ kind: "cloud" });
    expect(parseWorkflowDestination("cloud", "ignored")).toEqual({
      kind: "cloud",
    });
    expect(
      parseWorkflowDestination("deployment", "https://studio.run.comfy.app/"),
    ).toEqual({ kind: "deployment", url: "https://studio.run.comfy.app" });
    expect(parseWorkflowDestination("local", "http://127.0.0.1:8189")).toEqual({
      kind: "local",
      url: "http://127.0.0.1:8189",
    });
    expect(
      parseWorkflowDestination("local", "http://localhost:8188/comfy/"),
    ).toEqual({ kind: "local", url: "http://localhost:8188/comfy" });
  });
  it("refuse other kinds, hosts, schemes and URLs with credentials", () => {
    for (const [kind, url] of [
      ["remote", "https://studio.run.comfy.app"],
      ["deployment", undefined],
      ["deployment", 42],
      ["deployment", "not a url"],
      ["deployment", "http://studio.run.comfy.app"],
      ["deployment", "https://127.0.0.1"],
      ["deployment", "https://localhost"],
      ["deployment", "https://comfy.local"],
      ["deployment", "https://[::1]"],
      ["deployment", "https://user:pw@studio.run.comfy.app"],
      ["deployment", "https://studio.run.comfy.app/?key=x"],
      ["deployment", "https://studio.run.comfy.app/#x"],
      ["deployment", `https://a.example/${"x".repeat(2050)}`],
      ["local", "https://127.0.0.1:8189"],
      ["local", "http://192.168.1.4:8188"],
      ["local", "http://example.com"],
      ["local", "http://user@127.0.0.1:8188"],
    ] as const)
      expect(
        () => parseWorkflowDestination(kind, url),
        `${kind} ${url}`,
      ).toThrow(expect.objectContaining({ code: "invalid_destination" }));
  });
});

describe("routes recorded under older names", () => {
  it("read a stored cloud take as the workflow route", () => {
    expect(currentRoute("cloud")).toBe("workflow");
    expect(currentRoute("router")).toBe("router");
    expect(currentRoute("bfl")).toBe("bfl");
  });
});
