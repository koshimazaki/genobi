import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import { assertWalkEdit } from "../src/world-builder/walk-edits";
import {
  RECENT_AUDIO,
  RECENT_AUDIO_BYTES,
  audioChoices,
  audioLabel,
  droppedAudio,
  remember,
  type RecentAudio,
} from "../src/world-builder/audio-history";
import { projectAudio } from "../src/world-builder/project-audio";
import { PanelBody } from "../src/world-builder/BuilderInspector";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import type { BuilderAssets } from "../src/world-builder/useBuilderAssets";
import type { Bundle } from "../src/director/bundle";
import { hostMessages } from "../src/world-builder/host-messages";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";

const entry = (id: string, bytes = 10, label = id): RecentAudio => ({
  id,
  label,
  source: "file",
  bytes,
  open: () => new Blob(),
});

describe("World Builder sound in every mode", () => {
  const walking = { ...presetRecipe("Playground"), avatar: true };

  it("lets Walk change the track and its routing, not the set", () => {
    const sound = validateRecipe({
      ...walking,
      envelope: [0.2, 0.8],
      bandEnvelopes: { low: [0.1], mid: [0.2], high: [0.3] },
      audioBand: "low",
      audioTarget: "light",
      audioGain: 4,
      audioGate: 0.3,
      audioInvert: true,
    });
    expect(() => assertWalkEdit(walking, sound)).not.toThrow();
    // Clear audio is an envelope edit too.
    expect(() =>
      assertWalkEdit(sound, { ...sound, envelope: [] }),
    ).not.toThrow();
    expect(() => assertWalkEdit(walking, { ...walking, light: 0.5 })).toThrow(
      "Return to Shot camera",
    );
    expect(() =>
      assertWalkEdit(walking, { ...walking, avatar: false }),
    ).toThrow("Choose a character");
  });

  function inspector(mode: "shot" | "edit" | "walk", patch = {}) {
    const s = {
      ready: true,
      busy: false,
      playing: false,
      recipe: walking,
      frame: 0,
      audioURL: "",
      audioName: "",
      inputState: { phase: "idle", frame: 0 },
      example: { blob: null, label: "", credit: "" },
      history: { recent: [entry("a", 2048, "Voice take")], persisted: true },
      take: null,
      capturing: false,
      progress: 0,
      json: "",
      ...patch,
    } as unknown as BuilderSession;
    const e = { mode, selected: "" } as unknown as WorldEditor;
    const a = { saving: "", result: "" } as unknown as BuilderAssets;
    const html = renderToStaticMarkup(
      <PanelBody panel="audio" s={s} e={e} a={a} />,
    );
    return html.match(/<fieldset(?![^>]*hidden)[^>]*>/)?.[0] ?? "";
  }

  afterEach(() => vi.unstubAllGlobals());
  it("keeps the Sound tab enabled in Shot, Build and Walk", () => {
    const page: { parent?: unknown } = {};
    page.parent = page;
    vi.stubGlobal("window", page);
    for (const mode of ["shot", "edit", "walk"] as const)
      expect(inspector(mode)).not.toMatch(/disabled/);
    expect(inspector("walk", { busy: true })).toMatch(/disabled/);
  });
});

describe("Recent audio", () => {
  it("lists a track once, newest first, within the count and bytes", () => {
    let list: RecentAudio[] = [];
    for (const id of ["a", "b", "c", "a"]) list = remember(list, entry(id));
    expect(list.map((x) => x.id)).toEqual(["a", "c", "b"]);
    for (let i = 0; i < 10; i++) list = remember(list, entry(`n${i}`));
    expect(list).toHaveLength(RECENT_AUDIO);
    const big = remember(
      remember([], entry("old", RECENT_AUDIO_BYTES - 5)),
      entry("new", 10),
    );
    expect(big.map((x) => x.id)).toEqual(["new"]);
  });

  it("strips control characters from names and falls back by source", () => {
    expect(audioLabel("voice\x00\x1f\x7f.wav", "file")).toBe("voice.wav");
    expect(audioLabel("", "comfy")).toBe("Comfy Inputs audio");
    expect(audioLabel("x".repeat(200), "drop")).toHaveLength(80);
  });

  it("takes the first audio file of a drop, by type or extension", () => {
    const image = new File([""], "frame.png", { type: "image/png" });
    const untyped = new File([""], "Voice.FLAC");
    expect(droppedAudio([image])).toBeNull();
    expect(droppedAudio([image, untyped])).toBe(untyped);
    const mp3 = new File([""], "a.bin", { type: "audio/mpeg" });
    expect(droppedAudio([mp3])).toBe(mp3);
  });

  it("adds the project's audio after the session's, without repeats", () => {
    const bundle = {
      project: {
        assets: {
          song: {
            kind: "audio",
            use: "production",
            file: { path: "assets/aa.wav", sha256: "aa" },
            origin: "uploaded",
          },
          still: {
            kind: "image",
            use: "reference",
            file: { path: "assets/bb.png", sha256: "bb" },
            origin: "uploaded",
          },
          voice: {
            kind: "audio",
            use: "production",
            file: { path: "assets/cc.wav", sha256: "cc" },
            origin: "generated",
          },
        },
        layers: [{ id: "l1", kind: "audio", assetId: "voice", name: "VO 1" }],
      },
      files: new Map([
        ["assets/aa.wav", new Uint8Array(4)],
        ["assets/bb.png", new Uint8Array(4)],
        ["assets/cc.wav", new Uint8Array(8)],
      ]),
    } as unknown as Bundle;
    const project = projectAudio(bundle);
    expect(project.map((x) => [x.id, x.label, x.bytes])).toEqual([
      ["cc", "VO 1", 8],
      ["aa", "aa.wav", 4],
    ]);
    expect(project[0].open().size).toBe(8);
    expect(projectAudio(null)).toEqual([]);
    const choices = audioChoices([entry("aa", 4, "Song")], project);
    expect(choices.map((x) => x.label)).toEqual(["Song", "VO 1"]);
  });
});

describe("Comfy's recent audio", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("lists an offered track without loading it, from the exact host only", async () => {
    vi.stubGlobal("location", { origin: "http://127.0.0.1:8188" });
    const comfy = {} as Window;
    const loaded: string[] = [],
      listed: unknown[][] = [];
    const listen = hostMessages({
      host: () => comfy,
      adapter: {} as SceneAdapter,
      loadAudio: async (_blob, source) => void loaded.push(source),
      rememberAudio: (_blob, source, label) => listed.push([source, label]),
      fail: (e) => {
        throw e;
      },
    });
    const blob = new Blob([new Uint8Array(4)], { type: "audio/flac" });
    const message = (data: unknown, source = comfy, origin = location.origin) =>
      listen({ data, source, origin } as unknown as MessageEvent);
    message({
      type: "director:recent-audio",
      blob,
      name: "ComfyUI_0001_.flac",
    });
    message({ type: "director:recent-audio", blob }, {} as Window);
    message({ type: "director:recent-audio", blob }, comfy, "https://x.test");
    message({ type: "director:recent-audio", blob: "not a blob" });
    await Promise.resolve();
    expect(listed).toEqual([["comfy", "ComfyUI_0001_.flac"]]);
    expect(loaded).toEqual([]);
    message({ type: "director:audio", blob });
    await Promise.resolve();
    expect(loaded).toEqual(["comfy"]);
  });
});
