import { beforeEach, expect, it } from "vitest";
import {
  call,
  cloudCatalogue,
  cloudRequests,
  newSession,
  useWorker,
} from "./worker-harness";
import { infoForGraphs } from "./comfy-readiness-fixture";
import { workflowTemplates } from "../shared/comfy/workflows";
import { CLOUD_GPU_ESTIMATE, CLOUD_UNCHECKED } from "../shared/quote";

useWorker();
const input = {
  generator: "video",
  model: "ltx-2.5-akuspace",
  description: "A drummer warms up.",
  cameraEnabled: true,
  presetId: "orbit_l",
  duration: 6,
  resolution: "hd",
  draft: false,
  upscaleFactor: 2,
  acoustic: { mode: "room", preset: "empty_club", level: "high" },
};
const inventory = () =>
  infoForGraphs(...workflowTemplates.map((c) => c.template.graph));
beforeEach(() => {
  cloudCatalogue.body = inventory();
  cloudCatalogue.status = 200;
  cloudRequests.length = 0;
});
const quote = (key = "comfyui-first-account") =>
  call("/api/quotes", {
    method: "POST",
    headers: {
      cookie: newSession(),
      "x-byo-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
const posts = () => cloudRequests.filter((r) => r.method === "POST");

it("discloses unreadable Cloud availability and GPU-time pricing on a hosted quote", async () => {
  cloudCatalogue.status = 503;
  const response = await quote();
  expect(response.status, await response.clone().text()).toBe(201);
  expect(await response.json()).toMatchObject({
    quote: {
      availability: CLOUD_UNCHECKED,
      estimateNote: CLOUD_GPU_ESTIMATE,
      recipe: { location: "cloud", route: "workflow" },
    },
  });
  expect(posts()).toHaveLength(0);
});

it("checks the current account each time and refuses a missing dependency without uploads or submissions", async () => {
  const first = await quote();
  expect(first.status, await first.clone().text()).toBe(201);
  const body = (await first.json()) as { quote: { availability?: string } };
  expect(body.quote.availability).toBeUndefined();
  const missing = inventory();
  delete missing.LoraLoaderModelOnly;
  cloudCatalogue.body = missing;
  const second = await quote("comfyui-second-account");
  expect(await second.json()).toMatchObject({ code: "workflow_unsent" });
  expect(
    cloudRequests.filter((r) => r.path === "/api/object_info"),
  ).toHaveLength(2);
  expect(posts()).toHaveLength(0);
});

it("keeps incomplete loader metadata unknown instead of claiming the graph was checked", async () => {
  const incomplete = inventory();
  delete incomplete.LoraLoaderModelOnly!.input!.required!.lora_name;
  cloudCatalogue.body = incomplete;
  const response = await quote();
  expect(response.status, await response.clone().text()).toBe(201);
  expect(await response.json()).toMatchObject({
    quote: { availability: CLOUD_UNCHECKED },
  });
  expect(posts()).toHaveLength(0);
});
