// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Project } from "../shared/director/types";
import studio from "../docs/director-bundle/example/studio.json";
import { studioStore } from "../src/studio/store";
import type { OutputMedia } from "../src/studio/project-assets";
import { applyRoom } from "../src/world-builder/apply-room";
import type { Take } from "../src/world-builder/export-take";
import { presetRecipe, type Recipe } from "../src/world-builder/recipe";
import {
  useBuilderAssets,
  type BuilderAssets,
} from "../src/world-builder/useBuilderAssets";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";

vi.mock("../src/world-builder/apply-room", async (original) => ({
  ...(await original<typeof import("../src/world-builder/apply-room")>()),
  applyRoom: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
const blob = (text: string, type: string) =>
  new NodeBlob([text], { type }) as Blob;
const small = presetRecipe("Small room");
const cathedral = presetRecipe("Cathedral");
const savedTake = (recipe = small): Take => ({
  name: "captured-room",
  video: blob("webm", "video/webm"),
  audio: blob("wav", "audio/wav"),
  first: blob("png", "image/png"),
  manifest: blob(JSON.stringify({ recipe }), "application/json"),
});

beforeEach(() => {
  vi.clearAllMocks();
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.initialize({
    project: structuredClone(studio) as unknown as Project,
    files: new Map<string, Uint8Array<ArrayBuffer>>(),
  });
  vi.mocked(applyRoom).mockImplementation(async (audio, name, room, add) =>
    add({
      blob: audio,
      filename: `${name}-${room.preset}.wav`,
      use: "production",
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

function mounted() {
  let assets!: BuilderAssets;
  const add = vi.fn(async (media: OutputMedia) => ({
    assetId: "roomed-audio",
    added: true,
    filename: media.filename,
    use: media.use,
  }));
  function Harness({ take, recipe }: { take: Take | null; recipe: Recipe }) {
    assets = useBuilderAssets({ take, recipe } as BuilderSession, add);
    return null;
  }
  root = createRoot(document.body.appendChild(document.createElement("div")));
  return {
    assets: () => assets,
    add,
    render: async (take: Take | null, recipe = cathedral) => {
      await act(async () =>
        root!.render(<Harness take={take} recipe={recipe} />),
      );
    },
  };
}

it("applies the captured room after an edit and uses a new room only after a new capture", async () => {
  const h = mounted();
  const take = savedTake();
  await h.render(take, small);
  // A retained take remains authoritative even when the open scene differs.
  await h.render(take, cathedral);
  expect(h.assets().room?.preset).toBe("small_room");
  await act(async () => h.assets().applyRoom());
  expect(applyRoom).toHaveBeenLastCalledWith(
    take.audio,
    take.name,
    expect.objectContaining({ preset: "small_room" }),
    expect.any(Function),
  );
  expect(h.add.mock.lastCall?.[0].filename).toBe(
    "captured-room-small_room.wav",
  );

  const nextTake = savedTake(cathedral);
  await h.render(nextTake, cathedral);
  expect(h.assets().room?.preset).toBe("cathedral");
  await act(async () => h.assets().applyRoom());
  expect(applyRoom).toHaveBeenLastCalledWith(
    nextTake.audio,
    nextTake.name,
    expect.objectContaining({ preset: "cathedral" }),
    expect.any(Function),
  );
});

it("explains an invalid legacy receipt and never substitutes the current room", async () => {
  const h = mounted();
  await h.render({ ...savedTake(), manifest: blob("{}", "application/json") });
  expect(h.assets().room).toBeUndefined();
  expect(h.assets().result).toContain("Capture a new take");
  await act(async () => {
    await expect(h.assets().applyRoom()).rejects.toThrow(
      "no valid recipe receipt",
    );
  });
  expect(applyRoom).not.toHaveBeenCalled();
  expect(h.add).not.toHaveBeenCalled();
});

it("ignores a late receipt read for a previously selected take", async () => {
  const h = mounted();
  let resolve!: (text: string) => void;
  const pending = new Promise<string>((done) => (resolve = done));
  const old = savedTake();
  vi.spyOn(old.manifest, "text").mockReturnValue(pending);
  await h.render(old);
  expect(h.assets().room).toBeUndefined();
  const next = savedTake(cathedral);
  await h.render(next);
  expect(h.assets().room?.preset).toBe("cathedral");
  await act(async () => resolve(JSON.stringify({ recipe: small })));
  expect(h.assets().room?.preset).toBe("cathedral");
});

it.each(["project", "take"])(
  "does not import a delayed room result after the %s changes",
  async (changed) => {
    const h = mounted();
    await h.render(savedTake());
    let release!: () => void;
    const processing = new Promise<void>((done) => (release = done));
    vi.mocked(applyRoom).mockImplementationOnce(
      async (audio, name, _room, add) => {
        await processing;
        return add({ blob: audio, filename: `${name}.wav`, use: "production" });
      },
    );
    let applied!: Promise<void>;
    await act(async () => {
      applied = h.assets().applyRoom();
      // Let the receipt resolve and room processing begin before changing context.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(applyRoom).toHaveBeenCalledOnce();
    if (changed === "project") {
      const before = studioStore.getState().director.bundle!;
      studioStore.getState().actions.commit({
        ...before,
        project: { ...before.project, id: "another-project" },
      });
    } else await h.render(savedTake(cathedral));
    await act(async () => {
      const refusal = expect(applied).rejects.toThrow(
        /Project changed|Take changed/,
      );
      release();
      await refusal;
    });
    expect(h.add).not.toHaveBeenCalled();
  },
);

it("offers no room treatment for a live recording or a take without audio", async () => {
  const h = mounted();
  await h.render({ ...savedTake(), mode: "live" });
  expect(h.assets().room).toBeUndefined();
  await h.assets().applyRoom();
  await h.render({ ...savedTake(), audio: undefined });
  expect(h.assets().room).toBeUndefined();
  await h.assets().applyRoom();
  expect(applyRoom).not.toHaveBeenCalled();
});
