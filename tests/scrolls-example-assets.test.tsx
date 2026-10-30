// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { addExampleToAssets } from "../src/scrolls/Examples";
import { scrollExamples } from "../src/scrolls/example-catalog";

describe("Scrolls example → Add to assets", () => {
  it("copies the served library file into the project under Project", async () => {
    const example = scrollExamples[0];
    const add = vi.fn(async () => ({
      assetId: "a1",
      added: true,
      use: "production" as const,
      filename: example.file,
    }));
    const added = await addExampleToAssets(example, add);
    expect(add).toHaveBeenCalledWith(
      `/scrolls/${example.file}`,
      example.file,
      "production",
    );
    expect(added.assetId).toBe("a1");
  });

  it("serves every catalogue example from the Scrolls folder", () => {
    for (const example of scrollExamples)
      expect(example.file).toMatch(/^[\w.-]+\.(png|jpe?g|webp)$/i);
  });
});
