import { describe, expect, it } from "vitest";
import {
  CRF_FLOOR,
  MAX_BYTES,
  sizeStep,
} from "../scripts/lib/capture-size.mjs";

describe("a recorded take's size ceiling", () => {
  it("keeps a take under the limit, retries above it, fails at the floor", () => {
    expect(sizeStep(MAX_BYTES, 18)).toBe("keep");
    expect(sizeStep(MAX_BYTES + 1, 18)).toBe("retry");
    expect(sizeStep(MAX_BYTES + 1, CRF_FLOOR - 1)).toBe("retry");
    expect(sizeStep(MAX_BYTES + 1, CRF_FLOOR)).toBe("fail");
    expect(sizeStep(MAX_BYTES - 1, CRF_FLOOR)).toBe("keep");
  });
});
