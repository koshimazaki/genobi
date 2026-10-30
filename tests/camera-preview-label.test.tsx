import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyCamera } from "../shared/camera";
import CameraPreview from "../src/scene/CameraPreview";

// The scene starts in an effect, so a server render shows the label alone.
const label = (html: string) => /aria-label="([^"]*)"/.exec(html)?.[1] ?? "";

describe("the preview's spoken label names the panel's terms", () => {
  it.each(["pull-back", "jib-down", "dolly-left"] as const)(
    "names the LTX-only move %s on an LTX model",
    (movement) => {
      const selection = { ...emptyCamera, movements: movement };
      const html = renderToStaticMarkup(
        createElement(CameraPreview, { selection, model: "ltx-2.5" }),
      );
      expect(label(html)).not.toContain("No camera direction");
    },
  );
});
