// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import ImageStage from "../src/components/ImageStage";
import { useImageReferences } from "../src/useImageReferences";
import {
  initialComposer,
  composerReducer,
  composerInput,
  type ComposerState,
} from "../src/useComposer";
import { workflowRun } from "../shared/comfy/runs";
import { fillSlots, danglingLinks } from "../shared/comfy/slots";
import { kleinFiles } from "../shared/comfy/klein-edit";
import { readFileSync } from "node:fs";
const png = `data:image/png;base64,${readFileSync("tests/fixtures/reference.png").toString("base64")}`;
vi.mock("../src/image-files", () => ({
  readReference: vi.fn(async () => png),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});
it("drops an existing image into Klein, displays its source, and opens working box controls without generating", async () => {
  let current: ComposerState = initialComposer;
  function Probe({ revision }: { revision: number }) {
    const [state, setState] = useState<ComposerState>({
      ...initialComposer,
      generator: "image" as const,
      model: "flux-3-klein" as const,
      description: "Change the highlighted object",
    });
    current = state;
    const update = (patch: Partial<ComposerState>) =>
      setState((s) => composerReducer(s, { type: "update", patch }));
    const images = useImageReferences(state, update);
    return (
      <ImageStage
        state={state}
        update={update}
        images={images}
        layoutRevision={revision}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Probe revision={0} />));
  const file = new File(["test"], "source.png", { type: "image/png" });
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { files: [file], types: ["Files"], getData: () => "" },
  });
  await act(async () => {
    host.querySelector(".image-stage-media")!.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(current.imageReferences).toEqual([png]);
  expect(
    host.querySelector(".image-region-canvas img")?.getAttribute("src"),
  ).toBe(png);
  expect(host.textContent).toContain("IMAGE EDIT");
  act(() => root!.render(<Probe revision={1} />));
  const resize = host.querySelector<HTMLButtonElement>(
    'button[aria-label^="Resize image preview"]',
  )!;
  act(() =>
    resize.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(
    (host.querySelector(".image-stage-media") as HTMLElement).style.height,
  ).toBe("1200px");
  const originalBox = [...current.imageRegions[0].box];
  act(() =>
    resize.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(
    (host.querySelector(".image-stage-media") as HTMLElement).style.height,
  ).toBe("");
  expect(current.imageRegions[0].box).toEqual(originalBox);
  expect(current.imageRegions).toHaveLength(1);
  expect(host.querySelector(".region-card")).not.toBeNull();
  expect(document.activeElement?.className).toBe("image-region-canvas");
  const request = composerInput(current);
  expect(request.imageReferences).toEqual([png]);
  expect(request.imageAspectRatio).toBe("auto");
  expect(request.description).toContain("tgt_bbox");
});
it("builds a source-conditioned Comfy edit graph without sending it to a text-only graph", () => {
  const input = composerInput({
    ...initialComposer,
    generator: "image",
    model: "flux-3-klein",
    description: "A blue object",
    imageReferences: [png],
  });
  const { template, values } = workflowRun(
    "workflow/flux-3-klein-t2i",
    input,
    input.description,
  );
  const files = kleinFiles(input);
  expect(Object.keys(files)).toEqual(["reference-0"]);
  const graph = fillSlots(template.graph, template.slots, {
    ...values,
    "reference-0": "source.png",
  });
  expect(danglingLinks(graph)).toEqual([]);
  expect(graph["reference-latents"].inputs).toMatchObject({
    positive: ["18:4", 0],
    negative: ["18:5", 0],
    "images.image0": ["reference-0", 0],
  });
  expect(graph["18:7"].inputs.latent_image).toEqual(["reference-latents", 2]);
  expect(graph["18:4"].inputs.text).toEqual(["18:17", 0]);
  expect(graph["18:17"].inputs.value).toBe(input.description);
  expect(graph).not.toHaveProperty("18:11");
});
