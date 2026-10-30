import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ltxFrames, ltxWorkflowSize } from "../shared/comfy/ltx-frame";
import {
  akuspaceValues,
  akuspaceWorkflow,
  ltxWorkflow,
} from "../shared/comfy/akuspace";
import { fillSlots } from "../shared/comfy/slots";
import { entryFor, selectionFor } from "../shared/registry";
import { composerInput, initialComposer } from "../src/useComposer";
import { validateInput } from "../server/validation";
import { effectiveFrame } from "../shared/output-targets";
import GenerationControls from "../src/components/GenerationControls";
import type { AspectRatio, VideoModel, VideoResolution } from "../shared/types";

it("uses 193 synchronized video/audio frames for eight seconds, with no resolution cap", () => {
  expect(ltxFrames(8)).toBe(193);
  expect(ltxFrames(7)).toBe(169);
  for (const template of [akuspaceWorkflow, ltxWorkflow]) {
    const values = akuspaceValues(
      { duration: 8, aspectRatio: "1:1", resolution: "qhd" },
      "Forest",
    );
    const sent =
      template === ltxWorkflow
        ? Object.fromEntries(
            Object.entries(values).filter(([key]) => key !== "lora_strength"),
          )
        : values;
    const graph = fillSlots(template.graph, template.slots, sent);
    const frames =
      Number(graph["398:362"].inputs.value) *
        Number(graph["398:361"].inputs.value) +
      1;
    expect(frames).toBe(193);
    expect((frames - 1) % 8).toBe(0);
    expect(graph["398:356"].inputs.length).toEqual(["398:378", 1]);
    expect(graph["398:366"].inputs.frames_number).toEqual(["398:378", 1]);
    expect(graph["398:372"].inputs.value).toBe(1920);
    expect(graph["398:360"].inputs.value).toBe(1920);
  }
});
it("keeps both half-size sampling and final frames valid for every offered shape/tier", () => {
  const controls = entryFor("video", "ltx-2.5-open").controls;
  if (controls.kind !== "video") throw Error("Expected video controls");
  for (const aspect of controls.aspectRatios)
    for (const resolution of controls.resolutions) {
      const size = ltxWorkflowSize(aspect, resolution);
      expect(size.width % 64).toBe(0);
      expect(size.height % 64).toBe(0);
      expect((size.width / 2) % 32).toBe(0);
      expect((size.height / 2) % 32).toBe(0);
      const [w, h] = aspect.split(":").map(Number);
      expect(Math.abs(size.width / size.height - w / h)).toBeLessThan(0.15);
    }
});
it("preserves native square duration/geometry and records an explicit workflow route", () => {
  const held = {
    ...initialComposer,
    ...selectionFor("ltx-2-5-open")!,
    duration: 8,
    aspectRatio: "1:1" as AspectRatio,
    resolution: "qhd" as VideoResolution,
    description: "A forest.",
  };
  const input = validateInput(composerInput(held));
  expect(input).toMatchObject({
    model: "ltx-2.5-open",
    duration: 8,
    aspectRatio: "1:1",
    resolution: "qhd",
  });
  expect(entryFor("video", input.model).route).toBe("workflow");
  expect(effectiveFrame(entryFor("video", input.model), "fhd")).toEqual({
    width: 1920,
    height: 1088,
  });
  expect(entryFor("video", "ltx-2.5-pro").controls).toMatchObject({
    resolutions: ["hd", "fhd"],
  });
  expect(entryFor("video", "ltx-2.5").controls).toMatchObject({
    aspectRatios: ["16:9", "9:16"],
  });
});
it.each([
  "flux-3",
  "ltx-2.5",
  "ltx-2.5-pro",
  "ltx-2.5-open",
  "ltx-2.5-akuspace",
] as VideoModel[])(
  "%s has no Fast/Studio switch and shows actual LTX geometry",
  (model) => {
    const html = renderToStaticMarkup(
      <GenerationControls
        generator="video"
        model={model}
        duration={8}
        onDurationChange={() => {}}
        aspectRatio="16:9"
        onAspectRatioChange={() => {}}
        resolution="fhd"
        onResolutionChange={() => {}}
        cameraEnabled
        draft={false}
        onDraftChange={() => {}}
        onCameraEnabledChange={() => {}}
      />,
    );
    expect(html).not.toMatch(/run-mode|Finish at|>Studio</);
    if (model === "ltx-2.5-open" || model === "ltx-2.5-akuspace") {
      expect(html).toContain("193f");
      expect(html).toContain("1920 × 1088");
    } else if (model.startsWith("ltx")) expect(html).toContain("1920 × 1080");
  },
);
