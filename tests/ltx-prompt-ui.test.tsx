import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import PromptInput from "../src/components/PromptInput";
import CameraDialog from "../src/components/CameraDialog";
import ComposedPreview from "../src/components/ComposedPreview";
import { defaultCamera, emptyCamera } from "../shared/camera";
import { emptyLight } from "../shared/light";
import { emptySlots, ltxSegments } from "../shared/ltx-prompt";
import type { VideoModel } from "../shared/types";

const prompt = (model: VideoModel, slots = emptySlots) =>
  renderToStaticMarkup(
    <PromptInput
      description="A pier at dawn"
      onChange={() => {}}
      cameraEnabled
      camera={{ ...emptyCamera, movements: "orbit" }}
      cameraEdits={{}}
      model={model}
      onOpenCamera={() => {}}
      slots={slots}
      onSlotsChange={() => {}}
      light={{ ...emptyLight, lighting: "neon-glow" }}
    />,
  );

describe("the LTX prompt parts on screen", () => {
  it("give LTX five tabs over the one field, with a counter, and FLUX none", () => {
    const ltx = prompt("ltx-2.5", { ...emptySlots, audio: "Gulls" });
    for (const name of [
      "Prompt, filled",
      "Scene",
      "Character",
      "Action",
      "Audio, filled",
    ])
      expect(ltx).toContain(`aria-label="${name}"`);
    expect(ltx.match(/<textarea/g)).toHaveLength(1);
    expect(ltx).toMatch(/aria-label="\d+ of 1,200 characters"/);
    // Light sits between the shot and the movement in the picker line.
    expect(ltx).toContain("A neon glow bathes the scene");
    const flux = prompt("flux-3", { ...emptySlots, audio: "Gulls" });
    expect(flux).not.toContain("Prompt parts");
    expect(flux).not.toContain("neon glow");
  });

  it("says plainly when the paragraph would be cut", () => {
    const long = "She walks slowly along the corridor. ".repeat(30);
    const html = prompt("ltx-2.5", { ...emptySlots, action: long });
    expect(html).toContain("prompt-count is-over");
    expect(html).toMatch(
      /Over by [\d,]+ characters\. The end of Action, Movement will be cut\./,
    );
  });

  it("labels every part of the preview and strikes through the cut", () => {
    const segments = ltxSegments({
      generator: "video",
      model: "ltx-2.5",
      description: "A pier",
      cameraEnabled: true,
      camera: defaultCamera,
      cameraEdits: {},
      acoustic: null,
      slots: { ...emptySlots, scene: "Fog" },
      light: emptyLight,
      lightEdits: {},
    });
    const html = renderToStaticMarkup(
      <ComposedPreview segments={segments} kept={20} />,
    );
    for (const label of ["Prompt", "Scene", "Movement"])
      expect(html).toContain(
        `<span class="composed-part__label">${label}</span>`,
      );
    expect(html).toContain('style="--part-color:var(--prompt-scene)"');
    expect(html).toContain('<del class="composed-part__cut"');
  });

  it("puts Light between Angles and Movements for LTX video, and nowhere else", () => {
    vi.stubGlobal("location", new URL("http://127.0.0.1/"));
    const dialog = (model: VideoModel, still = false) =>
      renderToStaticMarkup(
        <CameraDialog
          model={model}
          still={still}
          selected={defaultCamera}
          edits={{}}
          light={{ ...emptyLight, atmosphere: "fog" }}
          onApply={() => {}}
          onClose={() => {}}
        />,
      );
    const ltx = dialog("ltx-2.5");
    const order = [...ltx.matchAll(/role="tab"[^>]*aria-label="([^:]+):/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual(["Shot sizes", "Angles", "Light", "Movements"]);
    expect(ltx).toContain('aria-label="Light: Fog"');
    expect(ltx).toContain("A thin fog hangs in the air");
    expect(dialog("flux-3")).not.toContain("Light:");
    expect(dialog("ltx-2.5", true)).not.toContain("Light:");
    vi.unstubAllGlobals();
  });
});
