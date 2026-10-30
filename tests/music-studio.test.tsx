import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GenerationControls from "../src/components/GenerationControls";
import JobMedia from "../src/components/JobMedia";
import MusicWorkspace from "../src/components/MusicWorkspace";
import ComposerActions from "../src/components/ComposerActions";
import { importGalleryMedia } from "../src/director/import-gallery-media";
import { generatorFoot, generators, modelSignature } from "../src/generators";
import { heroMedia } from "../src/hero";
import { resultExtension } from "../src/image-download";
import { createStudioStore } from "../src/studio/store";
import {
  composerBlocked,
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import { jobStage } from "../shared/progress-line";
import { readyEntry } from "../shared/registry";
import type { Job } from "../shared/types";
import { mp3 } from "./audio-fixtures";
import { assetFixture } from "./director-asset-fixture";

// The studio side of music: the generator table, the composer's caption,
// lyrics and length, a Ready song played where a clip shows its picture, and
// the gallery's Add to project taking it as an audio asset.
const song = {
  id: "song-1",
  status: "Ready",
  generator: "audio",
  model: "minimax-music-3",
  mediaType: "audio",
  resultUrl: "/api/clips/song-1",
  resultContentType: "audio/mpeg",
  description: "Synthwave teaser, 128 BPM, no vocals.",
  lyrics: "[Instrumental]",
  duration: 20,
  createdAt: new Date().toISOString(),
} as unknown as Job;
const music = composerReducer(initialComposer, {
  type: "update",
  patch: { generator: "audio", model: "minimax-music-3" },
});

afterEach(() => vi.unstubAllGlobals());

describe("the music generator in the studio", () => {
  it("is in the generator table with its own name, icon, foot and tag", () => {
    expect(generators.audio).toEqual({
      model: "MiniMax Music 3",
      label: "MiniMax Music 3 · Text to music",
      icon: "sound",
    });
    expect(generatorFoot("audio", "Precise", "minimax-music-3")).toBe(
      "MiniMax-Music3 · MiniMax Music 3 · Text to music · open workflow · open weights",
    );
    expect(modelSignature(song)).toEqual({
      tag: "MUSIC",
      title: "MiniMax Music 3 · Text to music",
    });
    expect(jobStage({ ...song, status: "Generating" })).toBe(
      "GENERATING MUSIC 3 TRACK",
    );
    expect(resultExtension(song)).toBe("mp3");
    expect(resultExtension({ ...song, resultContentType: "audio/wav" })).toBe(
      "wav",
    );
  });

  it("sends caption, lyrics and length, and keeps lyrics off every other run", () => {
    const written = composerReducer(music, {
      type: "update",
      patch: {
        description: "Lo-fi, 78 BPM",
        lyrics: "[verse]\nRain",
        duration: 300,
      },
    });
    // The fader's range: the longest a song may be asked for is 120 s.
    expect(written.duration).toBe(120);
    const sent = composerInput(written);
    expect(sent).toMatchObject({
      generator: "audio",
      model: "minimax-music-3",
      description: "Lo-fi, 78 BPM",
      lyrics: "[verse]\nRain",
      duration: 120,
      cameraEnabled: false,
      draft: false,
    });
    const video = composerReducer(written, {
      type: "update",
      patch: { generator: "video", model: "ltx-2.5" },
    });
    expect(composerInput(video).lyrics).toBeUndefined();
    expect(composerBlocked({ ...music, description: " " }, "", "")).toBe(true);
    expect(composerBlocked(written, "", "Lo-fi, 78 BPM")).toBe(false);
    expect(
      composerBlocked(
        { ...written, lyrics: "x".repeat(3001) },
        "",
        "Lo-fi, 78 BPM",
      ),
    ).toBe(true);
  });

  it("restores a song's caption and lyrics, and its length on a full Recreate", () => {
    const restored = composerReducer(initialComposer, {
      type: "restore",
      job: song,
    });
    expect(restored).toMatchObject({
      generator: "audio",
      model: "minimax-music-3",
      description: song.description,
      lyrics: "[Instrumental]",
      duration: 20,
    });
    const title = composerReducer(
      { ...music, duration: 45 },
      { type: "restore-prompt", job: song },
    );
    expect(title.duration).toBe(45);
    expect(title.lyrics).toBe("[Instrumental]");
  });

  it("draws caption, lyrics and the duration fader, and no camera", () => {
    const workspace = renderToStaticMarkup(
      <MusicWorkspace state={music} update={() => {}} />,
    );
    expect(workspace).toContain('id="music-caption"');
    expect(workspace).toContain('id="music-lyrics"');
    // The licence asks for its name, as written, where the model is used.
    expect(workspace).toContain(">MiniMax-Music3<");
    expect(workspace).toContain('maxLength="3000"');
    const controls = renderToStaticMarkup(
      <GenerationControls
        generator="audio"
        model="minimax-music-3"
        duration={20}
        onDurationChange={() => {}}
        aspectRatio="16:9"
        onAspectRatioChange={() => {}}
        resolution="hd"
        onResolutionChange={() => {}}
        cameraEnabled
        onCameraEnabledChange={() => {}}
        draft={false}
        onDraftChange={() => {}}
      />,
    );
    expect(controls).toContain('id="duration-label"');
    // The model ends a song when it chooses (its encoder emits the end), so
    // the fader is a ceiling and says so rather than promising a length.
    // The trigger stays as short as Duration's; the wording is in the detail.
    expect(controls).toContain(">Max<");
    expect(controls).toContain(">≤20s<");
    expect(controls).toContain("A ceiling, not the length");
    expect(controls).not.toContain("Aspect ratio");
    expect(controls).not.toContain('id="camera-label"');
    const actions = renderToStaticMarkup(
      <ComposerActions
        generator="audio"
        model="minimax-music-3"
        onOpenCamera={() => {}}
        onOpenAcoustic={() => {}}
      />,
    );
    expect(actions).not.toContain("Camera controls");
  });

  it("plays a Ready song with an audio element, where a clip shows video", () => {
    const html = renderToStaticMarkup(<JobMedia job={song} />);
    expect(html).toContain("<audio");
    expect(html).toContain('src="/api/clips/song-1"');
    expect(html).toContain("controls");
    expect(html).not.toContain("<video");
    // Every song carries the credit its model's licence asks for.
    expect(html).toContain("Made with MiniMax-Music3");
    expect(readyEntry("minimax-music-3")!.credit).toBe("MiniMax-Music3");
    // The music composer's main view shows songs only.
    const clip = { ...song, id: "clip-1", generator: "video" } as Job;
    expect(
      heroMedia({
        generator: "audio",
        catalogueId: null,
        selected: clip,
        runs: [clip, song],
        samples: [],
      }).job?.id,
    ).toBe("song-1");
  });

  it("adds a song from the gallery to the project as a production audio asset", async () => {
    const store = createStudioStore();
    store.getState().actions.initialize(assetFixture());
    const before = store.getState().director.bundle!;
    const bytes = mp3(320_000, 766);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(bytes, { headers: { "content-type": "audio/mpeg" } }),
        ),
    );
    // No media element in this environment: one that has read its metadata.
    const element = {
      preload: "",
      src: "",
      readyState: 1,
      duration: (766 * 1152) / 44100,
      removeAttribute() {},
      load() {},
      addEventListener() {},
      removeEventListener() {},
    };
    vi.stubGlobal("document", { createElement: () => element });
    await importGalleryMedia(
      "/api/clips/song-1",
      "genobi-study-song-1.mp3",
      store,
    );
    const after = store.getState().director.bundle!;
    expect(after.project.layers).toEqual(before.project.layers);
    const added = Object.entries(after.project.assets)
      .filter(([id]) => !before.project.assets[id])
      .map(([, asset]) => asset);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: "audio", use: "production" });
    expect(added[0].file.path).toMatch(/\.mp3$/);
    expect(added[0].durationSeconds).toBeCloseTo(20.01, 2);
  });
});
