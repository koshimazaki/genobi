import { describe, expect, it } from "vitest";
import { firstSettingsRevision } from "../shared/comfy/run-location";
import { input } from "./server-harness";
import { SESSION_LIMIT } from "../server/jobs";
import { acoustic, klein, png, studio } from "./run-location-harness";

// The run location and workflow swapping on the local server, and an open
// Klein run end to end through the local client against a fake ComfyUI.

describe("run location", () => {
  it("starts at the server default, changes per session, and reports the local ComfyUI", async () => {
    const { send, base } = await studio();
    expect(
      await (await send("/api/settings/run-location")).json(),
    ).toMatchObject({
      location: "cloud",
      source: "server",
      fixed: false,
      choices: ["local", "cloud", "both", "deployment"],
      local: { reachable: true, version: "0.3.99" },
    });
    const set = await send("/api/settings/run-location", { location: "local" });
    expect(await set.json()).toMatchObject({
      location: "local",
      label: "Local ComfyUI",
      source: "session",
    });
    // Another session keeps the default.
    const other = await fetch(`${base}/api/settings/run-location`);
    expect((await other.json()).location).toBe("cloud");
    const bad = await send("/api/settings/run-location", { location: "mars" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("invalid_run_location");
  });

  it("keeps Both across restart and adoption, quotes local workflows and cloud API models", async () => {
    const first = await studio();
    const chosen = await first.send("/api/settings/run-location", {
      location: "both",
    });
    expect(await chosen.json()).toMatchObject({
      mode: "both",
      location: "local",
    });
    const { quote } = await (await first.send("/api/quotes", klein)).json();
    expect(quote).toMatchObject({
      estimateUsd: 0,
      recipe: { location: "local" },
    });
    const api = input;
    const { quote: cloud } = await (
      await first.send("/api/quotes", api)
    ).json();
    expect(cloud.recipe.route).toBe("bfl");
    expect(cloud.estimateUsd).toBeGreaterThan(0);
    expect(first.fake.prompts).toHaveLength(0);
    expect(first.cloudRuns()).toBe(0);
    const restarted = await studio([], undefined, {
      fake: first.fake,
      directory: first.directory,
    });
    const answer = await fetch(`${restarted.base}/api/settings/run-location`, {
      headers: { cookie: first.cookie },
    });
    expect(await answer.json()).toMatchObject({
      mode: "both",
      location: "local",
    });
    const settings = restarted.service.settings;
    await settings.setLocation("owner", "both");
    await settings.adopt("agent", settings.snapshot("owner"));
    expect(await settings.state("agent")).toMatchObject({
      mode: "both",
      location: "local",
    });
    await first.send("/api/settings/run-location", { location: "cloud" });
    const refused = await first.send("/api/jobs", klein, {
      "Quote-Id": quote.id,
      "Idempotency-Key": "both-local-quote-cloud-attempt",
      "Genobi-Run-Location": "local",
    });
    expect(refused.status).toBe(409);
    expect(first.cloudRuns()).toBe(0);
  });

  it("does not spend the paid submission limit on settings", async () => {
    const { send } = await studio();
    for (let n = 0; n < 10; n++)
      expect(
        (
          await send("/api/settings/run-location", {
            location: n % 2 ? "local" : "cloud",
          })
        ).status,
      ).toBe(200);
    expect((await send("/api/quotes", klein)).status).toBe(201);
  });

  it("runs open Klein on the local ComfyUI end to end, free and recorded as local", async () => {
    const { send, fake, cloudRuns, bfl } = await studio();
    await send("/api/settings/run-location", { location: "local" });
    // A BFL server key: the local run needs no Comfy key.
    const { quote } = await (await send("/api/quotes", klein)).json();
    expect(quote).toMatchObject({
      estimateUsd: 0,
      recipe: {
        id: "flux-3-klein",
        route: "workflow",
        workflow: "flux-3-klein-base-t2i",
        location: "local",
      },
    });
    const submitted = await send("/api/jobs", klein, {
      "Idempotency-Key": "local-klein-1",
      "Quote-Id": quote.id,
    });
    const { job } = await submitted.json();
    expect(job).toMatchObject({ status: "Pending", costEstimateUsd: 0 });
    expect(fake.prompts).toHaveLength(1);
    expect(fake.prompts[0].prompt_id).toBe(job.id);
    expect(fake.prompts[0].prompt["18:1"].inputs.unet_name).toBe(
      "flux3/klein-base-local.safetensors",
    );
    fake.state = "success";
    const polled = await (await send(`/api/jobs/${job.id}`)).json();
    expect(polled.job).toMatchObject({
      status: "Ready",
      resultContentType: "image/png",
    });
    const clip = await send(polled.job.resultUrl);
    expect(new Uint8Array(await clip.arrayBuffer())).toEqual(
      new Uint8Array(png),
    );
    const { take } = await (await send(`/api/takes/${job.id}`)).json();
    expect(take.recipe).toMatchObject({
      location: "local",
      workflow: "flux-3-klein-t2i",
    });
    // Nothing went to Comfy Cloud or BFL, and ComfyUI got one prompt.
    expect(cloudRuns()).toBe(0);
    expect(bfl.submissions).toBe(0);
    expect(fake.prompts).toHaveLength(1);
  });

  it("never spends a quote under another location", async () => {
    const { send, fake, cloudRuns } = await studio();
    await send("/api/settings/run-location", { location: "local" });
    const { quote } = await (await send("/api/quotes", klein)).json();
    await send("/api/settings/run-location", { location: "cloud" });
    const comfy = { "x-byo-key": "comfyui-test-key-0009" };
    const spent = await send("/api/jobs", klein, {
      ...comfy,
      "Idempotency-Key": "switched-1",
      "Quote-Id": quote.id,
    });
    expect(spent.status).toBe(409);
    expect((await spent.json()).code).toBe("quote_mismatch");
    expect(fake.prompts).toHaveLength(0);
    expect(cloudRuns()).toBe(0);
  });

  it("refuses a local run before submission when ComfyUI lacks a node type", async () => {
    const { send, fake } = await studio(["TextGenerate"]);
    await send("/api/settings/run-location", { location: "local" });
    const { job } = await (
      await send("/api/jobs", klein, { "Idempotency-Key": "missing-node" })
    ).json();
    expect(job).toMatchObject({ status: "Error", costActualUsd: 0 });
    expect(job.error).toContain("TextGenerate");
    expect(fake.prompts).toHaveLength(0);
  });
});

describe("the demo gate and local runs", () => {
  it("does not count free local runs toward the session limit or budget", async () => {
    const { send, post, bfl, fake } = await studio();
    await send("/api/settings/run-location", { location: "local" });
    // More local runs than SESSION_LIMIT, all on the server key.
    for (let n = 0; n < SESSION_LIMIT + 1; n++) {
      const { job } = await (
        await send("/api/jobs", klein, {
          "Idempotency-Key": `local-run-${n}`,
        })
      ).json();
      expect(job.status, `local run ${n}`).toBe("Pending");
    }
    expect(fake.prompts).toHaveLength(SESSION_LIMIT + 1);
    // The budget route reads the same numbers the gate does.
    expect(await (await send("/api/budget")).json()).toMatchObject({
      runsLeft: SESSION_LIMIT,
      reservedUsd: 0,
      countsLocalRuns: false,
    });
    // The session's paid allowance is untouched: the full limit of server-key
    // runs on BFL still goes through, and the one after is refused.
    for (let n = 0; n < SESSION_LIMIT; n++)
      expect((await post(`paid-run-${n}`)).status, `paid run ${n}`).toBe(202);
    const over = await post("paid-run-over");
    expect(over.status).toBe(429);
    expect((await over.json()).code).toBe("budget");
    expect(bfl.submissions).toBe(SESSION_LIMIT);
  });
});

describe("paused chains and settings changes", () => {
  it("quotes a paused stage again when the run location or template changes", async () => {
    const { send, base, cookie } = await studio();
    const comfy = { "x-byo-key": "comfyui-test-key-0011" };
    const chains = async (route: string, init: RequestInit = {}) =>
      (await fetch(`${base}/api/chains${route}`, {
        ...init,
        headers: {
          cookie,
          "Content-Type": "application/json",
          ...comfy,
          ...(init.headers as Record<string, string>),
        },
      }).then((r) => r.json())) as {
        chain: {
          id: string;
          quote?: { id: string; recipe: Record<string, unknown> };
        };
        code?: string;
      };
    await send("/api/settings/run-location", { location: "local" });
    const created = await chains("", {
      method: "POST",
      body: JSON.stringify({ stages: [{ input: acoustic }] }),
    });
    const first = created.chain.quote!;
    expect(first.recipe).toMatchObject({ location: "local" });
    // Switching to Cloud: the old quote can no longer be spent, so the next
    // read quotes the stage again for Cloud.
    await send("/api/settings/run-location", { location: "cloud" });
    const stale = await chains(`/${created.chain.id}/approve`, {
      method: "POST",
      headers: { "Quote-Id": first.id },
    });
    expect(stale.code).toBe("quote_mismatch");
    const read = await chains(`/${created.chain.id}`);
    const second = read.chain.quote!;
    expect(second.id).not.toBe(first.id);
    expect(second.recipe).toMatchObject({ location: "cloud" });
    // Swapping the template does the same.
    await send("/api/settings/workflows/selection", {
      entry: "ltx-2-5-akuspace",
      template: "ltx-2-5-t2v",
    });
    const third = (await chains(`/${created.chain.id}`)).chain.quote!;
    expect(third.id).not.toBe(second.id);
    expect(third.recipe).toMatchObject({
      workflow: "ltx-2-5-t2v",
      location: "cloud",
    });
    // And the fresh quote approves.
    const approved = await fetch(
      `${base}/api/chains/${created.chain.id}/approve`,
      {
        method: "POST",
        headers: { cookie, ...comfy, "Quote-Id": third.id },
      },
    );
    expect(approved.status).toBe(202);
  });
});

describe("the settings revision", () => {
  it("orders every settings answer by when the server handled it", async () => {
    const { send } = await studio();
    const revision = async (response: Promise<Response>) =>
      ((await (await response).json()) as { revision: number }).revision;
    const first = await revision(send("/api/settings/run-location"));
    expect(Number.isSafeInteger(first)).toBe(true);
    // A read changes nothing; each accepted write, of either setting, moves
    // it on, and its answer carries the revision it made.
    expect(await revision(send("/api/settings/workflows"))).toBe(first);
    const set = await revision(
      send("/api/settings/run-location", { location: "local" }),
    );
    expect(set).toBe(first + 1);
    const swapped = await revision(
      send("/api/settings/workflows/selection", {
        entry: "ltx-2-5-akuspace",
        template: "ltx-2-5-t2v",
      }),
    );
    expect(swapped).toBe(first + 2);
    expect(await revision(send("/api/settings/run-location"))).toBe(first + 2);
    // A refused write moves nothing.
    await send("/api/settings/run-location", { location: "mars" });
    expect(await revision(send("/api/settings/run-location"))).toBe(first + 2);
  });

  it("starts each process above the last", () => {
    // A process a second later starts a thousand writes per millisecond of
    // the earlier one's life above it, and stays a safe integer.
    expect(firstSettingsRevision(2_000)).toBe(
      firstSettingsRevision(1_000) + 1_000_000,
    );
    expect(Number.isSafeInteger(firstSettingsRevision())).toBe(true);
  });
});

describe("workflow swapping", () => {
  it("lists templates per capability and swaps one that serves the entry", async () => {
    const { send } = await studio();
    const catalogue = await (await send("/api/settings/workflows")).json();
    expect(catalogue.fixed).toBe(false);
    expect(catalogue.entries).toContainEqual({
      entry: "ltx-2-5-akuspace",
      capability: "acoustic-space",
      default: "ltx-2-5-akuspace-t2v",
      selected: "ltx-2-5-akuspace-t2v",
      templates: ["ltx-2-5-akuspace-t2v", "ltx-2-5-t2v"],
    });
    // No model file names leave the server.
    expect(JSON.stringify(catalogue)).not.toMatch(/safetensors/);
    const swapped = await send("/api/settings/workflows/selection", {
      entry: "ltx-2-5-akuspace",
      template: "ltx-2-5-t2v",
    });
    expect((await swapped.json()).entries).toContainEqual(
      expect.objectContaining({
        entry: "ltx-2-5-akuspace",
        selected: "ltx-2-5-t2v",
      }),
    );
    const comfy = { "x-byo-key": "comfyui-test-key-0010" };
    const { quote } = await (await send("/api/quotes", acoustic, comfy)).json();
    expect(quote.recipe).toMatchObject({
      workflow: "ltx-2-5-t2v",
      location: "cloud",
    });
  });

  it("refuses a template that cannot stand behind the entry", async () => {
    const { send } = await studio();
    for (const body of [
      { entry: "flux-3-klein", template: "ltx-2-5-t2v" },
      { entry: "ltx-2-5-akuspace", template: "flux-3-klein-t2i" },
      { entry: "ltx-2-5-fast", template: "ltx-2-5-t2v" },
      { entry: "flux-3-klein", template: "nope" },
      { entry: "flux-3-klein" },
    ]) {
      const refused = await send("/api/settings/workflows/selection", body);
      expect(refused.status, JSON.stringify(body)).toBe(400);
      expect((await refused.json()).code).toBe("workflow_mismatch");
    }
  });

  it("checks each template against the local ComfyUI on request", async () => {
    const { send } = await studio();
    const { local } = await (
      await send("/api/settings/workflows?check=local")
    ).json();
    expect(local.reachable).toBe(true);
    expect(local.templates["flux-3-klein-t2i"]).toEqual({
      missingNodes: [],
      missingModels: [],
    });
    expect(local.templates["ltx-2-5-t2v"].missingNodes).toContain(
      "LTXVConditioning",
    );
  });
});
