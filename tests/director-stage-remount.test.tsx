// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import DirectorStage from "../src/director/DirectorStage";
import ProgramRow from "../src/director/ProgramRow";
import type { Project } from "../shared/director/types";
import studio from "../docs/director-bundle/example/studio.json";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Program went blank after Gallery → Take it to the editor (or Director →
// Editor): ProgramRow wraps the stage only in the Editor, so the switch
// mounts a new canvas while the renderer kept drawing into the old one. The
// stage now reports every canvas it mounts, and useDirectorRuntime rebuilds
// the renderer on the one showing.
it("tells the runtime about the canvas the Editor mounts", () => {
  const project = studio as unknown as Project;
  const seen: (HTMLCanvasElement | null)[] = [];
  const canvas = (element: HTMLCanvasElement | null) => seen.push(element);
  const root = createRoot(
    document.body.appendChild(document.createElement("div")),
  );
  const show = (advanced: boolean) =>
    act(() =>
      root.render(
        <ProgramRow
          advanced={advanced}
          project={project}
          selected=""
          disabled={false}
          command={() => ""}
        >
          <DirectorStage project={project} canvas={canvas} ready status="" />
        </ProgramRow>,
      ),
    );
  show(false);
  const director = seen.at(-1);
  show(true);
  const editor = seen.at(-1);
  expect(director).toBeInstanceOf(HTMLCanvasElement);
  expect(editor).toBeInstanceOf(HTMLCanvasElement);
  expect(editor).not.toBe(director);
  expect(editor!.isConnected).toBe(true);
  expect(director!.isConnected).toBe(false);
  // The old canvas was let go before the new one arrived.
  expect(seen).toContain(null);
  act(() => root.unmount());
  expect(seen.at(-1)).toBeNull();
});
