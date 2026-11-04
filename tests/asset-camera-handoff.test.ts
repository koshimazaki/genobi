// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { Project } from "../shared/director/types";
import type { Bundle } from "../src/director/bundle";
import {
  assetCameraAction,
  sendAssetToCamera,
} from "../src/studio/camera-handoff";
import {
  cancelCameraRecipeHandoff,
  onCameraRecipe,
  type CameraRecipePatch,
} from "../src/camera-recipe-target";

const reference = vi.hoisted(() => ({ fail: false }));
vi.mock("../src/image-files", () => ({
  readReference: async (file: File) => {
    if (reference.fail) throw new Error("Choose PNG, JPEG or WebP images.");
    return `data:${file.type};base64,AAAA`;
  },
}));

const file = (path: string) => ({ path, sha256: "a".repeat(64) });
function bundle(): Bundle {
  const project = {
    id: "p1",
    assets: {
      made: {
        kind: "image",
        use: "production",
        file: file("media/made.png"),
        origin: "generated",
        generationId: "g1",
      },
      still: {
        kind: "image",
        use: "production",
        file: file("media/still.png"),
        origin: "uploaded",
      },
      vector: {
        kind: "image",
        use: "reference",
        file: file("references/palette.svg"),
        origin: "uploaded",
      },
      clip: {
        kind: "video",
        use: "production",
        file: file("media/clip.mp4"),
        origin: "uploaded",
      },
      sound: {
        kind: "audio",
        use: "production",
        file: file("media/pulse.wav"),
        origin: "uploaded",
      },
    },
    generations: [
      {
        id: "g1",
        prompt: " a fox in neon rain ",
        referenceAssetIds: [],
        inputAssetIds: [],
        outputAssetIds: ["made"],
      },
    ],
  } as unknown as Project;
  const files = new Map(
    Object.values(project.assets).map((a) => [a.file.path, new Uint8Array(8)]),
  );
  return { project, files } as unknown as Bundle;
}

let release: (() => void) | undefined;
afterEach(() => {
  release?.();
  release = undefined;
  reference.fail = false;
  cancelCameraRecipeHandoff();
});
function listen() {
  const received: CameraRecipePatch[] = [];
  release = onCameraRecipe((recipe) => received.push(recipe));
  return received;
}

it("offers Recreate for a recorded prompt and Use in Camera for usable files", () => {
  const { project } = bundle();
  expect(assetCameraAction(project, "made")?.label).toBe("Recreate");
  expect(assetCameraAction(project, "still")?.label).toBe("Use in Camera");
  expect(assetCameraAction(project, "clip")?.label).toBe("Use in Camera");
  // Camera cannot take audio, or an image type references refuse.
  expect(assetCameraAction(project, "sound")).toBeUndefined();
  expect(assetCameraAction(project, "vector")).toBeUndefined();
  expect(assetCameraAction(project, "missing")).toBeUndefined();
});

it("Recreate restores the recorded prompt without generating", async () => {
  const received = listen();
  const select = vi.fn();
  await sendAssetToCamera(select, bundle(), "made");
  expect(select).toHaveBeenCalledWith("camera");
  expect(received).toHaveLength(1);
  expect(received[0]!.patch.description).toBe("a fox in neon rain");
  expect(received[0]!.note).toContain("Nothing was generated.");
  expect(received[0]!.video).toBeUndefined();
});

it("Use in Camera replaces Edit's references with the image", async () => {
  const received = listen();
  await sendAssetToCamera(vi.fn(), bundle(), "still");
  expect(received[0]!.patch).toEqual({
    generator: "edit",
    model: "flux-3",
    imageReferences: ["data:image/png;base64,AAAA"],
    imageRegions: [],
    imageAspectRatio: "auto",
  });
  expect(received[0]!.note).toContain("still.png");
});

it("hands a video to the composer to upload as Upscale's source", async () => {
  const received = listen();
  await sendAssetToCamera(vi.fn(), bundle(), "clip");
  expect(received[0]!.patch).toEqual({ generator: "upscale" });
  expect(received[0]!.video?.name).toBe("clip.mp4");
  expect(received[0]!.video?.type).toBe("video/mp4");
});

it("says why an unreadable image was not used, and changes nothing", async () => {
  reference.fail = true;
  const received = listen();
  await sendAssetToCamera(vi.fn(), bundle(), "still");
  expect(received).toHaveLength(1);
  expect(received[0]!.patch).toEqual({});
  expect(received[0]!.note).toContain("Camera opened as it was.");
});

it("drops an image handoff a newer one superseded while it was read", async () => {
  const received = listen();
  const first = sendAssetToCamera(vi.fn(), bundle(), "still");
  cancelCameraRecipeHandoff();
  await first;
  expect(received).toHaveLength(0);
});
