import { afterEach, expect, it, vi } from "vitest";
import type { Project } from "../shared/director/types";
import {
  openInCamera,
  type CameraRecipe,
} from "../src/director/recreate-in-camera";
import {
  cancelCameraRecipeHandoff,
  onCameraRecipe,
  type CameraRecipePatch,
} from "../src/camera-recipe-target";

const project = { id: "handoff-test" } as Project;
const files = new Map<string, Uint8Array>();

function recipe(prompt: string, reference?: string): CameraRecipe {
  return {
    label: "Recreate in Camera",
    prompt,
    imageIds: [],
    ...(reference ? { reference } : {}),
    missing: [],
  };
}

function deferredImage() {
  let release!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  cancelCameraRecipeHandoff();
  vi.unstubAllGlobals();
});

it("keeps the newest Recreate after an older image finishes", async () => {
  const image = deferredImage();
  const fetchImage = vi.fn(() => image.promise);
  vi.stubGlobal("fetch", fetchImage);
  const received: CameraRecipePatch[] = [];
  stop = onCameraRecipe((patch) => received.push(patch));

  const first = openInCamera(
    () => {},
    recipe("old", "/slow.png"),
    project,
    files,
  );
  expect(fetchImage).toHaveBeenCalledWith("/slow.png");
  await openInCamera(() => {}, recipe("new"), project, files);
  expect(received).toHaveLength(1);
  expect(received[0].patch.description).toBe("new");

  image.release(new Response(new Blob(["image"], { type: "image/png" })));
  await first;
  expect(received).toHaveLength(1);
  expect(received[0].patch.description).toBe("new");
});

it("ignores a pending Recreate after leaving Camera", async () => {
  const image = deferredImage();
  vi.stubGlobal("fetch", vi.fn(() => image.promise));
  const received: CameraRecipePatch[] = [];
  stop = onCameraRecipe((patch) => received.push(patch));

  const pending = openInCamera(
    () => {},
    recipe("old", "/slow.png"),
    project,
    files,
  );
  cancelCameraRecipeHandoff();
  image.release(new Response(new Blob(["image"], { type: "image/png" })));
  await pending;
  expect(received).toEqual([]);
});
