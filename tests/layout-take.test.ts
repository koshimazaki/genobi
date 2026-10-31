import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capturedLayout,
  clearLayoutTake,
  LAYOUT_CAPTURE,
  layoutComposer,
  layoutRecipe,
  queueLayoutTake,
  stageLayoutTake,
  useLayoutTake,
} from "../src/layout-take";
import { defaultRecipe } from "../src/world-builder/recipe";
import type { Take } from "../src/world-builder/export-take";
import { useSettingsStore } from "../src/settings-store";
import { HOSTED_RUN_LOCATION } from "../shared/comfy/run-location";
import { readHostedStudio } from "../src/hosted-studio";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";

vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: vi.fn(async () => false),
}));
const endpoint = "https://fixture.run.comfy.app";
const recipe = {
  ...defaultRecipe,
  ...LAYOUT_CAPTURE,
  prompt: "A room built from my scene.",
  objects: [{ ...defaultRecipe.objects[0], prompt: "wood floor" }],
};
function take(changes: Partial<Take> = {}): Take {
  return {
    name: "scene-take",
    manifest: new Blob(
      [JSON.stringify({ version: 1, recipe, frameCount: 193 })],
      { type: "application/json" },
    ),
    video: new Blob(["colour"], { type: "video/webm" }),
    depth: new Blob(["depth"], { type: "video/webm" }),
    first: new Blob(["first frame"], { type: "image/png" }),
    audio: new Blob(["dry track"], { type: "audio/wav" }),
    ...changes,
  };
}
afterEach(() => {
  useLayoutTake.setState({ pending: undefined });
  useSettingsStore.setState({ runLocation: undefined });
  vi.mocked(readHostedStudio).mockResolvedValue(false);
  vi.unstubAllGlobals();
});

describe("a captured scene handed to the combined layout/video/reverb job", () => {
  it("accepts the builder's recipe and receipt while preserving its complete scene", async () => {
    const source = take();
    const result = await capturedLayout(source, endpoint);
    expect(result.recipe).toBe(layoutRecipe(JSON.stringify(recipe)));
    expect(JSON.parse(result.recipe)).toMatchObject({
      width: 1024,
      height: 576,
      fps: 24,
      frames: 193,
      objects: recipe.objects,
    });
    expect(result.files).toEqual({
      TAKE_WEBM: source.video,
      DEPTH_WEBM: source.depth,
      REFERENCE_PNG: source.first,
      TRACK_AUDIO: source.audio,
    });
    expect(layoutComposer(result)).toMatchObject({
      model: "ltx-deploy-layout-to-video",
      description: recipe.prompt,
      cameraEnabled: false,
      deploy: { recipe: result.recipe, assets: {} },
    });
    const previous = {
      ...initialComposer,
      slots: {
        ...initialComposer.slots,
        character: "An unrelated old character",
      },
    };
    const composer = composerReducer(previous, {
      type: "update",
      patch: layoutComposer(result),
    });
    expect(composerInput(composer).description).toBe(recipe.prompt);
  });

  it("refuses a live recording, incompatible frame grid and oversized receipt", async () => {
    await expect(
      capturedLayout(take({ mode: "live" }), endpoint),
    ).rejects.toThrow("fixed-frame");
    for (const change of [
      { width: 1280 },
      { frames: 97, seconds: 4 },
      { frames: 97, seconds: 8 },
      { frames: 193, seconds: 4 },
    ]) {
      const manifest = new Blob([
        JSON.stringify({ recipe: { ...recipe, ...change } }),
      ]);
      await expect(
        capturedLayout(take({ manifest }), endpoint),
      ).rejects.toThrow("capture recipe");
    }
    expect(() => layoutRecipe(" ".repeat(64001))).toThrow("64 KB");
  });

  it("queues on local and hosted studios with a registered endpoint, without network writes", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("No network is allowed during handoff");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(queueLayoutTake(take())).rejects.toThrow("Register");
    useSettingsStore.setState({
      runLocation: {
        ...HOSTED_RUN_LOCATION,
        fixed: false,
        deployment: { url: endpoint, name: "fixture" },
      },
    });
    for (const hosted of [true, undefined]) {
      vi.mocked(readHostedStudio).mockResolvedValue(hosted);
      await queueLayoutTake(take());
      expect(useLayoutTake.getState().pending?.endpoint).toBe(endpoint);
    }
    vi.mocked(readHostedStudio).mockResolvedValue(false);
    await queueLayoutTake(take());
    expect(useLayoutTake.getState().pending?.endpoint).toBe(endpoint);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stages only named input files on explicit attachment, leaving generation to its quote flow", async () => {
    const result = await capturedLayout(take(), endpoint);
    const stage = vi.fn<
      (path: string, options?: RequestInit) => Promise<{ id: string }>
    >(async () => ({ id: crypto.randomUUID() }));
    const attached = await stageLayoutTake(
      result,
      "private-fixture-key",
      () => endpoint,
      stage,
    );
    expect(stage.mock.calls.map(([url]) => url)).toEqual(
      Object.keys(result.files).map(
        (token) => `/api/settings/deployment-assets/${token}`,
      ),
    );
    expect(attached.recipe).toBe(result.recipe);
    expect(Object.keys(attached.assets)).toEqual(Object.keys(result.files));
    expect(JSON.stringify(result)).not.toContain("private-fixture-key");
    expect(
      stage.mock.calls.every(([url]) => !/quotes|jobs/.test(String(url))),
    ).toBe(true);
  });

  it("does not attach tickets from another endpoint or retry an upload failure", async () => {
    const result = await capturedLayout(take(), endpoint);
    let current = endpoint;
    const stage = vi.fn(async () => {
      current = "https://other.run.comfy.app";
      return { id: crypto.randomUUID() };
    });
    await expect(
      stageLayoutTake(result, "", () => current, stage),
    ).rejects.toThrow("deployment changed");
    expect(stage).toHaveBeenCalledOnce();
    const failed = vi.fn(async () => {
      throw new Error("Upload failed");
    });
    await expect(
      stageLayoutTake(result, "", () => endpoint, failed),
    ).rejects.toThrow("Upload failed");
    expect(failed).toHaveBeenCalledOnce();
  });

  it("keeps a missing track required and never clears a newer handoff", async () => {
    const old = await capturedLayout(
      take({ audio: undefined, depth: undefined }),
      endpoint,
    );
    expect(Object.keys(old.files)).toEqual(["TAKE_WEBM", "REFERENCE_PNG"]);
    const newer = await capturedLayout(take(), endpoint);
    useLayoutTake.setState({ pending: newer });
    clearLayoutTake(old.id);
    expect(useLayoutTake.getState().pending).toBe(newer);
    clearLayoutTake(newer.id);
    expect(useLayoutTake.getState().pending).toBeUndefined();
  });
});
