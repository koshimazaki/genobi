import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FamilyModelSelector from "../src/components/FamilyModelSelector";
import ModeBadge from "../src/components/ModeBadge";
import { generators, generatorFoot } from "../src/generators";
import type { Generator } from "../shared/types";

const render = (generator: Generator) =>
  renderToStaticMarkup(
    <FamilyModelSelector
      generator={generator}
      model="flux-3"
      onChoose={() => {}}
      openOnly={false}
      onOpenOnlyChange={() => {}}
    />,
  );

describe("the two generators are named in one place", () => {
  // The model menu, the mode badge above the prompt and the composer foot all
  // read `src/generators.ts`. Before that, the badge and the foot spelled the
  // upscale tool differently from the menu they were describing, and the foot
  // spelled the video model itself.
  it("shows the shared name in the model menu and the mode badge", () => {
    for (const generator of ["video", "upscale"] as const) {
      expect(render(generator)).toContain(generators[generator].label);
      expect(
        renderToStaticMarkup(<ModeBadge generator={generator} />),
      ).toContain(generators[generator].label);
    }
  });

  it("shows the shared name in the composer foot, in both modes", () => {
    for (const generator of ["video", "upscale"] as const) {
      for (const mode of ["Precise", "Creative"] as const) {
        const foot = generatorFoot(generator, mode);
        expect(foot.startsWith(generators[generator].model)).toBe(true);
        expect(foot).toContain(generators[generator].label.split(" · ")[0]);
      }
    }
    // What each foot line says, so neither can drift from the model it names.
    expect(generatorFoot("video", "Precise")).toBe("FLUX 3 · native audio");
    // Audio is always on, so every video model's foot says so.
    expect(generatorFoot("video", "Precise", "ltx-2.5-akuspace")).toBe(
      "LTX-2.5 · Acoustic Space · native audio · open weights",
    );
    expect(generatorFoot("upscale", "Precise")).toBe(
      "FLUX Video Upscale · precise",
    );
    expect(generatorFoot("upscale", "Creative")).toBe(
      "FLUX Video Upscale · creative",
    );
  });

  it("uses BFL's own names for the two endpoints", () => {
    // /v1/flux-3-video, whose body mode is "t2v", and
    // /v1/flux-tools/video-upscale-v1, documented as FLUX Video Upscale.
    expect(generators.video.label).toBe("FLUX 3 · Text to video");
    expect(generators.upscale.label).toBe("FLUX Video Upscale");
    expect(generators.video.model).toBe("FLUX 3");
  });
});
