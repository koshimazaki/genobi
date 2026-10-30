// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Job } from "../shared/types";
import { runInputStore, type RunInputs } from "../src/run-inputs";
import { initialComposer, type ComposerState } from "../src/useComposer";
import { useComposerRecreate } from "../src/useComposerRecreate";
import { supersedeRestores } from "../src/settings-store";
import { restoreRun } from "../src/useRecreate";

vi.mock("../src/useRecreate", () => ({ restoreRun: vi.fn(async () => {}) }));
let root: Root;
let hook: ReturnType<typeof useComposerRecreate>;
const dispatch = vi.fn(),
  error = vi.fn();
function Probe({ state = initialComposer }: { state?: ComposerState }) {
  hook = useComposerRecreate(state, dispatch, error);
  return null;
}
const job = {
  id: "image",
  generator: "image",
  model: "flux-3-klein-api",
  description: "A tree",
  imageReferenceCount: 2,
} as Job;
const inputs = {
  id: job.id,
  savedAt: Date.now(),
  bytes: 100,
  generator: job.generator,
  model: job.model,
  sentDescription: job.description,
  description: job.description,
  imageReferences: [
    "data:image/png;base64,AAAA",
    "data:image/webp;base64,BBBB",
  ],
  imageRegions: [],
} as unknown as RunInputs;
const deferred = () => {
  let resolve!: (value: RunInputs | undefined) => void;
  const promise = new Promise<RunInputs | undefined>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("holds Generate while loading and restores files without submitting", async () => {
  const read = deferred();
  vi.spyOn(runInputStore, "load").mockReturnValue(read.promise);
  let done!: Promise<void>;
  await act(async () => {
    done = hook.recreate(job);
  });
  expect(hook.pending).toBe(true);
  expect(dispatch).not.toHaveBeenCalled();
  await act(async () => {
    read.resolve(inputs);
    await done;
  });
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "restore",
    job,
    inputs,
  });
  expect(restoreRun).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledExactlyOnceWith("");
  expect(hook.pending).toBe(false);
});
it.each(["edit", "model", "recreate"])(
  "discards a delayed file read after a newer %s",
  async (choice) => {
    const read = deferred();
    vi.spyOn(runInputStore, "load")
      .mockReturnValueOnce(read.promise)
      .mockResolvedValue(inputs);
    let done!: Promise<void>;
    await act(async () => {
      done = hook.recreate(job);
    });
    await act(async () => {
      if (choice === "edit")
        root.render(
          <Probe
            state={{ ...initialComposer, description: "My newer prompt" }}
          />,
        );
      else if (choice === "model") supersedeRestores();
      else await hook.recreate({ ...job, id: "newer" });
    });
    dispatch.mockClear();
    vi.mocked(restoreRun).mockClear();
    await act(async () => {
      read.resolve(inputs);
      await done;
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(restoreRun).not.toHaveBeenCalled();
    expect(hook.pending).toBe(false);
  },
);
it("clears unrelated files and reports originals that were never saved", async () => {
  vi.spyOn(runInputStore, "load").mockResolvedValue(undefined);
  await act(async () => hook.recreate(job));
  expect(dispatch).toHaveBeenCalledWith({
    type: "restore",
    job,
    inputs: undefined,
  });
  expect(error).toHaveBeenLastCalledWith(expect.stringContaining("Reattach"));
});
