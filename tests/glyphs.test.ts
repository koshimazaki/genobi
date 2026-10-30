import { expect, it } from "vitest";
import { angleGlyphPosition } from "../src/components/camera-glyph-geometry";
it("places the camera above for high views and below for low views in SVG coordinates", () => {
  const eye = angleGlyphPosition(0);
  expect(angleGlyphPosition(35).y).toBeLessThan(eye.y);
  expect(angleGlyphPosition(85).y).toBeLessThan(angleGlyphPosition(35).y);
  expect(angleGlyphPosition(-25).y).toBeGreaterThan(eye.y);
  expect(angleGlyphPosition(-70).y).toBeGreaterThan(angleGlyphPosition(-25).y);
});
