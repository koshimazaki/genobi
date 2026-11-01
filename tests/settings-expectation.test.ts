import { afterEach, describe, expect, it } from "vitest";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { kleinBaseWorkflow } from "../shared/comfy/klein-base";
import { NotYetWorkflow } from "../shared/comfy/workflow";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { input, setup } from "./server-harness";

// A paid write from the studio names the run location and template it shows;
// if the session holds something else, nothing is reserved or sent.
const klein = {
  generator: "image",
  model: "flux-3-klein",
  description: "A kite festival on a windy beach.",
  imageAspectRatio: "1:1",
  imageResolution: "1k",
};
let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

async function studio() {
  fake = await fakeComfy({ nodes: nodesFor(kleinBaseWorkflow.graph) });
  const local = new LocalComfyWorkflows({ url: fake.url });
  const app = await setup(
    undefined,
    new WorkflowDestinations(new NotYetWorkflow(), local),
    {
      destination: { kind: "cloud" },
      local,
    },
  );
  const send = (
    route: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${app.base}${route}`, {
      method: "POST",
      headers: {
        cookie: app.cookie,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { ...app, send, fake };
}

describe("settings_changed", () => {
  it("refuses a submit expecting Local while the session holds Cloud, reserving nothing", async () => {
    const { send, store, fake, bfl } = await studio();
    // The studio showed Local, but the save never landed: the server holds Cloud.
    const refused = await send("/api/jobs", klein, {
      "Idempotency-Key": "expect-local-1",
      "Genobi-Run-Location": "local",
      "Genobi-Workflow": "flux-3-klein-base-t2i",
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("settings_changed");
    const quote = await send("/api/quotes", klein, {
      "Genobi-Run-Location": "local",
    });
    expect(quote.status).toBe(409);
    const chain = await send(
      "/api/chains",
      { stages: [{ input: klein }] },
      { "Genobi-Run-Location": "local" },
    );
    expect(chain.status).toBe(409);
    expect(store.data.jobs).toHaveLength(0);
    expect(store.data.quotes).toHaveLength(0);
    expect(store.data.chains).toHaveLength(0);
    expect(fake.prompts).toHaveLength(0);
    expect(bfl.submissions).toBe(0);
  });

  it("refuses another template, and runs when the expectation matches", async () => {
    const { send, store, fake } = await studio();
    await send("/api/settings/run-location", { location: "local" });
    const wrong = await send("/api/jobs", klein, {
      "Idempotency-Key": "expect-local-2",
      "Genobi-Run-Location": "local",
      "Genobi-Workflow": "ltx-2-5-t2v",
    });
    expect((await wrong.json()).code).toBe("settings_changed");
    expect(store.data.jobs).toHaveLength(0);
    const ran = await send("/api/jobs", klein, {
      "Idempotency-Key": "expect-local-3",
      "Genobi-Run-Location": "local",
      "Genobi-Workflow": "flux-3-klein-base-t2i",
    });
    expect(ran.status).toBe(202);
    expect(fake.prompts).toHaveLength(1);
  });

  it("keeps today's behaviour without the headers, and for routes with no template", async () => {
    const { send, fake, bfl } = await studio();
    await send("/api/settings/run-location", { location: "local" });
    const plain = await send("/api/jobs", klein, {
      "Idempotency-Key": "no-expect-1",
    });
    expect(plain.status).toBe(202);
    expect(fake.prompts).toHaveLength(1);
    // A FLUX 3 video run on BFL has no run location to disagree with.
    const router = await send("/api/jobs", input, {
      "Idempotency-Key": "router-expect-1",
      "Genobi-Run-Location": "cloud",
    });
    expect(router.status).toBe(202);
    expect(bfl.submissions).toBe(1);
  });

  it("refuses a malformed expectation", async () => {
    const { send } = await studio();
    for (const [name, value] of [
      ["Genobi-Run-Location", "mars"],
      ["Genobi-Workflow", "../x"],
    ]) {
      const refused = await send("/api/jobs", klein, {
        "Idempotency-Key": `bad-expect-${name.length}`,
        [name]: value,
      });
      expect(refused.status, name).toBe(400);
    }
  });
});
