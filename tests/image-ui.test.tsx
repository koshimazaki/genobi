import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dragBox, imagePrompt, type ImageRegion } from "../src/image-regions";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import JobMedia from "../src/components/JobMedia";
import { imageExtension } from "../src/image-download";
import { heroMedia } from "../src/hero";
import type { Job } from "../shared/types";
const region: ImageRegion = {
  id: "region_1",
  box: [100, 200, 600, 800],
  action: "change",
  description: "a blue coat",
};
const input = composerInput({
  ...initialComposer,
  generator: "edit",
  model: "flux-3",
  description: "Recolor the coat",
  imageReferences: ["reference"],
  imageRegions: [region],
  imageAspectRatio: "16:9",
});
const job: Job = {
  ...input,
  imageReferences: undefined,
  imageReferenceCount: 1,
  id: "test",
  prompt: input.description,
  status: "Ready",
  createdAt: "2026-10-10",
  updatedAt: "2026-10-10",
  costEstimateUsd: 0.048,
  keyMode: "byo",
  resultUrl: "/api/clips/test",
  mediaType: "image",
};
describe("image UI contract", () => {
  it("normalizes reverse drags, clamps edges and refuses tiny selections", () => {
    expect(dragBox([800, 600], [200, 100])).toEqual([100, 200, 600, 800]);
    expect(dragBox([-50, -20], [1100, 1200])).toEqual([0, 0, 1000, 1000]);
    expect(dragBox([0, 0], [2, 5])).toBeNull();
  });
  it("uses source and target boxes for edits, layout boxes for generation", () => {
    const edited = imagePrompt("Edit", [{ ...region, action: "remove" }], true);
    expect(edited).toContain('"from":"ref_image_0"');
    expect(edited).toContain('"tgt_bbox":null');
    const layout = imagePrompt("Create", [region], false);
    expect(layout).toContain('"bbox":[100,200,600,800]');
    expect(layout).not.toContain('"src_bbox"');
  });
  it("parks unsupported regions without sending them or changing the source aspect", () => {
    // An edit keeps the source's own aspect, so the ratio is sent as `auto`.
    expect(input.imageAspectRatio).toBe("auto");
    expect(input.description).toBe("Recolor the coat");
    expect(input).not.toHaveProperty("imageRegions");
    const video = composerInput({
      ...initialComposer,
      imageReferences: ["private"],
      imageRegions: [region],
    });
    expect(video).not.toHaveProperty("imageReferences");
  });
  it("keeps automatic layout boxes square, and lets a Klein reference choose the aspect", () => {
    const layout = composerInput({
      ...initialComposer,
      generator: "image",
      model: "flux-3-klein-api",
      imageAspectRatio: "auto",
      imageRegions: [region],
    });
    // No reference: automatic layout boxes are square whatever the tray holds.
    expect(layout.imageAspectRatio).toBe("1:1");
    const edit = composerInput({
      ...initialComposer,
      generator: "image",
      model: "flux-3-klein-api",
      imageAspectRatio: "auto",
      imageReferences: ["wide-reference"],
      imageRegions: [region],
    });
    // A reference makes it an edit of that image, so `auto` follows its aspect.
    expect(edit.imageAspectRatio).toBe("auto");
  });
  it("restores recorded image settings without borrowing unrelated references", () => {
    const restored = composerReducer(
      { ...initialComposer, imageReferences: ["other"] },
      { type: "restore", job },
    );
    expect(restored.imageReferences).toEqual([]);
    expect(restored.imageRegions).toEqual([]);
    expect(restored.description).toBe(job.description);
  });
  it("uses an image element with no video playback or MP4 filename", () => {
    const html = renderToStaticMarkup(<JobMedia job={job} />);
    expect(html).toContain("<img");
    expect(html).not.toContain("<video");
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/webp")).toBe("webp");
  });
  it("does not show an unrelated video as the image result", () => {
    expect(
      heroMedia({
        generator: "image",
        catalogueId: null,
        runs: [],
        samples: [],
      }),
    ).toEqual({ job: undefined });
  });
});
