// Program's first-frame status: shown only while the renderer has not drawn
// its first frame, never for other work that leaves a frame on screen
// (opening a bundle) or after a failed import kept the current project.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DirectorStage from "../src/director/DirectorStage";

const stage = (firstFrame: boolean, status: string, ready = false) =>
  renderToStaticMarkup(
    <DirectorStage
      canvas={() => {}}
      ready={ready}
      firstFrame={firstFrame}
      status={status}
    />,
  );

describe("Program's first-frame status", () => {
  it("covers the blank canvas until the first frame is drawn", () => {
    expect(stage(true, "Preparing layers…")).toContain(
      "Rendering the first frame…",
    );
  });
  it("is absent while a bundle opens over a drawn frame", () => {
    expect(stage(false, "Opening bundle…")).not.toContain("first frame");
  });
  it("is absent after a failed import kept the current project", () => {
    const html = stage(false, "Import failed · current project retained");
    expect(html).not.toContain("first frame");
    expect(html).toContain("Import failed · current project retained");
  });
  it("is absent once ready", () => {
    expect(stage(false, "Ready · local preview", true)).not.toContain(
      "first frame",
    );
  });
});
