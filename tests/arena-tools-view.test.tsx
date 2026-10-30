import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProjectTools from "../src/arena/ProjectTools";

vi.mock("../src/studio/ShellContext", () => ({
  useShell: () => ({ visible: ["tools"] }),
}));
it("advanced editor exposes remix and export controls on its initial tab", () => {
  const html = renderToStaticMarkup(
    <ProjectTools advanced>
      <button>Remix generation</button>
      <button>Comfy export</button>
    </ProjectTools>,
  );
  expect(html).toContain('aria-pressed="true">Workflow tools');
  expect(html).toContain('class="dir-remix"><button>Remix generation');
  expect(html).not.toContain('class="dir-remix" hidden');
});
it("Project Tools still offers Arena by default outside the advanced editor", () => {
  const html = renderToStaticMarkup(
    <ProjectTools>
      <button>Comfy export</button>
    </ProjectTools>,
  );
  expect(html).toContain('aria-pressed="true">Arena');
});
