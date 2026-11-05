import { afterEach, describe, expect, it } from "vitest";
import { GpuBoxes } from "../server/gpu-boxes";
import { kleinBaseWorkflow } from "../shared/comfy/klein-base";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { klein, studio } from "./run-location-harness";

// A GPU box and Local both run at `location: "local"`, so the studio also
// names the box it shows (`Genobi-Gpu-Box`): a stale tab never sends to a box
// it did not show, or to another box's port, and gets `settings_changed`.

let boxes: FakeComfy[] = [];
afterEach(async () => {
  await Promise.all(boxes.map((box) => box.close()));
  boxes = [];
});

async function twoBoxes() {
  for (let i = 0; i < 2; i++)
    boxes.push(await fakeComfy({ nodes: nodesFor(kleinBaseWorkflow.graph) }));
  const [a, b] = boxes.map((box) => Number(new URL(box.url).port));
  const app = await studio([], undefined, undefined, new GpuBoxes());
  return { ...app, a, b };
}

const header = (port: number, name: string) => `${port}:${name}`;

describe("the GPU box expectation", () => {
  it("refuses a run the studio showed on Local once the session is on a box", async () => {
    const { send, fake, a } = await twoBoxes();
    await send("/api/settings/run-location", {
      location: "box",
      box: { name: "vast", port: a },
    });
    const refused = await send("/api/jobs", klein, {
      "Idempotency-Key": "stale-local",
      "Genobi-Run-Location": "local",
      "Genobi-Gpu-Box": "none",
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("settings_changed");
    expect(boxes[0].prompts).toHaveLength(0);
    expect(fake.prompts).toHaveLength(0);
  });

  it("refuses a run the studio showed on Local or another box", async () => {
    const { send, fake, a, b } = await twoBoxes();
    await send("/api/settings/run-location", {
      location: "box",
      box: { name: "vast", port: b },
    });
    for (const shown of [header(a, "vast"), header(b, "lab")]) {
      const refused = await send("/api/quotes", klein, {
        "Genobi-Run-Location": "local",
        "Genobi-Gpu-Box": shown,
      });
      expect((await refused.json()).code, shown).toBe("settings_changed");
    }
    await send("/api/settings/run-location", { location: "local" });
    const local = await send("/api/jobs", klein, {
      "Idempotency-Key": "stale-box",
      "Genobi-Run-Location": "local",
      "Genobi-Gpu-Box": header(b, "vast"),
    });
    expect((await local.json()).code).toBe("settings_changed");
    expect(boxes.every((box) => box.prompts.length === 0)).toBe(true);
    expect(fake.prompts).toHaveLength(0);
  });

  it("runs when the shown box matches, and refuses a malformed one", async () => {
    const { send, a } = await twoBoxes();
    await send("/api/settings/run-location", {
      location: "box",
      box: { name: "lab box", port: a },
    });
    const ran = await send("/api/jobs", klein, {
      "Idempotency-Key": "box-match",
      "Genobi-Run-Location": "local",
      "Genobi-Gpu-Box": header(a, encodeURIComponent("lab box")),
    });
    expect(ran.status).toBe(202);
    expect(boxes[0].prompts).toHaveLength(1);
    for (const bad of ["root@host", "99999:x", "8188:", "8188:%zz"]) {
      const refused = await send("/api/quotes", klein, {
        "Genobi-Gpu-Box": bad,
      });
      expect(refused.status, bad).toBe(400);
    }
  });
});
