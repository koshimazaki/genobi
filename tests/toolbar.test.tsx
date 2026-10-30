import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ComposerToolbar from "../src/components/ComposerToolbar";
import ComposerActions from "../src/components/ComposerActions";
import AcousticDialog from "../src/components/AcousticDialog";
import GenerateButton from "../src/components/GenerateButton";
import { initialComposer, type ComposerState } from "../src/useComposer";
import type { Generator, VideoModel } from "../shared/types";

const state = (
  generator: Generator,
  model: VideoModel,
  patch: Partial<ComposerState> = {},
): ComposerState => ({
  ...initialComposer,
  generator,
  model,
  description: "A lighthouse at dusk.",
  openOnly: false,
  acoustic:
    model === "ltx-2.5-akuspace"
      ? { mode: "room", preset: "empty_club", level: "high" }
      : null,
  ...patch,
});
const toolbar = (held: ComposerState, credits: number | null = null) =>
  renderToStaticMarkup(
    <ComposerToolbar
      state={held}
      update={() => {}}
      estimate={1.29}
      estimateCredits={credits}
      action={
        <GenerateButton
          generator={held.generator}
          submitting={false}
          hasKey
          disabled={false}
          onSubmit={() => {}}
          onResume={() => {}}
        />
      }
    />,
  );
describe("the balanced toolbar", () => {
  it("offers a combined selector and the selected model without a separate Model field", () => {
    for (const held of [
      state("video", "flux-3"),
      state("video", "ltx-2.5"),
      state("upscale", "flux-3", { sourceId: "clip-1" }),
    ]) {
      const html = toolbar(held);
      expect(html).toContain('aria-label="Model family"');
      expect(html).toContain('aria-label="Change model:');
      expect(html).not.toContain('id="generator"');
      expect(html).not.toContain("parameters__row--model");
      expect(html).toContain('class="toolbar-action"');
    }
  });

  it("only shows controls supported by the chosen entry", () => {
    for (const model of ["ltx-2.5", "ltx-2.5-akuspace"] as const) {
      expect(toolbar(state("video", model))).toContain("acoustic-label");
      expect(toolbar(state("video", model))).not.toContain("draft-label");
    }
    expect(toolbar(state("video", "flux-3"))).toContain("draft-label");
    expect(toolbar(state("video", "ltx-2.5-pro"))).not.toContain(
      "acoustic-label",
    );
    const upscale = toolbar(state("upscale", "flux-3", { sourceId: "clip-1" }));
    expect(upscale).toContain("upscale-controls");
    expect(upscale).not.toContain("duration-label");
  });

  it("prices LTX in credits then dollars, FLUX in dollars", () => {
    expect(toolbar(state("video", "ltx-2.5"), 272)).toContain(
      '<div class="cost"><strong>272 cr</strong><span>≈ $1.29 / RUN</span></div>',
    );
    expect(toolbar(state("video", "flux-3"))).toContain(
      '<div class="cost"><strong>$1.29</strong><span>EST. / RUN</span></div>',
    );
  });
});

describe("Acoustic Space keeps its theme accent", () => {
  const actions = (generator: Generator, model: VideoModel) =>
    renderToStaticMarkup(
      <ComposerActions
        generator={generator}
        model={model}
        onOpenCamera={() => {}}
        onOpenAcoustic={() => {}}
      />,
    );
  const css = (file: string) =>
    readFileSync(path.resolve("src/styles", file), "utf8");
  /** The declarations of the first rule whose selector is exactly `selector`. */
  const rule = (source: string, selector: string) => {
    const start = source.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf("}", start));
  };

  it("shows the Acoustic space button only while the switch is on", () => {
    const on = actions("video", "ltx-2.5-akuspace");
    expect(on).toContain('class="camera-open acoustic-open text-button"');
    expect(on.indexOf("Acoustic space")).toBeLessThan(
      on.indexOf("Camera controls"),
    );
    for (const model of ["ltx-2.5", "ltx-2.5-pro", "flux-3"] as const) {
      expect(actions("video", model)).not.toContain("acoustic-open");
      expect(actions("video", model)).toContain("Camera controls");
    }
    expect(actions("upscale", "flux-3")).not.toContain("camera-open");
  });

  it("draws the button's rim and the selected level in the acoustic accent", () => {
    const acoustic = css("acoustic.css");
    // Two classes, so `.camera-open`'s lime in compact-studio.css cannot win.
    const button = rule(acoustic, ".camera-open.acoustic-open");
    expect(button).toContain("--rim: var(--acoustic)");
    expect(button).not.toContain("--accent");
    expect(rule(css("compact-studio.css"), ".camera-open")).toContain(
      "--rim: var(--accent)",
    );
    const level = rule(acoustic, ".acoustic-level.selected");
    expect(level).toContain("var(--acoustic)");
    expect(level).not.toContain("--accent");
    const dialog = renderToStaticMarkup(
      <AcousticDialog
        selected={{ mode: "room", preset: "empty_club", level: "high" }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );
    expect(dialog).toMatch(
      /class="acoustic-level selected" aria-pressed="true"/,
    );
  });
});
