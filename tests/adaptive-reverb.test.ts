import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import akuspace from "../shared/akuspace-presets.json";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import {
  adaptiveReverb,
  REVERB_ROUTE,
  REVERB_WORKFLOW_STILL,
} from "../shared/templates/adaptive-reverb";
import { findMixTemplate } from "../shared/templates/catalogue";
import { checkMix, mixFrames, mixProject } from "../shared/templates/mix";
import validators from "../src/director/generated-validators.mjs";

const mix = adaptiveReverb.mix!;
const cut = mix.cut;
const media = () =>
  Object.fromEntries(
    Object.entries(mix.media).map(([id, m]) => [
      id,
      { ...m, sha256: "0".repeat(64) },
    ]),
  );
const validate = (moduleId: string, parameters: unknown) =>
  validators[`module_${TRUSTED_RECIPES[moduleId].file.sha256}`](parameters);
const DIR = "public/media/director-templates/adaptive-reverb";

describe("Adaptive reverb, the 3D + LTX template", () => {
  it("is a mix template the Director opens", () => {
    expect(findMixTemplate("adaptive-reverb")).toBe(adaptiveReverb);
    expect(adaptiveReverb).toMatchObject({
      name: "Adaptive reverb",
      run: "mix",
      tier: "open",
    });
    expect(adaptiveReverb.description).toMatch(/World Builder 3D rooms/);
    expect(adaptiveReverb.description).toMatch(/LTX-2\.5 \(open weights\)/);
    expect(adaptiveReverb.description).toContain("scene-derived CPU reverb");
    expect(adaptiveReverb.description).toContain(
      "AKUSPACE is a separate experiment",
    );
    expect(cut.trackName).toContain("CPU reverb");
    expect(REVERB_ROUTE.workflow).toBe(
      "workflows/world-builder-adaptive-reverb-cpu.json",
    );
  });

  it("plays the whole take at its native size, over its own sound", () => {
    expect(() => checkMix(cut, media())).not.toThrow();
    expect(cut).toMatchObject({ fps: 24, width: 1280, height: 720 });
    // One take, its slices end to end in source time: nothing is cut out.
    expect(new Set(cut.shots.map((s) => s.asset))).toEqual(
      new Set(["reverb-ltx"]),
    );
    for (const s of cut.shots)
      expect(s.sourceSeconds).toBeCloseTo((s.startBeat * 60) / cut.bpm, 6);
    // The cut runs to within a quarter second of the take's end.
    expect(mixFrames(cut)).toBe(726);
    expect(mixFrames(cut)).toBeLessThanOrEqual(
      Math.round(mix.media["reverb-ltx"].durationSeconds * cut.fps),
    );
    expect(cut.track.asset).toBe("reverb-track");
    const project = mixProject(
      cut,
      adaptiveReverb.name,
      media(),
      TRUSTED_RECIPES,
    );
    expect(project.composition.durationFrames).toBe(726);
    const end = cut.layers.find((l) => l.module === "end-card-still")!;
    expect(end.startBeat + end.beats).toBe(cut.beats);
    expect(end.parameters).toMatchObject({
      title: "ADAPTIVE REVERB",
      subtitle: "LTX-2.5 · OPEN WEIGHTS",
      credit1: "SCENE-DERIVED CPU REVERB",
    });
  });

  it("uses only trusted recipes, each layer valid", () => {
    for (const layer of cut.layers) {
      expect(TRUSTED_RECIPES[layer.module], layer.id).toBeDefined();
      expect(validate(layer.module, layer.parameters), layer.id).toBe(true);
    }
    const diagram = cut.layers.find((l) => l.module === "space-hud")!;
    expect(diagram.parameters.still).toBe(REVERB_WORKFLOW_STILL);
  });

  it("reads each room's RT60 from the AKUSPACE presets, never invents one", () => {
    const presets = akuspace.presets as Record<
      string,
      { estimated_rt60: number }
    >;
    const text = JSON.stringify(cut.layers);
    for (const room of REVERB_ROUTE.rooms) {
      expect(presets[room.preset].estimated_rt60).toBe(room.rt60);
      expect(text).toContain(`RT60 ~${room.rt60} S`);
      expect(statSync(room.set).isFile()).toBe(true);
    }
    expect(statSync(REVERB_ROUTE.workflow).isFile()).toBe(true);
    expect(statSync(REVERB_ROUTE.layoutWorkflow).isFile()).toBe(true);
  });

  it("keeps the bundled media within the Pages and project limits", () => {
    let total = 0;
    for (const name of readdirSync(DIR)) {
      const size = statSync(`${DIR}/${name}`).size;
      expect(size, name).toBeLessThan(25 * 1024 * 1024);
      expect(name).toMatch(/^reverb-[a-z0-9-]+\.(mp4|mp3|jpg)$/);
      total += size;
    }
    expect(total).toBeLessThan(150 * 1024 * 1024);
  });
});
