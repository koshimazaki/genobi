// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Project } from "../shared/director/types";
import studio from "../docs/director-bundle/example/studio.json";
import type { Bundle } from "../src/director/bundle";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The renderer and the project copy are not under test: a stand-in draws
// nothing, and no copy is kept.
vi.mock("../src/director/renderer", () => ({
  DirectorRenderer: class {
    init = async () => {};
    render = async () => {};
    dispose = () => {};
    waveforms = () => ({});
  },
}));
vi.mock("../src/director/useProjectCopy", () => ({
  useProjectCopy: () => {},
}));

// Director › Render › Edit in Editor mounts a new canvas. The finished
// render must survive that (Save to library needs its URL); it is cleared
// and revoked only when the project changes.
it("keeps a finished render across a canvas change, not a project change", async () => {
  const { useDirectorRuntime } =
    await import("../src/director/useDirectorRuntime");
  const { studioStore } = await import("../src/studio/store");
  const revoke = vi.fn();
  URL.revokeObjectURL = revoke;
  const project = studio as unknown as Project;
  const first: Bundle = { project, files: new Map() };
  const second: Bundle = { project: { ...project }, files: new Map() };
  studioStore.setState({
    director: { ...studioStore.getState().director, bundle: first },
  });
  let runtime!: ReturnType<typeof useDirectorRuntime>;
  function Probe({ bundle }: { bundle: Bundle }) {
    runtime = useDirectorRuntime(bundle, true);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe bundle={first} />));
  await act(async () => runtime.canvas(document.createElement("canvas")));
  await act(async () => runtime.setRenderUrl("blob:render"));
  // The Editor's canvas replaces the Director's.
  await act(async () => runtime.canvas(null));
  await act(async () => runtime.canvas(document.createElement("canvas")));
  expect(runtime.renderUrl).toBe("blob:render");
  expect(revoke).not.toHaveBeenCalled();
  // Another project: the render is let go.
  await act(async () => root.render(<Probe bundle={second} />));
  expect(runtime.renderUrl).toBe("");
  expect(revoke).toHaveBeenCalledWith("blob:render");
  act(() => root.unmount());
});
