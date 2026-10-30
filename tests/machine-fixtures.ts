// Machines for the machine check tests: probes as the planner reads them, and
// the command output the probe parses, copied from real tools' formats.
import type { MachineProbe } from "../shared/machine";

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const GB = 1e9;

const base = {
  version: 1 as const,
  probedAt: "2026-10-22T10:00:00.000Z",
  cpuCores: 10,
  unread: [],
};

/** An M-series Mac: unified memory in GiB, as macOS sells it. */
export function mac(
  memoryGiB: number,
  freeDiskGB = 500,
  chip = "Apple M3 Max",
): MachineProbe {
  return {
    ...base,
    platform: "macos",
    arch: "arm64",
    memory: {
      totalBytes: memoryGiB * GiB,
      availableBytes: Math.round(memoryGiB * GiB * 0.6),
    },
    disk: { freeBytes: Math.round(freeDiskGB * GB), totalBytes: 2000 * GB },
    apple: { chip, unifiedMemoryBytes: memoryGiB * GiB },
    nvidia: null,
  };
}

/** A Linux box, with an NVIDIA GPU when `vramMiB` is given. */
export function linux(
  memoryGiB: number,
  vramMiB?: number,
  freeDiskGB = 1000,
  name = "NVIDIA GeForce RTX 5090",
): MachineProbe {
  return {
    ...base,
    platform: "linux",
    arch: "x64",
    memory: {
      totalBytes: memoryGiB * GiB,
      availableBytes: Math.round(memoryGiB * GiB * 0.8),
    },
    disk: { freeBytes: Math.round(freeDiskGB * GB), totalBytes: 2000 * GB },
    apple: null,
    nvidia: vramMiB
      ? {
          driver: "580.65.06",
          gpus: [
            { name, vramBytes: vramMiB * MiB, freeVramBytes: vramMiB * MiB },
          ],
        }
      : null,
  };
}

/** `sysctl hw.memsize machdep.cpu.brand_string` on a 16 GB M2. */
export const SYSCTL_M2 = `hw.memsize: 17179869184
machdep.cpu.brand_string: Apple M2
`;

/** The same keys on an Intel Mac: no Apple silicon. */
export const SYSCTL_INTEL = `hw.memsize: 17179869184
machdep.cpu.brand_string: Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz
`;

/** `vm_stat` on Apple silicon (16 KiB pages). */
export const VM_STAT = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               20000.
Pages active:                            400000.
Pages inactive:                          300000.
Pages speculative:                        10000.
Pages throttled:                              0.
Pages wired down:                        150000.
Pages purgeable:                           5000.
"Translation faults":                 123456789.
Pages copy-on-write:                    1234567.
Pages zero filled:                     98765432.
Pages reactivated:                       123456.
Pages purged:                             12345.
File-backed pages:                       200000.
Anonymous pages:                         500000.
Pages stored in compressor:              100000.
Pages occupied by compressor:             40000.
Decompressions:                          654321.
Compressions:                            765432.
Pageins:                                 876543.
Pageouts:                                  1234.
Swapins:                                      0.
Swapouts:                                     0.
`;

/** `nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits`. */
export const NVIDIA_5090 = "NVIDIA GeForce RTX 5090, 32607, 31850, 580.65.06\n";
export const NVIDIA_TWO = `NVIDIA GeForce RTX 3070, 8192, 7900, 550.120
NVIDIA RTX PRO 6000 Blackwell Workstation Edition, 97887, 97000, 550.120
`;
