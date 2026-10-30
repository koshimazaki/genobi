import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  initialComposer,
  composerInput,
  composerBlocked,
  type ComposerState,
} from "../src/useComposer";
import { validateInput } from "../server/validation";
import { composePrompt } from "../shared/presets";
import { imageBody } from "../shared/image";
import { selectionFor } from "../shared/registry";
import ImageWorkspace from "../src/components/ImageWorkspace";
import ComposerActions from "../src/components/ComposerActions";
import type { ImageReferences } from "../src/useImageReferences";

const source = `data:image/png;base64,${readFileSync(new URL("../docs/director-bundle/templates/poster-motion.png", import.meta.url)).toString("base64")}`;
const images = { loading: false, notice: "" } as ImageReferences;
function state(id: string): ComposerState {
  return {
    ...initialComposer,
    ...selectionFor(id)!,
    description: "A forest.",
    imageAspectRatio: "16:9",
    cameraEnabled: true,
    camera: { "shot-sizes": "wide", angles: "low-angle", movements: "orbit" },
    imageReferences: id === "flux-3-edit" ? [source] : [],
  };
}
it.each(["flux-3-klein", "flux-3-klein-api", "flux-3-image", "flux-3-edit"])(
  "%s shows and sends the same still framing without movement",
  (id) => {
    const held = state(id);
    const html = renderToStaticMarkup(
      <ImageWorkspace
        state={held}
        update={() => {}}
        images={images}
        onOpenCamera={() => {}}
      />,
    );
    const validated = validateInput(composerInput(held));
    const prompt = composePrompt(validated);
    expect(validated.cameraEnabled).toBe(true);
    expect(validated.camera?.movements).toBeNull();
    for (const text of [
      "Wide shot with space around the subject.",
      "Low angle looking up at the subject.",
    ]) {
      expect(html).toContain(text);
      expect(prompt).toContain(text);
    }
    expect(html).toContain('aria-label="Edit camera direction"');
    expect(html).not.toContain("Slow orbit");
    expect(prompt).not.toContain("orbit");
    expect(imageBody(validated, prompt).prompt).toBe(prompt);
    expect(
      renderToStaticMarkup(
        <ComposerActions
          generator={held.generator}
          model={held.model}
          onOpenCamera={() => {}}
          onOpenAcoustic={() => {}}
        />,
      ),
    ).toContain("Camera controls");
  },
);
it("hides and omits camera sentences when camera is off", () => {
  const held = { ...state("flux-3-image"), cameraEnabled: false };
  expect(composePrompt(validateInput(composerInput(held)))).toBe("A forest.");
  expect(
    renderToStaticMarkup(
      <ImageWorkspace
        state={held}
        update={() => {}}
        images={images}
        onOpenCamera={() => {}}
      />,
    ),
  ).not.toContain("Edit camera direction");
});
it("retains the Add tile and accessible previews at the ten-reference limit", () => {
  const held = {
    ...state("flux-3-image"),
    imageReferences: Array(10).fill(source),
  };
  const html = renderToStaticMarkup(
    <ImageWorkspace
      state={held}
      update={() => {}}
      images={images}
      onOpenCamera={() => {}}
    />,
  );
  expect(html.match(/aria-label="Enlarge reference /g)).toHaveLength(10);
  expect(html).toMatch(/aria-label="Add reference images"[^>]*disabled/);
  expect(html).toContain('maxLength="12000"');
});
it("accepts long captions but blocks an oversized composed image layout", () => {
  const held = { ...state("flux-3-image"), description: "a".repeat(6000) };
  expect(validateInput(composerInput(held)).description).toHaveLength(6000);
  expect(composerBlocked(held, "", composePrompt(composerInput(held)))).toBe(
    false,
  );
  const long = { ...held, description: "a".repeat(12001) };
  expect(composerBlocked(long, "", long.description)).toBe(true);
  expect(() => validateInput(composerInput(long))).toThrow("12,000");
});
