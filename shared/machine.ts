/**
 * What the machine check reads about the computer the local studio runs on,
 * and the one validator both its route and the MCP tool hold an answer to.
 * The probe carries sizes, the chip or GPU model and the CPU architecture,
 * nothing that names this machine or its owner: no hostname, user name,
 * serial number or path. The probe itself is `server/machine.ts`; the plan
 * that reads it is `shared/machine-plan.ts`.
 */
export const MACHINE_PROBE_VERSION = 1;

/** Where a local model would run: Apple silicon, an NVIDIA GPU, or neither. */
export type Accelerator = "apple" | "nvidia" | "none";
export type ProbePlatform = "macos" | "linux" | "windows" | "other";
export type ProbeArch = "arm64" | "x64" | "other";
/** A read that was expected on this platform but failed or timed out. */
export type UnreadPart = "sysctl" | "vm_stat" | "nvidia-smi" | "disk";
export const UNREAD_PARTS: readonly UnreadPart[] = [
  "sysctl",
  "vm_stat",
  "nvidia-smi",
  "disk",
];

export interface NvidiaGpu {
  /** The GPU's model name as `nvidia-smi` reports it, such as NVIDIA GeForce RTX 5090. */
  name: string;
  vramBytes: number;
  freeVramBytes: number | null;
}

export interface MachineProbe {
  version: typeof MACHINE_PROBE_VERSION;
  probedAt: string;
  platform: ProbePlatform;
  arch: ProbeArch;
  cpuCores: number;
  memory: {
    totalBytes: number;
    /** Free plus reclaimable memory now, where the platform reports it. */
    availableBytes: number | null;
  };
  /** The volume holding the studio's data folder (`.local`), never its path. */
  disk: { freeBytes: number; totalBytes: number } | null;
  /** Apple silicon: the chip's name and its unified memory. */
  apple: { chip: string; unifiedMemoryBytes: number } | null;
  /** NVIDIA GPUs through `nvidia-smi`, when it is installed. */
  nvidia: { driver: string | null; gpus: NvidiaGpu[] } | null;
  unread: UnreadPart[];
}

/**
 * `Apple M1 Max`, `Apple M4 Pro`: the chip names macOS reports, or `Apple
 * silicon` for an Apple chip named some other way.
 */
export const APPLE_CHIP = /^Apple (M\d{1,2}( (Pro|Max|Ultra))?|silicon)$/;
/** A GPU model name: letters, digits, spaces and a little punctuation. */
export const GPU_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()+/-]{0,79}$/;
export const DRIVER_VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
/** Sixteen GPUs and 1 PB are well past any machine this studio runs on. */
const MAX_GPUS = 16;
const MAX_BYTES = 2 ** 50;

const invalid = (field: string) =>
  new Error(`The machine check answered an invalid ${field}.`);

function bytes(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_BYTES
  )
    throw invalid(field);
  return value;
}
const maybeBytes = (value: unknown, field: string) =>
  value === null ? null : bytes(value, field);

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid(field);
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw invalid(field);
  return value as T;
}

function text(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw invalid(field);
  return value;
}

/**
 * Rebuilds a probe from an untrusted value, field by field, so nothing the
 * value carries beyond the fields above reaches an answer. Throws on any
 * field of the wrong type, size or form.
 */
export function readMachineProbe(value: unknown): MachineProbe {
  const probe = object(value, "probe");
  if (probe.version !== MACHINE_PROBE_VERSION) throw invalid("version");
  const memory = object(probe.memory, "memory");
  const cores = probe.cpuCores;
  if (typeof cores !== "number" || !Number.isInteger(cores))
    throw invalid("CPU count");
  if (cores < 0 || cores > 4096) throw invalid("CPU count");
  const disk =
    probe.disk === null ? null : object(probe.disk, "disk information");
  const apple = probe.apple === null ? null : object(probe.apple, "chip");
  const nvidia = probe.nvidia === null ? null : object(probe.nvidia, "GPU");
  if (nvidia && (!Array.isArray(nvidia.gpus) || nvidia.gpus.length > MAX_GPUS))
    throw invalid("GPU list");
  if (!Array.isArray(probe.unread) || probe.unread.length > UNREAD_PARTS.length)
    throw invalid("list of unread parts");
  return {
    version: MACHINE_PROBE_VERSION,
    probedAt: text(probe.probedAt, ISO_TIME, "time"),
    platform: oneOf(
      probe.platform,
      ["macos", "linux", "windows", "other"],
      "platform",
    ),
    arch: oneOf(probe.arch, ["arm64", "x64", "other"], "architecture"),
    cpuCores: cores,
    memory: {
      totalBytes: bytes(memory.totalBytes, "memory size"),
      availableBytes: maybeBytes(memory.availableBytes, "free memory"),
    },
    disk: disk && {
      freeBytes: bytes(disk.freeBytes, "free disk"),
      totalBytes: bytes(disk.totalBytes, "disk size"),
    },
    apple: apple && {
      chip: text(apple.chip, APPLE_CHIP, "chip name"),
      unifiedMemoryBytes: bytes(apple.unifiedMemoryBytes, "unified memory"),
    },
    nvidia: nvidia && {
      driver:
        nvidia.driver === null
          ? null
          : text(nvidia.driver, DRIVER_VERSION, "driver version"),
      gpus: (nvidia.gpus as unknown[]).map((gpu) => {
        const card = object(gpu, "GPU");
        return {
          name: text(card.name, GPU_NAME, "GPU name"),
          vramBytes: bytes(card.vramBytes, "GPU memory"),
          freeVramBytes: maybeBytes(card.freeVramBytes, "free GPU memory"),
        };
      }),
    },
    unread: [
      ...new Set(
        probe.unread.map((part) => oneOf(part, UNREAD_PARTS, "unread part")),
      ),
    ],
  };
}

/** Decimal gigabytes, as the model makers and Hugging Face write them. */
export const GB = 1e9;
export const gb = (bytes: number) => Math.round((bytes / GB) * 10) / 10;

/** The accelerator a local model would use: the largest NVIDIA GPU first. */
export function acceleratorOf(probe: MachineProbe): Accelerator {
  if (probe.nvidia?.gpus.length) return "nvidia";
  if (probe.apple) return "apple";
  return "none";
}

/** One line a person can read: chip or GPU, memory and free disk. */
export function describeProbe(probe: MachineProbe): string {
  const parts: string[] = [];
  if (probe.apple)
    parts.push(
      `${probe.apple.chip}, ${gb(probe.apple.unifiedMemoryBytes)} GB unified memory`,
    );
  else parts.push(`${gb(probe.memory.totalBytes)} GB memory`);
  for (const gpu of probe.nvidia?.gpus ?? [])
    parts.push(`${gpu.name}, ${gb(gpu.vramBytes)} GB VRAM`);
  if (!probe.apple && !probe.nvidia?.gpus.length)
    parts.push("no NVIDIA GPU or Apple silicon");
  if (probe.memory.availableBytes !== null)
    parts.push(`${gb(probe.memory.availableBytes)} GB free now`);
  parts.push(
    probe.disk
      ? `${gb(probe.disk.freeBytes)} GB free disk`
      : "free disk unknown",
  );
  return `${parts.join("; ")} (${probe.platform}, ${probe.arch}).`;
}
