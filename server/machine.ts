import express from "express";
import { statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  APPLE_CHIP,
  DRIVER_VERSION,
  GPU_NAME,
  MACHINE_PROBE_VERSION,
  readMachineProbe,
  type MachineProbe,
  type NvidiaGpu,
  type ProbeArch,
  type ProbePlatform,
  type UnreadPart,
} from "../shared/machine";
import { planMachine } from "../shared/machine-plan";
import type { RateBucket } from "../shared/limits";
import { runProcess, type Run } from "./ffmpeg";

/**
 * The machine probe on the local server: total and free memory, free disk on
 * the studio's data volume, CPU architecture, the Apple silicon chip and its
 * unified memory, and NVIDIA GPUs with their VRAM. It runs three fixed
 * commands, each with fixed arguments, no shell and a timeout, and keeps only
 * sizes and model names: never a hostname, user name, serial number or path.
 * The answer is cached briefly, so a busy agent cannot keep spawning them.
 */
export const PROBE_TIMEOUT_MS = 5_000;
export const PROBE_CACHE_MS = 60_000;
const MIB = 1024 * 1024;

/** macOS: the two keys every Mac has, by name, so their order cannot matter. */
export const SYSCTL: [string, string[]] = [
  "/usr/sbin/sysctl",
  ["hw.memsize", "machdep.cpu.brand_string"],
];
export const VM_STAT: [string, string[]] = ["/usr/bin/vm_stat", []];
/** No serial, UUID or bus id is asked for. */
export const NVIDIA_SMI: [string, string[]] = [
  "nvidia-smi",
  [
    "--query-gpu=name,memory.total,memory.free,driver_version",
    "--format=csv,noheader,nounits",
  ],
];

export interface MachineOptions {
  run?: Run;
  platform?: NodeJS.Platform;
  arch?: string;
  totalMemory?: () => number;
  freeMemory?: () => number;
  cpuCount?: () => number;
  statfs?: (
    directory: string,
  ) => Promise<{ bavail: number; blocks: number; bsize: number }>;
  now?: () => number;
}

const safe = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

/** `hw.memsize: 34359738368` and `machdep.cpu.brand_string: Apple M1 Max`. */
export function parseSysctl(text: string) {
  const values = new Map<string, string>();
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) values.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  const memory = values.get("hw.memsize");
  const brand = values.get("machdep.cpu.brand_string") ?? "";
  return {
    memoryBytes: memory && /^\d{1,16}$/.test(memory) ? safe(+memory) : null,
    chip: APPLE_CHIP.test(brand) ? brand : null,
    appleBrand: brand.startsWith("Apple "),
  };
}

/** Free, inactive and speculative pages: what macOS can hand out now. */
export function parseVmStat(text: string): number | null {
  const page = /page size of (\d{1,6}) bytes/.exec(text)?.[1];
  if (!page) return null;
  const count = (name: string) => {
    const match = new RegExp(`^Pages ${name}:\\s+(\\d{1,14})\\.?$`, "m").exec(
      text,
    );
    return match ? Number(match[1]) : null;
  };
  const parts = [count("free"), count("inactive"), count("speculative")];
  if (parts.some((value) => value === null)) return null;
  return safe((parts as number[]).reduce((a, b) => a + b, 0) * Number(page));
}

/** One CSV line per GPU: name, total MiB, free MiB, driver. */
export function parseNvidiaSmi(text: string) {
  const gpus: NvidiaGpu[] = [];
  let driver: string | null = null;
  for (const line of text.split("\n").slice(0, 16)) {
    const fields = line.split(",").map((field) => field.trim());
    if (fields.length !== 4) continue;
    const [name, total, free, version] = fields;
    const cleanName = name.replace(/[^A-Za-z0-9 ._()+/-]/g, "").slice(0, 80);
    if (!GPU_NAME.test(cleanName) || !/^\d{1,8}$/.test(total)) continue;
    gpus.push({
      name: cleanName,
      vramBytes: Number(total) * MIB,
      freeVramBytes: /^\d{1,8}$/.test(free) ? Number(free) * MIB : null,
    });
    if (DRIVER_VERSION.test(version)) driver ??= version;
  }
  return gpus.length ? { driver, gpus } : null;
}

const PLATFORMS: Partial<Record<NodeJS.Platform, ProbePlatform>> = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

export class MachineProbeService {
  private cached: { at: number; probe: MachineProbe } | null = null;
  private pending: Promise<MachineProbe> | null = null;
  private readonly run: Run;
  private readonly now: () => number;

  constructor(
    /** The studio's data folder; only its volume's free space is read. */
    private readonly directory: string,
    private readonly options: MachineOptions = {},
  ) {
    this.run = options.run ?? runProcess;
    this.now = options.now ?? Date.now;
  }

  /** The cached probe while it is fresh; one probe at a time otherwise. */
  async probe(): Promise<MachineProbe> {
    if (this.cached && this.now() - this.cached.at < PROBE_CACHE_MS)
      return this.cached.probe;
    this.pending ??= this.read().finally(() => (this.pending = null));
    const probe = await this.pending;
    this.cached = { at: this.now(), probe };
    return probe;
  }

  private async attempt(command: [string, string[]]) {
    try {
      return {
        ok: true as const,
        text: await this.run(...command, PROBE_TIMEOUT_MS),
      };
    } catch (error) {
      // Not installed is an answer (no NVIDIA driver), not a failed read.
      const missing = (error as NodeJS.ErrnoException)?.code === "ENOENT";
      return { ok: false as const, missing };
    }
  }

  private async disk() {
    const read = this.options.statfs ?? statfs;
    for (const folder of [this.directory, path.dirname(this.directory)])
      try {
        const stats = await read(folder);
        const free = safe(stats.bavail * stats.bsize);
        const total = safe(stats.blocks * stats.bsize);
        if (free !== null && total !== null)
          return { freeBytes: free, totalBytes: total };
      } catch {
        // The data folder may not exist yet; its parent is on the same volume.
      }
    return null;
  }

  private async read(): Promise<MachineProbe> {
    const platform = this.options.platform ?? process.platform;
    const arch = this.options.arch ?? process.arch;
    const unread: UnreadPart[] = [];
    let totalBytes = safe((this.options.totalMemory ?? os.totalmem)()) ?? 0;
    // Linux reports available memory here; macOS reports only free pages.
    let availableBytes = safe((this.options.freeMemory ?? os.freemem)());
    let apple: MachineProbe["apple"] = null;
    if (platform === "darwin") {
      const sysctl = await this.attempt(SYSCTL);
      if (sysctl.ok) {
        const read = parseSysctl(sysctl.text);
        if (read.memoryBytes) totalBytes = read.memoryBytes;
        if (read.appleBrand && read.memoryBytes)
          apple = {
            chip: read.chip ?? "Apple silicon",
            unifiedMemoryBytes: read.memoryBytes,
          };
      } else unread.push("sysctl");
      const vm = await this.attempt(VM_STAT);
      const pages = vm.ok ? parseVmStat(vm.text) : null;
      if (pages === null) unread.push("vm_stat");
      availableBytes = pages;
    }
    let nvidia: MachineProbe["nvidia"] = null;
    if (platform !== "darwin") {
      const smi = await this.attempt(NVIDIA_SMI);
      if (smi.ok) nvidia = parseNvidiaSmi(smi.text);
      else if (!smi.missing) unread.push("nvidia-smi");
    }
    const disk = await this.disk();
    if (!disk) unread.push("disk");
    const cores = (this.options.cpuCount ?? os.availableParallelism)();
    return readMachineProbe({
      version: MACHINE_PROBE_VERSION,
      probedAt: new Date(this.now()).toISOString(),
      platform: PLATFORMS[platform] ?? "other",
      arch: (arch === "arm64" || arch === "x64" ? arch : "other") as ProbeArch,
      cpuCores:
        Number.isInteger(cores) && cores > 0 ? Math.min(cores, 4096) : 0,
      memory: { totalBytes, availableBytes },
      disk,
      apple,
      nvidia,
      unread,
    });
  }
}

/**
 * Local only: `GET /api/machine`, the probe and the plan it gives. Reads
 * only and never pays; the hosted Worker has no machine to read.
 */
export function machineRouter(
  machine: MachineProbeService,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  router.get("/", async (_request, response) => {
    limit("history", response.locals.sessionId);
    const probe = readMachineProbe(await machine.probe());
    response.setHeader("Cache-Control", "no-store");
    response.json({ probe, plan: planMachine(probe) });
  });
  return router;
}
