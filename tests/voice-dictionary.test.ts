import { describe, expect, it } from "vitest";
import {
  applyDictionary,
  cleanTranscript,
  dictionaryContext,
  normaliseNumbers,
  STUDIO_DICTIONARY,
  stripContextEcho,
} from "../shared/voice-dictionary";

// The heard → written list and the deterministic clean-up after the model.
describe("the voice dictionary", () => {
  it("gives the model each written word once, as a plain list", () => {
    expect(dictionaryContext(STUDIO_DICTIONARY)).toBe(
      "Genobi, Ninja, Klein, LTX, AKUSPACE, Comfy, ComfyUI, Comfy Cloud",
    );
  });

  it("replaces heard words, whole words only, ignoring case and hyphens", () => {
    expect(
      applyDictionary(
        "Ask genoby to render with l t x, then aku-space on comfy cloud.",
        STUDIO_DICTIONARY,
      ),
    ).toBe("Ask Genobi to render with LTX, then AKUSPACE on Comfy Cloud.");
    // Inside a longer word nothing changes.
    expect(applyDictionary("Klineberg", STUDIO_DICTIONARY)).toBe("Klineberg");
  });

  it("leaves vocabulary words that are also ordinary words alone", () => {
    expect(
      applyDictionary("A comfy sofa for a ninja.", STUDIO_DICTIONARY),
    ).toBe("A comfy sofa for a ninja.");
  });

  it("prefers the longest phrase and never replaces a replacement", () => {
    const entries = [
      { heard: "flux", written: "FLUX" },
      { heard: "flux two", written: "FLUX.2" },
      { heard: "FLUX.2", written: "never" },
    ];
    expect(applyDictionary("use flux two, not flux", entries)).toBe(
      "use FLUX.2, not FLUX",
    );
  });

  it("drops the context echoed back from a chunk with no speech", () => {
    const context = dictionaryContext(STUDIO_DICTIONARY);
    expect(
      stripContextEcho("Genobi, Ninja, Klein, LTX, AKUSPACE, Comfy.", context),
    ).toBe("");
    expect(stripContextEcho("Pan left. Genobi, Ninja, Klein", context)).toBe(
      "Pan left.",
    );
    expect(stripContextEcho("Open Genobi in Ninja.", context)).toBe(
      "Open Genobi in Ninja.",
    );
  });
});

describe("spoken numbers", () => {
  it.each([
    ["six point one", "6.1"],
    ["Use six point one seconds.", "Use 6.1 seconds."],
    ["LTX two point five", "LTX 2.5"],
    ["three point one four", "3.14"],
    ["4 point 5", "4.5"],
    ["zero point five", "0.5"],
    ["twenty four frames", "24 frames"],
    ["twenty-four", "24"],
    ["one hundred and twenty", "120"],
    ["two thousand and twenty six", "2026"],
    ["ten shots", "10 shots"],
    ["five seconds of orbit", "5 seconds of orbit"],
  ])("%s → %s", (spoken, written) => {
    expect(normaliseNumbers(spoken)).toBe(written);
  });

  it.each([
    "the one on the left",
    "two characters walk in",
    "one two three",
    "point five",
    "LTX-2 and FLUX 3",
  ])("leaves %s as said", (text) => {
    expect(normaliseNumbers(text)).toBe(text);
  });

  it("keeps an 'and' that does not join a number", () => {
    expect(normaliseNumbers("one hundred and the rest")).toBe(
      "100 and the rest",
    );
  });
});

describe("a transcript after the model", () => {
  it("applies words first, then numbers, and tidies spaces", () => {
    expect(
      cleanTranscript("  render with l t x at six point one   seconds "),
    ).toBe("render with LTX at 6.1 seconds");
  });
});
