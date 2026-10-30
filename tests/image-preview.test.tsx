import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ImageStage from "../src/components/ImageStage";
import { initialComposer } from "../src/useComposer";
import type { Job } from "../shared/types";
import type { ImageReferences } from "../src/useImageReferences";

const result = {
  id: "forest",
  generator: "image",
  model: "flux-3-klein-api",
  status: "Ready",
  description: "Redwood forest",
  resultUrl: "/api/clips/forest",
  resultContentType: "image/jpeg",
} as Job;
const images = { loading: false } as ImageReferences;
const render = (patch: Partial<Job> = {}, edit = false) =>
  renderToStaticMarkup(
    <ImageStage
      state={{
        ...initialComposer,
        generator: edit ? "edit" : "image",
        model: edit ? "flux-3" : "flux-3-klein-api",
        imageReferences: edit ? ["data:image/png;base64,AA=="] : [],
      }}
      update={() => {}}
      images={images}
      result={{ ...result, ...patch }}
    />,
  );

it("shows the restored image in the main preview, with layout still accessible", () => {
  const html = render();
  expect(html).toContain('aria-label="Main preview"');
  expect(html).toContain('src="/api/clips/forest"');
  expect(html).toContain("Arrange layout");
  expect(html).not.toContain("Image editing stage");
});
it("does not replace an edit source with a previous generated result", () => {
  const html = render({}, true);
  expect(html).toContain("Image editing stage");
  expect(html).not.toContain('src="/api/clips/forest"');
});
it.each([
  { mediaAvailable: false as const },
  { status: "Error" as const },
  { resultUrl: undefined },
])("keeps the layout usable when no result can be shown", (patch) => {
  expect(render(patch)).toContain("Image editing stage");
});
