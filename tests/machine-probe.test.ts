import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApp } from "../server/app";
import {
  MachineProbeService,
  NVIDIA_SMI,
  parseNvidiaSmi,
  parseSysctl,
  parseVmStat,
  PROBE_CACHE_MS,
  PROBE_TIMEOUT_MS,
  SYSCTL,
  VM_STAT as VM_STAT_COMMAND,
  type MachineOptions,
} from "../server/machine";
import { GENOBI_TOOLS } from "../server/agent-runner";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { readMachineProbe } from "../shared/machine";
import {
  NVIDIA_5090,
  NVIDIA_TWO,
  SYSCTL_INTEL,
  SYSCTL_M2,
  VM_STAT,
} from "./machine-fixtures";

// The probe on the local server: canned command output in, sizes and model
// names out, fixed commands only, cached, and nothing that names the machine.
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const missing = () =>
  Object.assign(new Error("spawn nvidia-smi ENOENT"), { code: "ENOENT" });

/** A fake runner that answers each fixed command and records every call. */
function fakeRun(answers: Record<string, string | Error>) {
  const calls: { command: string; args: string[]; timeout: number }[] = [];
  const run = async (command: string, args: string[], timeout: number) => {
    calls.push({ command, args, timeout });
    const answer = answers[command];
    if (answer === undefined) throw missing();
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { run, calls };
}

const disk = async () => ({
  bavail: 20_000_000,
  blocks: 240_000_000,
  bsize: 4096,
});

function service(
  options: MachineOptions,
  directory = "/Users/someone/studio/.local",
) {
  return new MachineProbeService(directory, {
    totalMemory: () => 8 * 1024 ** 3,
    freeMemory: () => 2 * 1024 ** 3,
    cpuCount: () => 8,
    statfs: disk,
    now: () => Date.parse("2026-10-22T10:00:00.000Z"),
    ...options,
  });
}

describe("parsing command output", () => {
  it("reads sysctl's memory and Apple chip", () => {
    expect(parseSysctl(SYSCTL_M2)).toEqual({
      memoryBytes: 17179869184,
      chip: "Apple M2",
      appleBrand: true,
    });
    expect(parseSysctl(SYSCTL_INTEL)).toMatchObject({
      chip: null,
      appleBrand: false,
    });
    expect(parseSysctl("hw.memsize: lots\n").memoryBytes).toBeNull();
  });

  it("reads vm_stat's free, inactive and speculative pages", () => {
    expect(parseVmStat(VM_STAT)).toBe((20000 + 300000 + 10000) * 16384);
    expect(parseVmStat("Pages free: 1.\n")).toBeNull();
  });

  it("reads nvidia-smi's GPUs, VRAM and driver", () => {
    expect(parseNvidiaSmi(NVIDIA_5090)).toEqual({
      driver: "580.65.06",
      gpus: [
        {
          name: "NVIDIA GeForce RTX 5090",
          vramBytes: 32607 * 1024 ** 2,
          freeVramBytes: 31850 * 1024 ** 2,
        },
      ],
    });
    expect(parseNvidiaSmi(NVIDIA_TWO)?.gpus.map((g) => g.name)).toEqual([
      "NVIDIA GeForce RTX 3070",
      "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
    ]);
    expect(
      parseNvidiaSmi("No devices were found\n") ??
        parseNvidiaSmi("GPU, [N/A], [N/A], 1\n"),
    ).toBeNull();
    expect(
      parseNvidiaSmi("NVIDIA A100, 81920, [N/A], 535.1\n")?.gpus[0]
        .freeVramBytes,
    ).toBeNull();
  });
});

describe("the machine probe", () => {
  it("reads a Mac with fixed commands and a timeout, and no nvidia-smi", async () => {
    const fake = fakeRun({
      [SYSCTL[0]]: SYSCTL_M2,
      [VM_STAT_COMMAND[0]]: VM_STAT,
    });
    const probe = await service({
      run: fake.run,
      platform: "darwin",
      arch: "arm64",
    }).probe();
    expect(fake.calls).toEqual([
      {
        command: "/usr/sbin/sysctl",
        args: SYSCTL[1],
        timeout: PROBE_TIMEOUT_MS,
      },
      { command: "/usr/bin/vm_stat", args: [], timeout: PROBE_TIMEOUT_MS },
    ]);
    expect(probe).toEqual({
      version: 1,
      probedAt: "2026-10-22T10:00:00.000Z",
      platform: "macos",
      arch: "arm64",
      cpuCores: 8,
      memory: {
        totalBytes: 17179869184,
        availableBytes: 330000 * 16384,
      },
      disk: { freeBytes: 20_000_000 * 4096, totalBytes: 240_000_000 * 4096 },
      apple: { chip: "Apple M2", unifiedMemoryBytes: 17179869184 },
      nvidia: null,
      unread: [],
    });
    expect(readMachineProbe(probe)).toEqual(probe);
  });

  it("reads a Linux box's NVIDIA GPU, and a missing driver is not a failure", async () => {
    const fake = fakeRun({ [NVIDIA_SMI[0]]: NVIDIA_5090 });
    const probe = await service({
      run: fake.run,
      platform: "linux",
      arch: "x64",
    }).probe();
    expect(fake.calls).toEqual([
      { command: "nvidia-smi", args: NVIDIA_SMI[1], timeout: PROBE_TIMEOUT_MS },
    ]);
    expect(NVIDIA_SMI[1].join(" ")).not.toMatch(/serial|uuid|pci/i);
    expect(probe.nvidia?.gpus[0].vramBytes).toBe(32607 * 1024 ** 2);
    expect(probe.memory).toEqual({
      totalBytes: 8 * 1024 ** 3,
      availableBytes: 2 * 1024 ** 3,
    });
    const none = await service({
      run: fakeRun({}).run,
      platform: "linux",
    }).probe();
    expect(none).toMatchObject({ nvidia: null, unread: [] });
  });

  it("names a read that failed, without its error", async () => {
    const timedOut = Object.assign(new Error("/opt/x timed out"), {
      killed: true,
    });
    const probe = await service({
      run: fakeRun({ [NVIDIA_SMI[0]]: timedOut }).run,
      platform: "linux",
      statfs: async () => {
        throw new Error("ENOENT /Users/someone");
      },
    }).probe();
    expect(probe).toMatchObject({
      nvidia: null,
      disk: null,
      unread: ["nvidia-smi", "disk"],
    });
    const mac = await service({
      run: fakeRun({ [SYSCTL[0]]: timedOut }).run,
      platform: "darwin",
    }).probe();
    expect(mac).toMatchObject({
      apple: null,
      memory: { availableBytes: null },
      unread: ["sysctl", "vm_stat"],
    });
    expect(JSON.stringify([probe, mac])).not.toMatch(/someone|opt|timed/);
  });

  it("caches for a minute and runs one probe at a time", async () => {
    const fake = fakeRun({ [NVIDIA_SMI[0]]: NVIDIA_5090 });
    let now = 0;
    const machine = service({
      run: fake.run,
      platform: "linux",
      now: () => now,
    });
    await Promise.all([machine.probe(), machine.probe(), machine.probe()]);
    expect(fake.calls).toHaveLength(1);
    now = PROBE_CACHE_MS - 1;
    await machine.probe();
    expect(fake.calls).toHaveLength(1);
    now = PROBE_CACHE_MS;
    await machine.probe();
    expect(fake.calls).toHaveLength(2);
  });

  it("returns nothing that names this machine or its owner", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-machine-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    // The real machine: its own commands, memory and disk.
    const probe = await new MachineProbeService(directory).probe();
    const text = JSON.stringify(probe);
    expect(text).not.toContain(os.hostname());
    expect(text).not.toContain(os.userInfo().username);
    expect(text).not.toContain(directory);
    expect(text).not.toContain(os.homedir());
    expect(probe.memory.totalBytes).toBeGreaterThan(0);
    expect(probe.disk?.freeBytes).toBeGreaterThan(0);
  });
});

async function studio(machine: MachineOptions) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-machine-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, ".local");
  const { app } = await createApp({
    directory,
    publicDirectory: directory,
    machine,
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe("GET /api/machine and genobi_machine", () => {
  const box: MachineOptions = {
    run: fakeRun({ [NVIDIA_SMI[0]]: NVIDIA_5090 }).run,
    platform: "linux",
    arch: "x64",
    totalMemory: () => 64 * 1024 ** 3,
    freeMemory: () => 48 * 1024 ** 3,
    statfs: disk,
  };

  it("answers the probe and its plan, uncached by the browser", async () => {
    const base = await studio(box);
    const response = await fetch(`${base}/api/machine`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { probe, plan } = await response.json();
    expect(readMachineProbe(probe)).toEqual(probe);
    expect(plan.accelerator).toBe("nvidia");
    expect(plan.capabilities.map((c: { where: string }) => c.where)).toEqual([
      "local",
      "local",
      "cloud",
      "local",
      "cloud",
      "local",
    ]);
  });

  it("gives agents the summary and plan, read-only, in the session's tools", async () => {
    const base = await studio(box);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(new GenobiApi(studioUrl(base))).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    cleanups.push(() => client.close());
    const listed = (await client.listTools()).tools.find(
      (t) => t.name === "genobi_machine",
    );
    expect(listed?.annotations).toMatchObject({ readOnlyHint: true });
    const result = await client.callTool({
      name: "genobi_machine",
      arguments: {},
    });
    const answer = JSON.parse((result.content as { text: string }[])[0].text);
    expect(answer.machine).toMatch(
      /^68\.7 GB memory; NVIDIA GeForce RTX 5090, 34\.2 GB VRAM/,
    );
    expect(answer.summary[0]).toBe(
      "Transcription (voice mode): Qwen3-ASR-0.6B (CPU), on this machine.",
    );
    expect(answer.summary[1]).toBe(
      "Listening (describing music and sound): Voxtral Mini 3B, on this machine.",
    );
    expect(answer.plan.caveats.length).toBeGreaterThan(0);
    expect(GENOBI_TOOLS).toContain("genobi_machine");
  });
});
