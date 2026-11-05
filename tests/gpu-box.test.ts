import { afterEach, describe, expect, it } from "vitest";
import {
  boxDevice,
  boxIdle,
  boxUrl,
  parseGpuBox,
  tunnelCommand,
  uptime,
} from "../shared/comfy/gpu-box";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import { GpuBoxes } from "../server/gpu-boxes";
import { fakeComfy, type FakeComfy } from "./fake-comfyui";

// A GPU box (Vast or the lab machine) is a named loopback destination with a
// port, reached through the person's own SSH tunnel: its parsing, the tunnel
// command, the device line, uptime and the idle reminder.

const MINUTE = 60_000;
let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

describe("GPU box settings", () => {
  it("reads a name and a tunnel port, and refuses anything else without echoing it", () => {
    expect(parseGpuBox({ name: " vast-5090 ", port: 18188 })).toEqual({
      name: "vast-5090",
      port: 18188,
    });
    expect(parseGpuBox({ name: "lab\u0007 box", port: "8188" })).toEqual({
      name: "lab box",
      port: 8188,
    });
    for (const bad of [
      undefined,
      [],
      { name: "", port: 8188 },
      { name: "x".repeat(41), port: 8188 },
      { name: "root@203.0.113.9", port: 8188 },
      { name: "box", port: 80 },
      { name: "box", port: 70000 },
      { name: "box", port: 8188.5 },
      { name: "box", port: "8188; rm -rf /" },
    ])
      expect(() => parseGpuBox(bad)).toThrow(
        expect.objectContaining({ code: "invalid_destination" }),
      );
    try {
      parseGpuBox({ name: "root@203.0.113.9", port: 8188 });
    } catch (error) {
      expect((error as Error).message).not.toContain("203.0.113.9");
    }
    // The studio's own port is never a box's.
    expect(() => parseGpuBox({ name: "box", port: 4317 }, [4317])).toThrow(
      /studio's own/,
    );
  });

  it("accepts the tunnel's loopback end and still refuses plaintext remote hosts", () => {
    expect(parseWorkflowDestination("local", boxUrl(18188))).toEqual({
      kind: "local",
      url: "http://127.0.0.1:18188",
    });
    for (const remote of [
      "http://203.0.113.9:8188",
      "http://my-vast-box.example:8188",
      "http://localhost.evil.test:8188",
      "http://127.0.0.1.nip.io:8188",
      "https://203.0.113.9:8188",
      "http://user:pass@127.0.0.1:8188",
    ])
      expect(() => parseWorkflowDestination("local", remote)).toThrow(
        expect.objectContaining({ code: "invalid_destination" }),
      );
    const boxes = new GpuBoxes({ reservedPorts: [4317] });
    expect(boxes.client("http://127.0.0.1:18188")?.base).toBe(
      "http://127.0.0.1:18188",
    );
    expect(boxes.client("http://203.0.113.9:18188")).toBeUndefined();
    expect(boxes.client("http://127.0.0.1:4317")).toBeUndefined();
    expect(boxes.client("http://127.0.0.1")).toBeUndefined();
    expect(boxes.owner("http://203.0.113.9:18188/history/x")).toBeUndefined();
    expect(boxes.owner("http://127.0.0.1:18188/history/abc")?.base).toBe(
      "http://127.0.0.1:18188",
    );
  });

  it("builds the tunnel command from what was typed, with placeholders for the rest", () => {
    expect(tunnelCommand()).toBe(
      "ssh -N -L <port>:127.0.0.1:<remote-port> <user@host>",
    );
    expect(
      tunnelCommand({
        localPort: 8188,
        remotePort: "18188",
        target: "root@ssh5.vast.ai",
        sshPort: "31234",
      }),
    ).toBe("ssh -N -p 31234 -L 8188:127.0.0.1:18188 root@ssh5.vast.ai");
    // Anything a shell would read as more stays a placeholder.
    expect(
      tunnelCommand({
        localPort: "8188 && curl x",
        remotePort: "$(id)",
        target: "root@host; rm -rf ~",
        sshPort: "-oProxyCommand=x",
      }),
    ).toBe("ssh -N -L <port>:127.0.0.1:<remote-port> <user@host>");
  });

  it("keeps only the GPU's name and memory from /system_stats", () => {
    expect(
      boxDevice({
        system: { argv: ["/home/someone/ComfyUI/main.py"] },
        devices: [
          {
            name: "cuda:0 NVIDIA GeForce RTX 5090 : cudaMallocAsync",
            vram_total: 34190917632,
          },
        ],
      }),
    ).toEqual({
      gpu: "cuda:0 NVIDIA GeForce RTX 5090 : cudaMallocAsync",
      vramBytes: 34190917632,
    });
    expect(boxDevice({ devices: [] })).toEqual({ gpu: null, vramBytes: null });
    expect(boxDevice(null)).toEqual({ gpu: null, vramBytes: null });
  });

  it("reminds after N idle minutes, counting from the last job, and only reminds", () => {
    const up = "2026-11-05T10:00:00.000Z";
    const start = Date.parse(up);
    expect(boxIdle(up, null, 20, start + 19 * MINUTE)).toBe(false);
    expect(boxIdle(up, null, 20, start + 20 * MINUTE)).toBe(true);
    const job = new Date(start + 15 * MINUTE).toISOString();
    expect(boxIdle(up, job, 20, start + 30 * MINUTE)).toBe(false);
    expect(boxIdle(up, job, 20, start + 35 * MINUTE)).toBe(true);
    expect(boxIdle(null, null, 20, start + 999 * MINUTE)).toBe(false);
    expect(uptime(up, start + 125 * MINUTE)).toBe("2 h 05 min");
    expect(uptime(up, start + 7 * MINUTE)).toBe("7 min");
    expect(uptime(null)).toBe("");
  });
});

describe("GPU box status", () => {
  it("reports the GPU, uptime from its first answer, and the idle reminder", async () => {
    fake = await fakeComfy({
      nodes: {},
      devices: [{ name: "NVIDIA RTX PRO 6000", vram_total: 102 * 1024 ** 3 }],
    });
    fake.state = "success"; // an empty queue
    let now = Date.parse("2026-11-05T10:00:00.000Z");
    const port = Number(new URL(fake.url).port);
    const boxes = new GpuBoxes({ idleMinutes: 20, now: () => now });
    const first = await boxes.status({ name: "vast", port });
    expect(first).toMatchObject({
      reachable: true,
      version: "0.3.99",
      gpu: "NVIDIA RTX PRO 6000",
      vramBytes: 102 * 1024 ** 3,
      upSince: "2026-11-05T10:00:00.000Z",
      lastJobAt: null,
      idle: false,
      idleMinutes: 20,
    });
    // A queued run counts as work, not idle time.
    fake.state = "running";
    now += 25 * MINUTE;
    expect((await boxes.status({ name: "vast", port })).idle).toBe(false);
    expect((await boxes.status({ name: "vast", port })).lastJobAt).toBe(
      "2026-11-05T10:25:00.000Z",
    );
    fake.state = "success";
    now += 21 * MINUTE;
    const idle = await boxes.status({ name: "vast", port });
    expect(idle.idle).toBe(true);
    expect(idle.upSince).toBe("2026-11-05T10:00:00.000Z");
    // Reading is free: only GETs of /system_stats and /queue; nothing is
    // submitted, interrupted or stopped.
    expect(
      [...new Set(fake.requests.map((r) => `${r.method} ${r.path}`))].sort(),
    ).toEqual(["GET /queue", "GET /system_stats"]);
  });

  it("starts uptime again once the box stops answering", async () => {
    fake = await fakeComfy({ nodes: {} });
    let now = Date.parse("2026-11-05T10:00:00.000Z");
    const port = Number(new URL(fake.url).port);
    const boxes = new GpuBoxes({ now: () => now });
    await boxes.status({ name: "lab", port });
    await fake.close();
    fake = undefined;
    now += 60 * MINUTE;
    expect(await boxes.status({ name: "lab", port })).toMatchObject({
      reachable: false,
      upSince: null,
      idle: false,
    });
  });
});
