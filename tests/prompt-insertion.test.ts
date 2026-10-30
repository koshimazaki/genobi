import { describe, expect, it } from "vitest";
import {
  insertPromptReference,
  promptReferencePurpose,
} from "../src/director/prompt-insertion";
import { assetFixture } from "./director-asset-fixture";
import {
  readBrief,
  resolveBrief,
  writeBrief,
} from "../src/director/prompt-brief";

describe("prompt reference assignment", () => {
  it("replaces the typed mention and preserves surrounding words", () => {
    const result = insertPromptReference(
      "Use @ at sunset",
      "Image 1",
      4,
      5,
      "Character",
    );
    expect(result.text).toBe("Use Character: [Image 1]  at sunset");
    expect(result.text.slice(result.caret)).toBe(" at sunset");
  });
  it("keeps character and style assignment compatible with the existing brief", () => {
    const bundle = assetFixture();
    const assetId = Object.keys(bundle.project.assets)[0];
    for (const purpose of ["Character", "Style"] as const) {
      const { text } = insertPromptReference("", "Image 1", 0, 0, purpose);
      const next = writeBrief(bundle, {
        version: 1,
        text,
        references: [{ id: "ref-1", label: "Image 1", assetId }],
      });
      expect(readBrief(next).version).toBe(1);
      expect(resolveBrief(next).references[0].assetId).toBe(assetId);
      expect(promptReferencePurpose(text, "Image 1")).toBe(purpose);
      expect(next.project.assets[assetId].use).toBe(
        bundle.project.assets[assetId].use,
      );
    }
  });
  it("rejects an insertion beyond the existing text limit", () => {
    expect(() =>
      insertPromptReference("x".repeat(12000), "Font 1", 12000, 12000),
    ).toThrow("12,000");
  });
});
