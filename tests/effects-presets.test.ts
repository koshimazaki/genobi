import { describe, expect, it } from "vitest";
import { applyCommand, parseCommand } from "../shared/director/commands";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import type { Project } from "../shared/director/types";
import {
  applyEffectPreset,
  createEffectVariant,
  effectFingerprint,
  effectParameters,
  inspectEffectPreset,
  listEffectPresets,
  parseEffectVariantJson,
  readEffectVariant,
} from "../shared/effects";
import { validateProject } from "../src/director/validate";

function project(): Project {
  return {
    schemaVersion: "director.bundle.v1",
    id: "effects-test",
    name: "Effects test",
    revision: 1,
    composition: {
      width: 960,
      height: 540,
      fps: 24,
      durationFrames: 240,
      colorSpace: "srgb",
      alpha: "straight",
      background: "#161616",
    },
    assets: {
      picture: {
        kind: "image",
        use: "production",
        origin: "uploaded",
        file: { path: "picture.png", sha256: "a".repeat(64) },
      },
    },
    modules: {},
    layers: [
      {
        id: "picture",
        name: "Picture",
        kind: "image",
        assetId: "picture",
        startFrame: 0,
        durationFrames: 240,
        locked: false,
        fit: "contain",
        opacity: 1,
        position: { x: 0, y: 0 },
        scale: 1,
        rotationDegrees: 0,
      },
    ],
    generations: [],
    generationPlans: [],
  };
}
const input = (presetId = "poster-window") => ({
  presetId,
  instanceId: "effect-a",
  expectedRevision: 1,
  startFrame: 24,
  durationFrames: 96,
});

describe("configurable effects catalogue", () => {
  it("exposes four distinct editable treatments without mutable shared defaults", () => {
    const presets = listEffectPresets();
    expect(presets.map((p) => p.id)).toEqual([
      "poster-window",
      "cinematic-scan",
      "kinetic-title",
      "liquid-mirror",
    ]);
    presets[0].defaults.mix = 0;
    presets[0].controls[0].label = "Changed";
    const poster = inspectEffectPreset("poster-window");
    expect(poster.defaults.mix).toBe(0.64);
    expect(poster.controls[0].label).toBe("Mix");
    expect(poster.note).toMatch(/does not offset source time/);
    expect(inspectEffectPreset("liquid-mirror").note).toMatch(
      /not a fluid simulation/,
    );
  });
  it("rejects invalid controls and arbitrary source fields", () => {
    const poster = inspectEffectPreset("poster-window");
    for (const values of [
      { mix: NaN },
      { mix: Infinity },
      { mix: -1 },
      { levels: 2.5 },
      { levels: 9 },
      { accent: "red" },
      { source: "alert(1)" },
    ])
      expect(() => effectParameters(poster, values)).toThrow();
    expect(() =>
      effectParameters(inspectEffectPreset("kinetic-title"), { text: "A\nB" }),
    ).toThrow(/control characters/);
    expect(effectParameters(poster, { mix: 0 }).mix).toBe(0);
  });
  it("roundtrips a complete variant with pinned module identity and stable settings fingerprint", () => {
    const variant = createEffectVariant("poster-window", "Quiet ink", {
      mix: 0.2,
      accent: "#cc0000",
    });
    expect(parseEffectVariantJson(JSON.stringify(variant))).toEqual(variant);
    const reversed = Object.fromEntries(
      Object.entries(variant.parameters).reverse(),
    );
    expect(effectFingerprint(variant.presetId, reversed)).toBe(
      effectFingerprint(variant.presetId, variant.parameters),
    );
    for (const changed of [
      { ...variant, source: "export default () => {}" },
      { ...variant, presetVersion: 2 },
      { ...variant, moduleHashes: { "effects-poster-window": "b".repeat(64) } },
      { ...variant, parameters: { mix: 0.2 } },
    ])
      expect(() => readEffectVariant(changed)).toThrow();
    expect(() => parseEffectVariantJson(" ".repeat(16385))).toThrow(
      /too large/,
    );
    expect(() => parseEffectVariantJson(`"${"界".repeat(6000)}"`)).toThrow(
      /too large/,
    );
  });
});

describe("one atomic editable preset insertion", () => {
  it("keeps scan below its clean HUD, one revision, fresh independent layer ids and original untouched", () => {
    const before = project();
    const snapshot = JSON.stringify(before);
    const result = applyEffectPreset(before, input("cinematic-scan"));
    validateProject(result.project);
    expect(result.layerIds).toEqual(["effect-a-scan", "effect-a-hud"]);
    expect(result.project.layers.slice(-2).map((l) => l.kind)).toEqual([
      "filter",
      "graphics",
    ]);
    expect(
      result.project.layers
        .slice(-2)
        .every(
          (l) =>
            l.startFrame === 24 &&
            l.durationFrames === 96 &&
            !l.locked &&
            !l.track,
        ),
    ).toBe(true);
    expect(result.project.revision).toBe(2);
    expect(JSON.stringify(before)).toBe(snapshot);
    const second = applyEffectPreset(result.project, {
      ...input("cinematic-scan"),
      expectedRevision: 2,
      instanceId: "effect-b",
    });
    expect(second.layerIds.every((id) => !result.layerIds.includes(id))).toBe(
      true,
    );
    expect(second.project.layers).toHaveLength(5);
    expect(() =>
      applyEffectPreset(result.project, {
        ...input("cinematic-scan"),
        expectedRevision: 2,
      }),
    ).toThrow(/already used/);
  });
  it("reuses a saved variant in another project and applies only explicit overrides", () => {
    const variant = createEffectVariant("poster-window", "My poster", {
      mix: 0.11,
      jitter: 0.8,
    });
    const other = project();
    other.id = "another-project";
    const result = applyEffectPreset(other, {
      ...input(),
      variant,
      parameters: { accent: "#ffffff" },
    });
    expect(result.project.layers.at(-1)).toMatchObject({
      parameters: { mix: 0.11, jitter: 0.8, accent: "#ffffff" },
    });
    const replacement = {
      ...other,
      assets: {
        picture: {
          ...other.assets.picture,
          file: { path: "replacement.png", sha256: "c".repeat(64) },
        },
      },
    };
    expect(
      applyEffectPreset(replacement, { ...input(), variant }).project.assets
        .picture.file.path,
    ).toBe("replacement.png");
  });
  it("rejects stale revisions, overflow, forged modules and conflicting media paths before any edit", () => {
    const p = project();
    expect(() =>
      applyEffectPreset(p, { ...input(), expectedRevision: 2 }),
    ).toThrow(/Project changed/);
    expect(() =>
      applyEffectPreset(p, { ...input(), durationFrames: 240 }),
    ).toThrow(/beyond/);
    p.modules["effects-poster-window"] = {
      ...TRUSTED_RECIPES["effects-poster-window"],
      engineVersion: "unknown",
    };
    expect(() => applyEffectPreset(p, input())).toThrow(/module changed/);
    p.modules = {};
    p.assets.picture.file.path =
      TRUSTED_RECIPES["effects-poster-window"].file.path;
    expect(() => applyEffectPreset(p, input())).toThrow(/another file/);
    expect(p.revision).toBe(1);
    expect(p.layers).toHaveLength(1);
  });
  it("requires continuous visible picture coverage but allows authored cuts", () => {
    const p = project();
    p.layers = [];
    expect(() => applyEffectPreset(p, input())).toThrow(/full duration/);
    expect(
      applyEffectPreset(p, input("kinetic-title")).project.layers,
    ).toHaveLength(1);
    p.layers = project().layers;
    p.layers[0].durationFrames = 60;
    p.layers.push({
      ...p.layers[0],
      id: "next-picture",
      startFrame: 60,
      durationFrames: 60,
    });
    expect(() => applyEffectPreset(p, input())).not.toThrow();
    expect(() =>
      applyEffectPreset(p, { ...input(), sourceLayerId: "picture" }),
    ).toThrow(/full duration/);
    p.layers[1].startFrame = 61;
    expect(() => applyEffectPreset(p, input())).toThrow(/full duration/);
    p.layers[1].startFrame = 60;
    p.layers[1].muted = true;
    expect(() => applyEffectPreset(p, input())).toThrow(/full duration/);
  });
  it("shares strict parsing and application with Director commands", () => {
    const command = { op: "apply-effect-preset", ...input("cinematic-scan") };
    expect(parseCommand(command)).toEqual(command);
    expect(() => parseCommand({ ...command, source: "script" })).toThrow(
      /does not take/,
    );
    expect(() => parseCommand({ ...command, instanceId: "../escape" })).toThrow(
      /instanceId/,
    );
    const from = project();
    const result = applyCommand(
      { project: from, prompt: "Keep my brief" },
      command,
    );
    expect(result).toMatchObject({
      ok: true,
      copy: { prompt: "Keep my brief", project: { revision: 2 } },
    });
    if (result.ok)
      expect(result.copy.project).toEqual(
        applyEffectPreset(from, input("cinematic-scan")).project,
      );
  });
});
