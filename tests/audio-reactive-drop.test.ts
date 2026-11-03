import { readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUSTED_RECIPES } from "../shared/director/graphic-commands";
import {
  audioReactiveDrop,
  DROP_ROOMS,
} from "../shared/templates/audio-reactive-drop";
import { findMixTemplate } from "../shared/templates/catalogue";
import {
  beatFrame,
  checkMix,
  mixFrames,
  mixProject,
} from "../shared/templates/mix";
import validators from "../src/director/generated-validators.mjs";

const mix = audioReactiveDrop.mix!;
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
const DIR = "public/media/director-templates/audio-reactive-drop";
const frames = (seconds: number) => Math.round(seconds * cut.fps);

describe("Audio Reactive Drop, the 3D + LTX template v2", () => {
  it("is a mix template the Director opens", () => {
    expect(findMixTemplate("audio-reactive-drop")).toBe(audioReactiveDrop);
    expect(audioReactiveDrop).toMatchObject({
      name: "Audio Reactive Drop",
      run: "mix",
      tier: "open",
    });
    expect(audioReactiveDrop.description).toMatch(/LTX-2\.5 \(open weights\)/);
  });

  it("cuts five rooms on the phrases, each its own shot over its own file", () => {
    expect(() => checkMix(cut, media())).not.toThrow();
    expect(cut).toMatchObject({ fps: 24, width: 1920, height: 1080 });
    // Double time: eighth notes of the track's 136.8 BPM.
    expect(cut.bpm).toBeCloseTo(273.6, 6);
    expect(mixFrames(cut)).toBe(776);
    expect(cut.shots.map((s) => s.asset)).toEqual(
      DROP_ROOMS.map((r) => r.asset),
    );
    // On the phrases 0 / 7.21 / 14.245 / 21.29 / 28.33 s, within a frame.
    const starts = cut.shots.map((s) => beatFrame(cut, s.startBeat));
    expect(starts).toEqual([0, 174, 342, 511, 679]);
    for (const [i, p] of [0, 7.21, 14.245, 21.29, 28.33].entries())
      expect(Math.abs(starts[i] - p * cut.fps)).toBeLessThanOrEqual(1);
    for (const [i, s] of cut.shots.entries()) {
      expect(s.sourceSeconds).toBe(0);
      expect(s.cropY).toBeNull();
      // Each room file holds exactly its shot, so a swap needs no re-timing.
      const end = i + 1 < starts.length ? starts[i + 1] : 776;
      expect(frames(mix.media[s.asset].durationSeconds)).toBe(end - starts[i]);
    }
    expect(cut.track.asset).toBe("drop-track");
    expect(
      frames(mix.media["drop-track"].durationSeconds),
    ).toBeGreaterThanOrEqual(776);
    const project = mixProject(
      cut,
      audioReactiveDrop.name,
      media(),
      TRUSTED_RECIPES,
    );
    expect(project.composition.durationFrames).toBe(776);
    expect(project.layers.filter((l) => l.kind === "video")).toHaveLength(5);
  });

  it("keeps the hologram a swap: the plain pyramid rooms are listed, unused", () => {
    const used = new Set(cut.shots.map((s) => s.asset));
    for (const id of [
      "drop-pyramid-inside-plain",
      "drop-pyramid-outside-plain",
    ]) {
      expect(mix.media[id].kind).toBe("video");
      expect(used.has(id)).toBe(false);
      expect(mix.media[id].durationSeconds).toBe(
        mix.media[id.replace("-plain", "")].durationSeconds,
      );
    }
  });

  it("uses only trusted recipes, each layer valid and its own", () => {
    const ids = cut.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const layer of cut.layers) {
      expect(TRUSTED_RECIPES[layer.module], layer.id).toBeDefined();
      expect(validate(layer.module, layer.parameters), layer.id).toBe(true);
    }
    // A HUD per room, a sweep and a glitch into every room after the first.
    expect(ids.filter((id) => id.startsWith("hud-"))).toHaveLength(5);
    expect(ids.filter((id) => /^glitch-\d$/.test(id))).toHaveLength(4);
    expect(ids.filter((id) => /^wire-\d$/.test(id))).toHaveLength(4);
    const title = cut.layers.find((l) => l.id === "title-0")!;
    expect(title).toMatchObject({ startBeat: 5, beats: 28 });
    expect(title.parameters.duration).toBe(4);
    // The studio readout runs four track beats (eight on the grid).
    expect(cut.layers.find((l) => l.id === "caption-5")).toMatchObject({
      module: "build-panel",
      beats: 8,
    });
    // The ending is the singer with the credit traced in beside her, no still.
    expect(cut.layers.some((l) => l.module === "end-card-still")).toBe(false);
    const end = cut.layers.find((l) => l.id === "end-title")!;
    expect(end).toMatchObject({ module: "gen-title", lane: "cards" });
    expect(end.beats).toBeCloseTo(10.4, 6);
    expect(end.startBeat + end.beats).toBeCloseTo(cut.beats, 6);
    expect(end.parameters).toMatchObject({
      text: "REACTIVE SPACES",
      mode: "trace-texts",
      // gen-title's x is the text's centre: at 0.2 the title clipped.
      x: 0.31,
      y: 0.3,
      size: 46,
      plate: 0.3,
    });
    expect(ids).toHaveLength(24);
  });

  it("ends on the original take's singer, with the booth kept as a swap", () => {
    const studio = cut.shots.at(-1)!;
    expect(studio.asset).toBe("drop-studio");
    expect(frames(mix.media["drop-studio"].durationSeconds)).toBe(97);
    expect(mix.media["drop-studio-booth"].durationSeconds).toBe(
      mix.media["drop-studio"].durationSeconds,
    );
    expect(cut.shots.some((s) => s.asset === "drop-studio-booth")).toBe(false);
  });

  it("keeps the bundled media within the Pages limits", () => {
    let total = 0;
    for (const name of readdirSync(DIR)) {
      const size = statSync(`${DIR}/${name}`).size;
      expect(size, name).toBeLessThan(25 * 1024 * 1024);
      expect(name).toMatch(/^drop-[a-z0-9-]+\.(mp4|mp3|jpg)$/);
      total += size;
    }
    for (const m of Object.values(mix.media))
      expect(statSync(`public${m.url}`).isFile()).toBe(true);
    expect(total).toBeLessThan(150 * 1024 * 1024);
  });
});
