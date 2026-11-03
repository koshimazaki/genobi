// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  applyCameraRecipe,
  cancelCameraRecipeHandoff,
} from "../src/camera-recipe-target";
import {
  ASSET_UPLOAD_PENDING,
  useComposerRecreate,
} from "../src/useComposerRecreate";
import { initialComposer, type ComposerState } from "../src/useComposer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let observed: ComposerState;
let uploading = false;
let edit: (patch: Partial<ComposerState>) => void;
const onError = vi.fn();

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  host?.remove();
  host = undefined;
  cancelCameraRecipeHandoff();
  onError.mockClear();
});

function mount(uploadVideo: (file: File) => Promise<string>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  function Harness() {
    const [state, setState] = useState<ComposerState>({
      ...initialComposer,
      generator: "video",
      sourceId: "previous-source",
    });
    const update = (patch: Partial<ComposerState>) =>
      setState((current) => ({ ...current, ...patch }));
    const handoff = useComposerRecreate(
      state,
      vi.fn(),
      onError,
      update,
      uploadVideo,
    );
    observed = state;
    uploading = handoff.uploadingVideo;
    edit = update;
    return null;
  }
  act(() => root!.render(<Harness />));
}

function handoff() {
  act(() => {
    applyCameraRecipe({
      patch: { generator: "upscale" },
      note: "Uploading asset.",
      video: new File(["mp4"], "clip.mp4", { type: "video/mp4" }),
    });
  });
}

it("blocks stale source fallback until the chosen MP4 is uploaded", async () => {
  let resolve!: (id: string) => void;
  const upload = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  mount(upload);
  handoff();
  expect(upload).toHaveBeenCalledOnce();
  expect(observed.generator).toBe("upscale");
  expect(observed.sourceId).toBe(ASSET_UPLOAD_PENDING);
  expect(uploading).toBe(true);

  await act(async () => resolve("new-source"));
  expect(observed.sourceId).toBe("new-source");
  expect(uploading).toBe(false);
});

it("does not overwrite a source the person chose during the upload", async () => {
  let resolve!: (id: string) => void;
  mount(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  handoff();
  act(() => edit({ sourceId: "manual-source" }));
  expect(uploading).toBe(false);
  await act(async () => resolve("late-source"));
  expect(observed.sourceId).toBe("manual-source");
});

it("keeps a failed handoff unselected, instead of running an older clip", async () => {
  let reject!: (error: Error) => void;
  mount(
    () =>
      new Promise<string>((_done, fail) => {
        reject = fail;
      }),
  );
  handoff();
  await act(async () => reject(new Error("Upload refused")));
  expect(observed.sourceId).toBe(ASSET_UPLOAD_PENDING);
  expect(uploading).toBe(false);
  expect(onError).toHaveBeenCalledWith("Upload refused");
});

it("drops the late upload after leaving Upscale", async () => {
  let resolve!: (id: string) => void;
  mount(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  handoff();
  act(() => edit({ generator: "image" }));
  expect(uploading).toBe(false);
  await act(async () => resolve("late-source"));
  expect(observed.sourceId).toBe(ASSET_UPLOAD_PENDING);
});
