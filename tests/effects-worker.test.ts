import { describe, expect, it } from "vitest";
import { createEffectVariant, inspectEffectPreset } from "../shared/effects";
import { call, useWorker } from "./worker-harness";

useWorker();
const request = (body: unknown) =>
  call("/api/effects/variants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("hosted effect metadata and variants need no generation credential", () => {
  it("shares inspect/create/validate results with the portable catalogue", async () => {
    const result = await call("/api/effects?presetId=poster-window");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      preset: inspectEffectPreset("poster-window"),
    });
    const response = await request({
      action: "create",
      presetId: "poster-window",
      name: "Hosted ink",
      parameters: { mix: 0.2 },
    });
    expect(response.status).toBe(200);
    const variant = createEffectVariant("poster-window", "Hosted ink", {
      mix: 0.2,
    });
    expect(await response.json()).toEqual({ variant });
    const checked = await request({ action: "validate", variant });
    expect(checked.status).toBe(200);
    expect(await checked.json()).toEqual({ variant });
  });
  it("rejects malformed, oversized or executable configuration", async () => {
    const bad = await request({
      action: "create",
      presetId: "poster-window",
      name: "Bad",
      parameters: { script: "untrusted" },
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: "invalid_effect" });
    expect(
      (await request({ action: "create", name: "a".repeat(17000) })).status,
    ).toBe(413);
    expect((await call("/api/effects?presetId=unknown")).status).toBe(400);
  });
});
