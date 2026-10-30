import { describe, expect, it } from "vitest";
import { readMachineProbe, type MachineProbe } from "../shared/machine";
import {
  CAPABILITIES,
  CLOUD_MODELS,
  LOCAL_MODELS,
  TRANSCRIPTION_MODEL,
  type Capability,
  type CloudCapability,
} from "../shared/machine-models";
import {
  DISK_RESERVE_GB,
  planMachine,
  summarisePlan,
  UNIFIED_SHARE,
} from "../shared/machine-plan";
import { linux, mac } from "./machine-fixtures";

// The machine check's plan: which capability runs on this machine and which
// on Comfy Cloud, from the probe and the makers' documented requirements.
/** Every row but transcription, which is always local and checked on its own. */
const cloudRows = (probe: MachineProbe) =>
  planMachine(probe).capabilities.filter(
    (c) => c.capability !== "transcription",
  );
const where = (probe: MachineProbe) =>
  Object.fromEntries(
    cloudRows(probe).map((c) => [
      c.capability,
      c.where === "local" ? c.model : c.where,
    ]),
  ) as Record<CloudCapability, string>;
const plan = (probe: MachineProbe, capability: Capability) =>
  planMachine(probe).capabilities.find((c) => c.capability === capability)!;

describe("the machine plan", () => {
  it("puts the smallest listening model on a 16 GB M-series Mac, the rest on Cloud", () => {
    const probe = mac(16, 500, "Apple M2");
    expect(planMachine(probe)).toMatchObject({
      accelerator: "apple",
      memoryBudgetGb: 12.88,
    });
    expect(where(probe)).toEqual({
      listening: "Voxtral Mini 3B",
      vision: "cloud",
      klein: "cloud",
      ltx: "cloud",
      upscaler: "cloud",
    });
    expect(plan(probe, "upscaler").candidates[0].reason).toMatch(
      /Needs 16 GB of GPU memory; 12.88 GB is usable here/,
    );
    expect(plan(probe, "klein").candidates[0].reason).toMatch(
      /Documented for NVIDIA GPUs only; this machine has Apple silicon/,
    );
  });

  it("puts the largest documented listening model on a 128 GB M-series Mac", () => {
    const probe = mac(128);
    expect(where(probe)).toEqual({
      listening: "Qwen3-Omni-30B-A3B-Instruct",
      vision: "cloud",
      klein: "cloud",
      ltx: "cloud",
      upscaler: "SeedVR2 3B (FP8)",
    });
    const listening = plan(probe, "listening");
    // The Captioner is larger in purpose but has no figure of its own.
    expect(listening.candidates[0]).toMatchObject({
      label: "Qwen3-Omni-30B-A3B-Captioner",
      fits: false,
      memoryGb: null,
    });
    expect(listening.candidates[0].reason).toMatch(/No documented memory/);
    expect(listening.reason).toMatch(/^The largest local model that fits/);
    expect(listening.note).toMatch(/no local listening worker yet/);
  });

  it("runs Klein and the upscaler on a 32 GB RTX 5090, listening on Voxtral Mini", () => {
    const probe = linux(64, 32607);
    expect(planMachine(probe)).toMatchObject({
      accelerator: "nvidia",
      memoryBudgetGb: 34.19,
    });
    expect(where(probe)).toEqual({
      listening: "Voxtral Mini 3B",
      vision: "cloud",
      klein: "FLUX 3 Image Klein (ComfyUI int8)",
      ltx: "cloud",
      upscaler: "SeedVR2 3B (FP8)",
    });
    // Qwen2.5-Omni-7B's 31.11 GB grows by the card's own 1.2 factor.
    const omni = plan(probe, "listening").candidates.find(
      (c) => c.id === "qwen2-5-omni-7b",
    )!;
    expect(omni).toMatchObject({ fits: false, memoryGb: 37.33 });
    expect(omni.reason).toMatch(/31.11 GB × 1.2/);
    expect(plan(probe, "klein").note).toMatch(/local ComfyUI run location/);
  });

  it("sends everything to Cloud on 8 GB with no GPU", () => {
    const probe = linux(8);
    expect(planMachine(probe)).toMatchObject({
      accelerator: "none",
      memoryBudgetGb: 0,
    });
    for (const c of cloudRows(probe)) {
      expect(c.where).toBe("cloud");
      expect(c.model).toBe(CLOUD_MODELS[c.capability as CloudCapability].label);
      expect(c.note).toBeNull();
    }
    expect(plan(probe, "listening").candidates[4].reason).toMatch(
      /No NVIDIA GPU or Apple silicon/,
    );
  });

  it("downloads nothing when the disk is nearly full", () => {
    const probe = mac(128, 12);
    const result = planMachine(probe);
    expect(result.diskBudgetGb).toBe(12 - DISK_RESERVE_GB);
    expect(cloudRows(probe).every((c) => c.where === "cloud")).toBe(true);
    const instruct = plan(probe, "listening").candidates[1];
    expect(instruct.reason).toMatch(
      /Fits in memory, but the 70.52 GB download/,
    );
    // With room for the small download only, the upscaler comes back.
    expect(where(mac(128, 15)).upscaler).toBe("SeedVR2 3B (FP8)");
  });

  it("plans nothing locally when the free disk could not be read", () => {
    const probe = { ...mac(128), disk: null };
    expect(cloudRows(probe).every((c) => c.where === "cloud")).toBe(true);
    expect(plan(probe, "listening").candidates[1].reason).toMatch(
      /free disk could not be read/,
    );
  });

  it("never plans an undocumented model locally, however large the machine", () => {
    const huge = [mac(512), linux(512, 97887, 5000)];
    for (const probe of huge)
      for (const c of cloudRows(probe))
        for (const candidate of c.candidates)
          if (candidate.memoryGb === null) expect(candidate.fits).toBe(false);
    expect(where(huge[0]).ltx).toBe("cloud");
    expect(where(huge[1]).vision).toBe("cloud");
    expect(where(huge[1]).listening).toBe("Qwen3-Omni-30B-A3B-Instruct");
  });

  it("uses the largest NVIDIA GPU, and warns when its memory is busy", () => {
    const probe = linux(32, 8192);
    probe.nvidia!.gpus.push({
      name: "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
      vramBytes: 97887 * 1024 ** 2,
      freeVramBytes: 5 * 1e9,
    });
    probe.nvidia!.gpus[0].freeVramBytes = 4 * 1e9;
    const listening = plan(probe, "listening");
    expect(listening.model).toBe("Qwen3-Omni-30B-A3B-Instruct");
    expect(listening.note).toMatch(/Only 5 GB is free right now/);
  });

  it("is pure: the same probe gives the same plan, and the run location's words", () => {
    const probe = linux(64, 32607);
    expect(planMachine(probe)).toEqual(planMachine(structuredClone(probe)));
    for (const c of planMachine(probe).capabilities)
      if (["klein", "ltx", "upscaler"].includes(c.capability))
        expect(["local", "cloud"]).toContain(c.where);
    expect(summarisePlan(planMachine(probe))).toEqual([
      "Transcription (voice mode): Qwen3-ASR-0.6B (CPU), on this machine.",
      "Listening (describing music and sound): Voxtral Mini 3B, on this machine.",
      "Vision (reading images and frames): Qwen3-VL through core TextGenerate, on Comfy Cloud.",
      "FLUX 3 Image Klein (stills and box edits): FLUX 3 Image Klein (ComfyUI int8), on this machine.",
      "LTX-2.5 (video): LTX-2.5 22B distilled int8, on Comfy Cloud.",
      "Upscaler (open video upscale): SeedVR2 3B (FP8), on this machine.",
    ]);
  });

  it("counts a quarter of unified memory out for macOS and the studio", () => {
    expect(UNIFIED_SHARE).toBe(0.75);
    expect(planMachine(mac(64)).memoryBudgetGb).toBe(
      Math.round(64 * 1024 ** 3 * UNIFIED_SHARE * 1e-7) / 100,
    );
  });
});

describe("the transcription row", () => {
  it("is voice mode's Qwen3-ASR on this machine: Metal on a Mac, the CPU elsewhere", () => {
    for (const [probe, device] of [
      [mac(16, 500, "Apple M2"), "Metal"],
      [linux(64, 32607), "CPU"],
      [linux(8), "CPU"],
    ] as const) {
      const row = plan(probe, "transcription");
      expect(row).toMatchObject({
        where: "local",
        model: `Qwen3-ASR-0.6B (${device})`,
        fallback: null,
        hosted: null,
      });
      expect(row.candidates).toEqual([
        expect.objectContaining({ memoryGb: null, diskGb: 1.88, fits: true }),
      ]);
      expect(row.reason).toMatch(/No documented memory figure/);
      expect(row.note).toMatch(/hosted studio has no voice route/);
    }
    // It comes first, apart from listening.
    expect(planMachine(mac(32)).capabilities[0].capability).toBe(
      "transcription",
    );
  });

  it("stays local on a full disk, and says the download may not fit", () => {
    const row = plan(mac(16, 11), "transcription");
    expect(row.where).toBe("local");
    expect(row.candidates[0].fits).toBe(false);
    expect(row.note).toMatch(
      /1.88 GB download needs more than the 1 GB free after the reserve, unless voice mode is installed already/,
    );
  });

  it("uses the download voice mode pins", async () => {
    const { MODEL_BYTES, VOICE_MODEL } = await import("../server/voice-model");
    expect(TRANSCRIPTION_MODEL.label).toBe(VOICE_MODEL);
    expect(TRANSCRIPTION_MODEL.diskGb).toBe(
      Math.round(MODEL_BYTES / 1e7) / 100,
    );
    expect(TRANSCRIPTION_MODEL.memoryGb).toBeNull();
  });
});

describe("the documented requirements", () => {
  it("cite a source for every model and a Cloud model for every capability", () => {
    for (const model of LOCAL_MODELS) {
      expect(model.sources.length, model.id).toBeGreaterThan(0);
      for (const source of model.sources)
        expect(source, model.id).toMatch(/^https:\/\//);
      expect(model.memoryNote.length, model.id).toBeGreaterThan(20);
      expect(model.diskGb, model.id).toBeGreaterThan(0);
    }
    for (const capability of CAPABILITIES) {
      if (capability === "transcription") continue;
      expect(CLOUD_MODELS[capability].source).toBe(
        "docs/comfy-cloud-inventory.md",
      );
      expect(
        LOCAL_MODELS.some((m) => m.capability === capability),
        capability,
      ).toBe(true);
    }
  });

  it("list the listening models largest first, as issue #12 decided", () => {
    expect(
      LOCAL_MODELS.filter((m) => m.capability === "listening").map((m) => m.id),
    ).toEqual([
      "qwen3-omni-30b-a3b-captioner",
      "qwen3-omni-30b-a3b-instruct",
      "voxtral-small-24b-2507",
      "qwen2-5-omni-7b",
      "voxtral-mini-3b-2507",
    ]);
  });
});

describe("reading a probe", () => {
  it("keeps only the known fields", () => {
    const probe = {
      ...mac(32),
      hostname: "someones-mac",
      user: "someone",
      path: "/Users/someone/.local",
    };
    const read = readMachineProbe(probe);
    expect(read).toEqual(mac(32));
    expect(JSON.stringify(read)).not.toMatch(/someone|Users/);
  });

  it("refuses names and sizes of the wrong form", () => {
    const bad: unknown[] = [
      null,
      [],
      { ...mac(32), version: 2 },
      { ...mac(32), apple: { chip: "/Users/someone", unifiedMemoryBytes: 1 } },
      { ...mac(32), memory: { totalBytes: -1, availableBytes: null } },
      { ...mac(32), memory: { totalBytes: 1.5, availableBytes: null } },
      { ...mac(32), platform: "beos" },
      { ...mac(32), unread: ["hostname"] },
      { ...mac(32), probedAt: "yesterday" },
      {
        ...linux(8, 8192),
        nvidia: {
          driver: "1",
          gpus: [{ name: "GPU\n", vramBytes: 1, freeVramBytes: null }],
        },
      },
    ];
    for (const value of bad)
      expect(() => readMachineProbe(value), JSON.stringify(value)).toThrow(
        /The machine check answered an invalid/,
      );
  });
});
