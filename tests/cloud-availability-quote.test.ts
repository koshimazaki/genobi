import { describe, expect, it } from "vitest";
import { ComfySdkWorkflows, type Connect } from "../server/comfy-sdk";
import { workflowTemplates } from "../shared/comfy/workflows";
import { CLOUD_UNCHECKED } from "../shared/quote";
import { infoForGraphs } from "./comfy-readiness-fixture";
import { acoustic } from "./run-location-harness";
import { setup } from "./server-harness";
import { quotePrice } from "../src/template-gallery/MechanicalActions";

// Option A for Comfy Cloud: when the account's catalogue cannot be read, a
// non-Klein run may still go ahead with availability unknown, but the quote
// says so, so the person decides before paying. A readable catalogue that
// lacks something refuses the quote itself.

const key = "comfyui-availability-test";
const everything = infoForGraphs(
  ...workflowTemplates.map((choice) => choice.template.graph),
);

async function studio(catalogue: () => Response) {
  let submits = 0;
  const connect: Connect = () => ({
    workflows: { fromJson: (graph) => graph },
    async submit() {
      submits++;
      return { id: "job-1" };
    },
    jobs: { get: async () => ({}) as never },
  });
  const fetcher: typeof fetch = async (url) =>
    String(url).endsWith("/api/object_info")
      ? catalogue()
      : new Response("unexpected", { status: 500 });
  const app = await setup(
    undefined,
    new ComfySdkWorkflows({ connect, fetcher, env: {} }),
  );
  const quote = async () =>
    fetch(`${app.base}/api/quotes`, {
      method: "POST",
      headers: {
        cookie: app.cookie,
        "Content-Type": "application/json",
        "x-byo-key": key,
      },
      body: JSON.stringify(acoustic),
    });
  return { quote, submits: () => submits };
}

describe("Cloud availability on a quote", () => {
  it("says it could not check when the catalogue is unreadable", async () => {
    const { quote, submits } = await studio(
      () => new Response("down", { status: 503 }),
    );
    const response = await quote();
    expect(response.status).toBe(201);
    const { quote: body } = await response.json();
    expect(body.availability).toBe(CLOUD_UNCHECKED);
    expect(CLOUD_UNCHECKED).toBe(
      "Couldn't check Cloud availability for this workflow.",
    );
    expect(submits()).toBe(0);
    // The price line the person confirms says it too.
    expect(quotePrice(body)).toContain(CLOUD_UNCHECKED);
  });

  it("says nothing extra when the catalogue was checked", async () => {
    const { quote } = await studio(() => Response.json(everything));
    const { quote: body } = await (await quote()).json();
    expect(body.availability).toBeUndefined();
  });

  it("refuses the quote when the account definitely lacks a node", async () => {
    const lacking = structuredClone(everything);
    delete lacking.LoraLoaderModelOnly;
    const { quote, submits } = await studio(() => Response.json(lacking));
    const response = await quote();
    expect((await response.json()).code).toBe("workflow_unsent");
    expect(submits()).toBe(0);
  });
});
