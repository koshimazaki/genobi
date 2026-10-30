import { afterEach, describe, expect, it, vi } from "vitest";
import { studioStore } from "../src/studio/store";
import { assetFixture } from "./director-asset-fixture";
import { openTemplate } from "../src/template-gallery/open-template";
import { mixTemplates } from "../shared/templates/catalogue";
import { loadMixTemplate } from "../src/director/mix-template";
vi.mock("../src/director/house-template", () => ({
  loadHouseTemplate: vi.fn(async (template: { id: string }) => {
    const bundle = assetFixture();
    bundle.project.id = template.id;
    return bundle;
  }),
}));
const original = studioStore.getState();
afterEach(() => {
  studioStore.setState(original, true);
  vi.unstubAllGlobals();
});
describe("open gallery template", () => {
  it.each(mixTemplates)(
    "$name imports its full project media, never card encodes",
    async (template) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 404 }));
      vi.stubGlobal("fetch", fetch);
      await expect(loadMixTemplate(template)).rejects.toThrow(
        "Template media unavailable",
      );
      const urls = fetch.mock.calls.map(([url]) => url);
      expect(urls).toEqual(
        Object.values(template.mix!.media).map((m) => m.url),
      );
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((url) => !url.includes(".preview."))).toBe(true);
    },
  );
  it("keeps edited drafts when switching templates and opens without generation", async () => {
    await openTemplate("product-video");
    const first = studioStore.getState().director.bundle!;
    const edited = {
      ...first,
      project: { ...first.project, name: "My edited draft" },
    };
    studioStore.getState().actions.commit(edited, first);
    await openTemplate("character-piece");
    await openTemplate("product-video");
    expect(studioStore.getState().director.bundle?.project.name).toBe(
      "My edited draft",
    );
    expect(studioStore.getState().operations).toEqual({
      workingFile: false,
      playing: false,
      rendering: false,
    });
  });
  it("refuses switching during a render and rejects unknown templates", async () => {
    studioStore.getState().actions.operations({ rendering: true });
    await expect(openTemplate("product-video")).rejects.toThrow("finish first");
    expect(studioStore.getState().director.bundle).toBeUndefined();
    await expect(openTemplate("not-a-template")).rejects.toThrow("unavailable");
  });
});
