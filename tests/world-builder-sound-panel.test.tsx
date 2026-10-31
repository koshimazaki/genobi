import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { presetRecipe } from "../src/world-builder/recipe";
import {
  RECENT_AUDIO_DRAG,
  type RecentAudio,
} from "../src/world-builder/audio-history";
import { loadAndPlay } from "../src/world-builder/sound-autoplay";
import { dropOnScene } from "../src/world-builder/sound-drop";
import { PanelBody } from "../src/world-builder/BuilderInspector";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import type { BuilderAssets } from "../src/world-builder/useBuilderAssets";
import { liveAnalyser } from "../src/world-builder/audio-analyser";

const flush = () => new Promise((done) => setTimeout(done, 0));

/** A session that records what a load did, and fails a load on request. */
function fakeSession(fail = false) {
  const calls: string[] = [];
  const errors: unknown[] = [];
  const s = {
    history: { recent: [] as RecentAudio[] },
    run(work: () => Promise<unknown>) {
      void work().catch((e) => errors.push(e));
    },
    async loadAudio(_blob: Blob, source: string, label?: string) {
      await flush();
      if (fail) throw new Error("Could not decode.");
      calls.push(`load:${source}${label ? `:${label}` : ""}`);
    },
    setPlaying(value: boolean) {
      calls.push(`play:${value}`);
    },
  };
  return { s, calls, errors };
}

describe("Sound autoplay", () => {
  it("plays a track a person loads, once it has loaded", async () => {
    const { s, calls } = fakeSession();
    loadAndPlay(s, new Blob(["x"]), "file");
    expect(calls).toEqual([]);
    await flush();
    await flush();
    expect(calls).toEqual(["load:file", "play:true"]);
  });

  it("does not play when the track fails to load", async () => {
    const { s, calls, errors } = fakeSession(true);
    loadAndPlay(s, new Blob(["x"]), "drop");
    await flush();
    await flush();
    expect(calls).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it("plays a dropped file and a dragged recent row, not other drops", async () => {
    const { s, calls, errors } = fakeSession();
    const row: RecentAudio = {
      id: "f".repeat(64),
      label: "Kick loop",
      source: "agent",
      bytes: 4,
      open: () => new Blob(["abcd"]),
    };
    s.history.recent = [row];
    let revealed = 0;
    const drop = dropOnScene(s, [], () => revealed++);
    const event = (data: Record<string, string>, files: File[] = []) => ({
      preventDefault() {},
      stopPropagation() {},
      dataTransfer: {
        types: [...Object.keys(data), ...(files.length ? ["Files"] : [])],
        files,
        getData: (type: string) => data[type] ?? "",
      },
    });
    const wav = new File(["x"], "take.wav", { type: "audio/wav" });
    drop.onDrop(event({}, [wav]) as never);
    drop.onDrop(event({ [RECENT_AUDIO_DRAG]: row.id }) as never);
    drop.onDrop(
      event({}, [new File([""], "a.png", { type: "image/png" })]) as never,
    );
    await flush();
    await flush();
    expect(calls).toEqual([
      "load:drop",
      "play:true",
      "load:agent:Kick loop",
      "play:true",
    ]);
    expect(errors).toHaveLength(1);
    expect(revealed).toBe(3);
  });

  it("leaves an agent's setAudio and Comfy-sent audio silent", () => {
    // Both call the session's own loader; only a person's pick goes through
    // loadAndPlay, which is the one place Play is started after a load.
    const session = readFileSync(
      "src/world-builder/useBuilderSession.ts",
      "utf8",
    );
    expect(session).toContain('setAudio: (blob) => loadAudio(blob, "agent")');
    expect(session).not.toContain("loadAndPlay");
    expect(session).not.toMatch(/loadAudio[^\n]*setPlaying\(true\)/);
    const host = readFileSync("src/world-builder/host-messages.ts", "utf8");
    expect(host).not.toMatch(/setPlaying|loadAndPlay/);
  });
});

describe("Sound panel layout", () => {
  afterEach(() => vi.unstubAllGlobals());
  function panel(folded = false, patch = {}) {
    const s = {
      ready: true,
      busy: false,
      playing: false,
      recipe: presetRecipe("Playground"),
      frame: 0,
      audioURL: "blob:track",
      audioName: "Voice take",
      example: { blob: null, label: "", credit: "" },
      history: { recent: [], persisted: true },
      audioElement: { current: null },
      ...patch,
    } as unknown as BuilderSession;
    const e = { mode: "shot", selected: "" } as unknown as WorldEditor;
    const a = {} as BuilderAssets;
    return renderToStaticMarkup(
      <PanelBody panel="audio" folded={folded} s={s} e={e} a={a} />,
    );
  }

  it("puts editable audio response before optional diagnostic scopes", () => {
    const html = panel();
    const at = (text: string) => html.indexOf(text);
    expect(at('aria-label="Play"')).toBeGreaterThan(-1);
    expect(at("wb-meter-strip")).toBeGreaterThan(at('aria-label="Play"'));
    expect(at('aria-label="Audio file"')).toBeGreaterThan(at("wb-meter-strip"));
    expect(at('aria-label="Recent audio"')).toBeGreaterThan(
      at('aria-label="Audio file"'),
    );
    expect(at("Voice take")).toBeGreaterThan(at('aria-label="Recent audio"'));
    const order = [
      "Audio response",
      "Mod matrix",
      "Signal scopes",
      "Audio assets",
      "Clear audio",
    ];
    const places = order.map(at);
    expect(places.every((p) => p > at("Voice take"))).toBe(true);
    expect([...places].sort((x, y) => x - y)).toEqual(places);
    // Route controls open first; collapsing diagnostics keeps the scopes mounted.
    expect(html).toMatch(
      /<details class="wb-fold" open="">\s*<summary>Audio response/,
    );
    expect(html).toMatch(/<details class="wb-fold">\s*<summary>Signal scopes/);
    expect(html).toContain('aria-label="Route 1 target"');
    expect(html).toContain("active routes");
    expect(html).toContain('aria-label="Spectrogram"');
    expect(html).toContain('aria-label="Spectrum"');
  });

  it("keeps only the transport and meter in view when folded", () => {
    const html = panel(true);
    expect(html).toContain('class="wb-sound-sections" hidden=""');
    expect(html.indexOf("wb-meter-strip")).toBeLessThan(
      html.indexOf("wb-sound-sections"),
    );
    expect(panel(false)).not.toContain('wb-sound-sections" hidden');
  });

  it("marks Play pressed while playing, and disables it with no track", () => {
    expect(panel(false, { playing: true })).toMatch(
      /aria-label="Stop"[^>]*aria-pressed="true"/,
    );
    expect(panel(false, { audioURL: "" })).toMatch(
      /<button[^>]*aria-label="Play"[^>]*disabled=""/,
    );
  });

  it("says when recent tracks last only for the tab", () => {
    expect(panel()).toContain("across reloads");
    expect(
      panel(false, { history: { recent: [], persisted: false } }),
    ).toContain("last for this tab only");
  });
});

describe("Live analyser", () => {
  function fakeContext(state: AudioContextState) {
    const made = { sources: 0, closed: 0 };
    const node = { connect() {} };
    const context = {
      state,
      sampleRate: 48000,
      destination: {},
      resume: async () => {},
      close: async () => void made.closed++,
      createAnalyser: () => ({
        ...node,
        fftSize: 0,
        smoothingTimeConstant: 0,
        frequencyBinCount: 1024,
      }),
      createMediaElementSource: () => {
        made.sources++;
        return node;
      },
    };
    return { context: context as unknown as AudioContext, made };
  }

  it("routes an element once, and never through a suspended context", async () => {
    const audio = {} as HTMLMediaElement;
    const suspended = fakeContext("suspended");
    expect(await liveAnalyser(audio, () => suspended.context)).toBeNull();
    expect(suspended.made).toEqual({ sources: 0, closed: 1 });
    const running = fakeContext("running");
    const graph = await liveAnalyser(audio, () => running.context);
    expect(graph?.freq).toHaveLength(1024);
    expect(await liveAnalyser(audio, () => running.context)).toBe(graph);
    expect(running.made.sources).toBe(1);
  });
});
