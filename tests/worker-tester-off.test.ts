// Tester access with no secret set: the shipped default. Nothing is offered,
// the routes are absent, and a token-shaped key is refused before any call.
import { describe, expect, it } from "vitest";
import {
  call,
  cloudRequests,
  newSession,
  routerRequests,
  useWorker,
} from "./worker-harness";
import { deploymentRequests } from "./worker-deploy-provider";

useWorker();

describe("hosted tester access without its secrets", () => {
  it("reports testerAccess false and has no unlock or status route", async () => {
    const health = (await (await call("/api/health")).json()) as {
      testerAccess: unknown;
    };
    expect(health.testerAccess).toBe(false);
    const session = newSession();
    const unlock = await call("/api/tester/unlock", {
      method: "POST",
      headers: { cookie: session, "content-type": "application/json" },
      body: JSON.stringify({ code: "anything-at-all-123" }),
    });
    expect(unlock.status).toBe(404);
    const status = await call("/api/tester/status", {
      headers: { cookie: session },
    });
    expect(status.status).toBe(404);
  });
  it("refuses a tester-shaped key rather than forwarding it to a provider", async () => {
    const before = [
      deploymentRequests.length,
      routerRequests.length,
      cloudRequests.length,
    ];
    const response = await call("/api/quotes", {
      method: "POST",
      headers: {
        cookie: newSession(),
        "content-type": "application/json",
        "x-byo-key": `comfyui-tester.${Date.now() + 60_000}.forged`,
      },
      body: JSON.stringify({
        generator: "video",
        presetId: "orbit_l",
        model: "ltx-2-5-fast",
        description: "A room.",
        duration: 6,
        resolution: "hd",
        draft: false,
        cameraEnabled: false,
        upscaleFactor: 2,
      }),
    });
    expect(response.status).toBe(401);
    expect([
      deploymentRequests.length,
      routerRequests.length,
      cloudRequests.length,
    ]).toEqual(before);
  });
});
