// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  useBuilderAssets,
  type BuilderAssets,
} from "../src/world-builder/useBuilderAssets";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { Take } from "../src/world-builder/export-take";
import { presetRecipe } from "../src/world-builder/recipe";
import { sessionHandoffs } from "../src/world-builder/session-handoff";
import { takeToMp4 } from "../src/world-builder/take-mp4";
import { send } from "../src/world-builder/session-io";
import { studioStore } from "../src/studio/store";
import { readWorldFiles } from "../src/director/world-files";
import studio from "../docs/director-bundle/example/studio.json";
import type { Project } from "../shared/director/types";

const assetFixture = () => ({
  project: structuredClone(studio) as unknown as Project,
  files: new Map<string, Uint8Array<ArrayBuffer>>(),
});

vi.mock("../src/world-builder/take-mp4", () => ({ takeToMp4: vi.fn() }));
vi.mock("../src/world-builder/session-io", () => ({ send: vi.fn() }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const captured = { ...presetRecipe("Studio"), width: 1024, height: 576 };
const current = { ...captured, width: 768, orbit: 180 };
const blob = (text: string, type: string) =>
  new NodeBlob([text], { type }) as Blob;
const savedTake = (): Take => ({
  name: "saved-room",
  video: blob("webm", "video/webm"),
  first: blob("png", "image/png"),
  manifest: blob(JSON.stringify({ recipe: captured }), "application/json"),
});

beforeEach(() => {
  vi.clearAllMocks();
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.initialize(assetFixture());
  vi.mocked(takeToMp4).mockResolvedValue(blob("mp4", "video/mp4"));
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function mounted() {
  let assets!: BuilderAssets;
  const onAsset = vi.fn(
    async (media: { filename: string; use: "production" | "reference" }) => ({
      assetId: "captured-video",
      added: true,
      filename: media.filename,
      use: media.use,
    }),
  );
  const session = {
    recipe: current,
    api: { current: { getRecipe: () => current } },
    take: null,
  } as unknown as BuilderSession;
  function Harness() {
    assets = useBuilderAssets(session, onAsset);
    return null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(<Harness />));
  return { assets: () => assets, onAsset, session };
}

it("adds a saved take using its captured dimensions and recipe after the scene changes", async () => {
  const { assets, onAsset } = mounted();
  await act(async () => {
    await assets().addTake(savedTake());
  });
  expect(onAsset).toHaveBeenCalledOnce();
  expect(takeToMp4).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      width: 1024,
      height: 576,
    }),
    expect.any(AbortSignal),
  );
  expect(
    readWorldFiles(studioStore.getState().director.bundle!).recipe,
  ).toEqual(captured);
});

it("refuses a project switch during encoding before importing media or provenance", async () => {
  const { assets, onAsset } = mounted();
  vi.mocked(takeToMp4).mockImplementationOnce(async () => {
    const next = assetFixture();
    next.project.id = "a-different-project";
    studioStore.getState().actions.commit(next);
    return blob("mp4", "video/mp4");
  });
  await act(async () => {
    await expect(assets().addTake(savedTake())).rejects.toThrow(
      "Project changed",
    );
  });
  expect(onAsset).not.toHaveBeenCalled();
  expect(
    readWorldFiles(studioStore.getState().director.bundle!).recipe,
  ).toBeUndefined();
});

it("does not substitute the current scene for an invalid take receipt", async () => {
  const { assets, onAsset } = mounted();
  await expect(
    assets().addTake({
      ...savedTake(),
      manifest: blob("{}", "application/json"),
    }),
  ).rejects.toThrow("no valid recipe receipt");
  expect(takeToMp4).not.toHaveBeenCalled();
  expect(onAsset).not.toHaveBeenCalled();
});

it("sends captured provenance with an embedded Comfy take handoff", async () => {
  const { session } = mounted();
  const take = savedTake();
  await sessionHandoffs(session.api, take, vi.fn(), vi.fn()).toComfy();
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "director:take",
      video: take.video,
      recipe: captured,
    }),
  );
});
