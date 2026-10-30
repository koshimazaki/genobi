import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NotYetWorkflow,
  WORKFLOW_NOT_YET,
  type WorkflowClient,
} from "../shared/comfy/workflow";
import { ComfySdkWorkflows } from "../server/comfy-sdk";
import { input, setup } from "./server-harness";

// Quotes and what each provider is sent and charged: budgets, upscale controls,
// edited camera text, Comfy keys and Acoustic Space on the workflow route.
describe("local job API: quotes, pricing and providers", () => {
  it("quotes a run without submitting it and spends the quote exactly once", async () => {
    const { post, bfl, base, cookie, store } = await setup();
    const quote = (body: object = input, session = cookie) =>
      fetch(`${base}/api/quotes`, {
        method: "POST",
        headers: { cookie: session, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const quoted = await quote();
    expect(quoted.status).toBe(201);
    const offer = (await quoted.json()).quote;
    expect(offer).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      estimateUsd: expect.any(Number),
      recipe: { id: "flux-3-video", version: 1, route: "bfl" },
      expiresAt: expect.any(String),
    });
    expect(Date.parse(offer.expiresAt) - Date.now()).toBeGreaterThan(
      9 * 60_000,
    );
    expect(bfl.submissions).toBe(0);
    const spend = (id: string, body: object = input, quoteId = offer.id) =>
      post(id, body, { "Quote-Id": quoteId });
    const accepted = await spend("quoted-run");
    expect(accepted.status).toBe(202);
    const { job } = await accepted.json();
    expect(job.costEstimateUsd).toBe(offer.estimateUsd);
    // A replay of the same run is still that run; a second run is refused.
    expect((await (await spend("quoted-run")).json()).job.id).toBe(job.id);
    const reused = await spend("second-run");
    expect(reused.status).toBe(409);
    expect((await reused.json()).code).toBe("quote_used");
    expect(bfl.submissions).toBe(1);
    // A quote covers the settings it priced, in its own session, for ten minutes.
    const fresh = (await (await quote()).json()).quote;
    const changed = await spend(
      "changed-run",
      { ...input, duration: 10 },
      fresh.id,
    );
    expect((await changed.json()).code).toBe("quote_mismatch");
    const stranger = `camera_session=${"1".repeat(8)}-1111-1111-1111-${"1".repeat(12)}`;
    const elsewhere = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: {
        cookie: stranger,
        "Content-Type": "application/json",
        "Idempotency-Key": "stranger-run",
        "Quote-Id": fresh.id,
      },
      body: JSON.stringify(input),
    });
    expect((await elsewhere.json()).code).toBe("quote_missing");
    store.data.quotes.find((item) => item.id === fresh.id)!.expiresAt =
      new Date(Date.now() - 1).toISOString();
    const late = await spend("late-run", input, fresh.id);
    expect(late.status).toBe(410);
    expect((await late.json()).code).toBe("quote_expired");
    expect((await spend("bad-id", input, "not-a-quote")).status).toBe(400);
    expect(bfl.submissions).toBe(1);
  });

  it("refuses a server-key quote that the budget or session limit would refuse", async () => {
    const { post, bfl, base, cookie, store } = await setup();
    const quote = (body: object, headers: Record<string, string> = {}) =>
      fetch(`${base}/api/quotes`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    // $16 against the $5 demo budget: submission would answer 429, so must the quote.
    const expensive = { ...input, duration: 20, resolution: "uhd" };
    const overBudget = await quote(expensive);
    expect(overBudget.status).toBe(429);
    expect((await overBudget.json()).code).toBe("budget");
    // A visitor's own key is not held to the demo budget.
    const own = await quote(expensive, { "x-byo-key": "visitor-own-key" });
    expect(own.status).toBe(201);
    for (const id of ["limit-run-1", "limit-run-2", "limit-run-3"])
      expect((await post(id)).status).toBe(202);
    const overLimit = await quote(input);
    expect(overLimit.status).toBe(429);
    expect((await overLimit.json()).code).toBe("budget");
    expect(store.data.quotes).toHaveLength(1);
    expect(bfl.submissions).toBe(3);
  });

  it("forwards the selected upscale controls and reserves their full cost", async () => {
    const { post, bfl, store, base, cookie } = await setup();
    const uploaded = await fetch(`${base}/api/uploads?filename=library.mp4`, {
      method: "POST",
      headers: { cookie, "Content-Type": "video/mp4" },
      body: new Uint8Array(
        await readFile(path.resolve("tests/fixtures/metadata.mp4")),
      ),
    });
    expect(uploaded.status).toBe(201);
    const { source } = await uploaded.json();
    const request = {
      ...input,
      generator: "upscale",
      sourceId: source.id,
      upscaleFactor: 3,
      upscaleCreativity: 1,
      upscalePrompt: "  Fine ceramic texture.  ",
    };
    const response = await post("creative-upscale", request);
    expect(response.status).toBe(202);
    const { job } = await response.json();
    expect(job.costEstimateUsd).toBe(4.37);
    expect(job).toMatchObject({ upscaleFactor: 3, upscaleCreativity: 1 });
    expect(bfl.requests[0]).toMatchObject({
      generator: "upscale",
      body: { upscale_factor: 3, creativity: 1 },
    });
    expect(bfl.requests[0].body.prompt).toBe("Fine ceramic texture.");
    expect(job.prompt).toBe("Fine ceramic texture.");
    expect(bfl.requests[0].body.input_video).toEqual(expect.any(String));
    const overBudget = await post("precise-upscale", {
      ...request,
      upscaleFactor: 1.5,
      upscaleCreativity: 0,
    });
    expect(overBudget.status).toBe(429);
    expect(bfl.submissions).toBe(1);
    expect(store.data.jobs).toHaveLength(1);
    const changedReplay = await post("creative-upscale", {
      ...request,
      upscaleCreativity: 0,
    });
    expect(changedReplay.status).toBe(409);
    // Omitting a field that was submitted is a change too. This replay used to
    // pass here and conflict in the Worker; shared/idempotency.ts settles it.
    const { upscalePrompt: _dropped, ...withoutPrompt } = request;
    expect((await post("creative-upscale", withoutPrompt)).status).toBe(409);
  });

  it("forwards edited camera text and real video settings, prices them, and normalises drafts", async () => {
    const { post, bfl, store } = await setup();
    const request = {
      ...input,
      cameraText: "A slow clockwise arc.",
      duration: 7,
      resolution: "qhd",
      aspectRatio: "4:3",
    };
    const first = await post("custom-video", request);
    expect(first.status).toBe(202);
    const { job } = await first.json();
    expect(job.costEstimateUsd).toBe(2.8);
    expect(bfl.requests[0].body).toMatchObject({
      prompt: "A ceramic vessel.\n\nA slow clockwise arc.",
      duration: 7,
      resolution: "qhd",
      aspect_ratio: "4:3",
      draft: false,
      // Every FLUX 3 run asks for audio, on BFL direct as on Router.
      generate_audio: true,
    });
    const expensive = await post("expensive-video", {
      ...request,
      duration: 20,
      resolution: "uhd",
    });
    expect(expensive.status).toBe(429);
    expect(bfl.submissions).toBe(1);
    const draft = await post("draft-video", {
      ...request,
      duration: 20,
      resolution: "uhd",
      aspectRatio: "9:16",
      draft: true,
    });
    const draftJob = (await draft.json()).job;
    expect(draft.status).toBe(202);
    expect(draftJob).toMatchObject({
      duration: 20,
      resolution: "hd",
      aspectRatio: "9:16",
      costEstimateUsd: 1.2,
    });
    expect(bfl.requests[1].body).toMatchObject({
      duration: 20,
      resolution: "hd",
      aspect_ratio: "9:16",
      draft: true,
    });
    // A request still carrying the old switch is not obeyed: audio is always on.
    await post(
      "quiet-video",
      { ...request, audio: false },
      { "x-byo-key": "visitor-audio-key" },
    );
    expect(bfl.requests[2].body).toMatchObject({ generate_audio: true });
    expect(store.data.jobs).toHaveLength(3);
  });

  it("hands Acoustic Space to the workflow client, and the stub fails it uncharged", async () => {
    const acoustic = {
      ...input,
      model: "ltx-2.5-akuspace",
      duration: 6,
      acoustic: { mode: "room", preset: "empty_club", level: "high" },
    };
    const comfy = { "x-byo-key": "comfyui-test-key-0001" };
    const stubbed = await setup(undefined, new NotYetWorkflow());
    const refused = await stubbed.post("acoustic-stub", acoustic, comfy);
    expect((await refused.json()).job).toMatchObject({
      status: "Error",
      error: WORKFLOW_NOT_YET,
      costActualUsd: 0,
    });
    expect(stubbed.bfl.submissions).toBe(0);
    // The workflow client receives the template and its slot values, with the
    // treatment closing the prompt as the AKUSPACE node composes it.
    const runs: { id: string; values: Record<string, unknown> }[] = [];
    const stub = new NotYetWorkflow();
    const client: WorkflowClient = {
      async run(template, values) {
        runs.push({ id: template.id, values });
        return "https://cloud.comfy.org/api/v2/jobs/cloud-run-1";
      },
      poll: () => stub.poll(),
      download: () => stub.download(),
    };
    const wired = await setup(undefined, client);
    const accepted = await wired.post("acoustic-cloud", acoustic, comfy);
    expect((await accepted.json()).job.status).toBe("Pending");
    expect(runs).toEqual([
      {
        id: "ltx-2-5-akuspace-t2v",
        values: {
          prompt: expect.stringMatching(
            /\. AKUSPACE in an empty club, heavy broad hard-surface reflections and a 1\.2-second reverb decay, no crowd$/,
          ),
          duration: 6,
          fps: 24,
          width: 1280,
          height: 704,
          lora_strength: 1,
          seed: expect.any(Number),
          refine_seed: expect.any(Number),
        },
      },
    ]);
    expect(wired.bfl.submissions).toBe(0);
  });

  it("runs Acoustic Space on Comfy Cloud through the SDK: one POST, job read, signed download, estimate kept", async () => {
    const acoustic = {
      ...input,
      model: "ltx-2.5-akuspace",
      duration: 6,
      acoustic: { mode: "room", preset: "empty_club", level: "high" },
    };
    const key = "comfyui-test-key-0002";
    const media = await readFile(path.resolve("tests/fixtures/metadata.mp4"));
    const signed =
      "https://storage.googleapis.com/comfy-out/clip.mp4?X-Goog-Signature=abc";
    const job = (status: string, outputs: object[] = []) => ({
      id: "p-1",
      status,
      created_at: "2026-10-21T00:00:00Z",
      started_at: null,
      completed_at: null,
      expires_at: "2026-10-22T00:00:00Z",
      queue_position: null,
      progress: null,
      outputs,
      error: null,
      urls: { self: "/api/v2/jobs/p-1", events: "", cancel: "" },
    });
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (target, init) => {
      const url = String(target);
      calls.push({ url, init });
      if (url === "https://cloud.comfy.org/api/v2/jobs")
        return Response.json(job("queued"), { status: 201 });
      if (url === "https://cloud.comfy.org/api/v2/jobs/p-1")
        return Response.json(
          job("succeeded", [
            {
              id: "asset-9",
              node_id: "75",
              name: "LTX-2.5_akuspace_t2v_00001_.mp4",
              type: "video",
              content_type: "video/mp4",
              size_bytes: media.length,
            },
          ]),
        );
      if (url === "https://cloud.comfy.org/api/v2/assets/asset-9/content")
        return new Response(null, {
          status: 302,
          headers: { Location: signed },
        });
      if (url === signed) return new Response(media);
      return new Response("unexpected", { status: 500 });
    };
    const { post, base, cookie, store, bfl } = await setup(
      undefined,
      new ComfySdkWorkflows({ fetcher, env: {} }),
    );
    const { job: accepted } = await (
      await post("acoustic-real", acoustic, { "x-byo-key": key })
    ).json();
    expect(accepted.status).toBe("Pending");
    expect(accepted.pollingUrl).toBeUndefined();
    expect(store.data.jobs[0]).toMatchObject({
      providerId: "p-1",
      pollingUrl: "https://cloud.comfy.org/api/v2/jobs/p-1",
    });
    // The reserved job's id is the submission's idempotency key.
    expect(new Headers(calls[0].init?.headers).get("Idempotency-Key")).toBe(
      accepted.id,
    );
    const { workflow } = JSON.parse(String(calls[0].init?.body));
    expect(workflow["398:376"].inputs.value).toMatch(/no crowd$/);
    expect(workflow["398:362"].inputs.value).toBe(6);
    expect(workflow["900"].inputs.lora_name).toBe(
      "akuspace-ltx25-v0.5.safetensors",
    );
    const result = await (
      await fetch(`${base}/api/jobs/${accepted.id}`, {
        headers: { cookie, "x-byo-key": key },
      })
    ).json();
    expect(result.job).toMatchObject({ status: "Ready" });
    // No credits come back from Cloud, so the gallery keeps the estimate.
    expect(result.job.costActualUsd).toBeUndefined();
    expect(calls.map((call) => call.url.split("?")[0])).toEqual([
      "https://cloud.comfy.org/api/v2/jobs",
      "https://cloud.comfy.org/api/v2/jobs/p-1",
      "https://cloud.comfy.org/api/v2/assets/asset-9/content",
      "https://storage.googleapis.com/comfy-out/clip.mp4",
    ]);
    for (const call of calls) expect(call.url).not.toContain(key);
    const auth = (call: (typeof calls)[number]) =>
      new Headers(call.init?.headers).get("Authorization");
    for (const call of calls.slice(0, 3))
      expect(auth(call)).toBe(`Bearer ${key}`);
    expect(auth(calls[3])).toBeNull();
    expect(bfl.submissions).toBe(0);
  });

  it("replays a run recorded on the old cloud route and reads its take as workflow", async () => {
    const acoustic = {
      ...input,
      model: "ltx-2.5-akuspace",
      duration: 6,
      acoustic: { mode: "room", preset: "empty_club", level: "high" },
    };
    const key = "comfyui-test-key-0003";
    let runs = 0;
    const client: WorkflowClient = {
      run: async () => {
        runs++;
        return "https://cloud.comfy.org/api/v2/jobs/legacy-1";
      },
      poll: async () => ({ id: "legacy-1", status: "Generating" }),
      download: () => new NotYetWorkflow().download(),
    };
    const { post, base, cookie, store } = await setup(undefined, client);
    const { job } = await (
      await post("legacy-cloud", acoustic, { "x-byo-key": key })
    ).json();
    // Recorded as the earlier client stored it: route `cloud`, a v1 status
    // URL, and Ready with its media.
    const stored = store.data.jobs[0];
    stored.take!.recipe.route = "cloud" as never;
    stored.take!.recipe.version = 1; // Preserve the recorded recipe across current graph changes.
    stored.pollingUrl = "https://cloud.comfy.org/api/job/legacy-1/status";
    stored.status = "Ready";
    await store.save();
    const replay = await post("legacy-cloud", acoustic, { "x-byo-key": key });
    // The same run answers, not a 409 and not a second paid submission.
    expect((await replay.json()).job).toMatchObject({
      id: job.id,
      status: "Ready",
    });
    expect(runs).toBe(1);
    const take = await (
      await fetch(`${base}/api/takes/${job.id}`, { headers: { cookie } })
    ).json();
    // A workflow take also names its template and run location.
    expect(take.take.recipe).toEqual({
      id: "ltx-2-5-akuspace",
      version: 1,
      route: "workflow",
      workflow: "ltx-2-5-akuspace-t2v",
      location: "cloud",
    });
  });
});
