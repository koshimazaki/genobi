import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SceneStatePreview } from "../src/world-builder/SceneStatePreview";
import { createMotionPreset } from "../src/world-builder/motion-presets";
import { evaluateScene } from "../src/world-builder/evaluate-scene";

describe("authored scene thumbnails", () => {
  it("keeps distinct banana and apple state pictures while the live plane holds banana", () => {
    const authored = createMotionPreset("fruit-audio-branches");
    const routed = structuredClone(authored);
    routed.motion!.morphControl!.enabled = true;
    routed.motion!.morphControl!.progress.position = 0;
    const banana = routed.motion!.stateKeys[0].frame;
    const apple = routed.motion!.stateKeys[2].frame;
    const thumbnail = (recipe: typeof authored, frame: number) =>
      renderToStaticMarkup(<SceneStatePreview recipe={recipe} frame={frame} />);
    const bananaCard = thumbnail(routed, banana);
    const appleCard = thumbnail(routed, apple);
    expect(bananaCard).toContain("<polygon");
    expect(appleCard).not.toBe(bananaCard);
    expect(bananaCard).toBe(thumbnail(authored, banana));
    expect(appleCard).toBe(thumbnail(authored, apple));
    expect(evaluateScene(routed, banana).objects).toEqual(
      evaluateScene(routed, apple).objects,
    );
    expect(routed.motion!.morphControl!.enabled).toBe(true);
  });
});
