import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { previewSha256 } from "../src/preview-crypto";

describe("HTTP design preview content hashes", () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 1024, 100003]) {
    it(`matches SHA-256 for ${length} bytes`, () => {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 71) % 256);
      expect(Buffer.from(previewSha256(bytes)).toString("hex")).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    });
  }
});
