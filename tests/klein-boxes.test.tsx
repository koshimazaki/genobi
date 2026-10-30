import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ComposerActions from "../src/components/ComposerActions";
import ImageStage from "../src/components/ImageStage";
import {
  composerBlocked,
  composerInput,
  initialComposer,
} from "../src/useComposer";
import type { ImageReferences } from "../src/useImageReferences";
import type { VideoModel } from "../shared/types";

it.each(["flux-3-klein", "flux-3-klein-api", "flux-3"] as VideoModel[])(
  "offers box controls only for Klein: %s",
  (model) => {
    const state = { ...initialComposer, generator: "image" as const, model };
    const actions = renderToStaticMarkup(
      <ComposerActions
        {...state}
        onOpenCamera={() => {}}
        onOpenAcoustic={() => {}}
        onOpenBoxes={() => {}}
      />,
    );
    const stage = renderToStaticMarkup(
      <ImageStage
        state={state}
        update={() => {}}
        images={{ loading: false } as ImageReferences}
      />,
    );
    if (model === "flux-3") {
      expect(actions).not.toContain("Bounding boxes");
      expect(stage).not.toContain("+ Add box");
      expect(stage).not.toContain("Image region canvas.");
    } else {
      expect(actions).toContain("Bounding boxes");
      expect(stage).toContain("+ Add box");
      expect(stage).toContain("Image region canvas.");
    }
  },
);
it("does not send parked boxes or let them block another model", () => {
  const state = {
    ...initialComposer,
    generator: "image" as const,
    model: "flux-3" as const,
    description: "A tree",
    imageRegions: [
      {
        id: "tree",
        box: [0, 0, 500, 500] as [number, number, number, number],
        action: "change" as const,
        description: "",
      },
    ],
  };
  const input = composerInput(state);
  expect(input.description).toBe("A tree");
  expect(composerBlocked(state, "", "A tree")).toBe(false);
  expect(
    composerBlocked({ ...state, model: "flux-3-klein-api" }, "", "A tree"),
  ).toBe(true);
});
