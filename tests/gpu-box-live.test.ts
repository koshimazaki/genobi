import { afterEach, describe, expect, it, vi } from "vitest";
import { GpuBoxes } from "../server/gpu-boxes";
import { kleinBaseWorkflow } from "../shared/comfy/klein-base";
import type { BoxStatus } from "../shared/comfy/gpu-box";
import type { RunLocationState } from "../shared/comfy/run-location";
import { readBoxStatus, withLiveBox } from "../src/box-status";
import { fakeComfy, nodesFor, type FakeComfy } from "./fake-comfyui";
import { studio } from "./run-location-harness";

// A box's status is live telemetry, not a setting: it changes (the tunnel
// comes up, the box goes idle) while the settings revision stays the same, so
// the revision-ordered settings lane would drop it as a duplicate. It has its
// own read, and the studio applies it on top of the settings answer.

let box: FakeComfy | undefined;
afterEach(async () => {
  await box?.close();
  box = undefined;
  vi.unstubAllGlobals();
});

const status = (over: Partial<BoxStatus> = {}): BoxStatus => ({
  reachable: true,
  version: "0.3.99",
  gpu: null,
  vramBytes: null,
  upSince: "2026-11-05T10:00:00.000Z",
  lastJobAt: null,
  idle: false,
  idleMinutes: 20,
  ...over,
});

describe("live GPU box status", () => {
  it("reports a box whose tunnel came up, at the same settings revision", async () => {
    // A port nothing listens on yet: the tunnel is not up.
    box = await fakeComfy({ nodes: nodesFor(kleinBaseWorkflow.graph) });
    const port = Number(new URL(box.url).port);
    await box.close();
    const { send } = await studio([], undefined, undefined, new GpuBoxes());
    const chosen = await (
      await send("/api/settings/run-location", {
        location: "box",
        box: { name: "vast", port },
      })
    ).json();
    expect(chosen.box.status.reachable).toBe(false);
    // The tunnel comes up on the same port.
    box = await fakeComfy({
      nodes: nodesFor(kleinBaseWorkflow.graph),
      port,
    });
    const live = await (await send("/api/settings/run-location/box")).json();
    expect(live.status.reachable).toBe(true);
    const again = await (await send("/api/settings/run-location")).json();
    expect(again.revision).toBe(chosen.revision);
  });

  it("answers null when the session is not on a box", async () => {
    const { send } = await studio([], undefined, undefined, new GpuBoxes());
    expect(await (await send("/api/settings/run-location/box")).json()).toEqual(
      { status: null },
    );
  });

  it("applies live status over the settings answer, whatever its revision", async () => {
    const state = {
      revision: 7,
      location: "local",
      mode: "box",
      choices: ["box"],
      fixed: false,
      local: { reachable: false, version: null },
      box: {
        name: "vast",
        port: 18188,
        url: "http://127.0.0.1:18188",
        status: status({ reachable: false }),
      },
    } as unknown as RunLocationState;
    const merged = withLiveBox(state, status({ idle: true }))!;
    expect(merged.box!.status).toMatchObject({ reachable: true, idle: true });
    expect(merged.local).toEqual({ reachable: true, version: "0.3.99" });
    expect(merged.revision).toBe(7);
    expect(withLiveBox(state, null)).toBe(state);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ status: status() })),
    );
    expect(await readBoxStatus()).toMatchObject({ reachable: true });
  });
});
