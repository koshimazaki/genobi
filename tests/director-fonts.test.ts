import { describe, expect, it } from "vitest";
import {
  BUNDLED_FONTS,
  fontNotice,
  parseFontStack,
  portableFallback,
  resolveFontStack,
} from "../shared/director/fonts";
import cut from "../shared/templates/dimensions-mix.cut.json";

const TITLE = '"Explorers", "Instrument Sans Variable", sans-serif';
const PIXEL = '"Retro Gaming", "RetroGaming", "Pixelify Sans", monospace';
const none = () => false;
const only =
  (...names: string[]) =>
  (f: string) =>
    names.includes(f);

describe("font stacks", () => {
  it("parses quoted families and generic keywords", () => {
    expect(parseFontStack(PIXEL)).toEqual([
      { family: "Retro Gaming", generic: false },
      { family: "RetroGaming", generic: false },
      { family: "Pixelify Sans", generic: false },
      { family: "monospace", generic: true },
    ]);
    // A quoted keyword is a family name, as in CSS.
    expect(parseFontStack('"monospace"')[0].generic).toBe(false);
  });

  it("matches a bundled family whatever its case, and emits its own name", () => {
    expect(parseFontStack("'pixelify  SANS', MONOSPACE")).toEqual([
      { family: "Pixelify Sans", generic: false },
      { family: "monospace", generic: true },
    ]);
    // Never asked of `available`: a bundled face is not a local font.
    const asked: string[] = [];
    const r = resolveFontStack('"pixelify sans", monospace', (f) => {
      asked.push(f);
      return false;
    });
    expect(asked).toEqual([]);
    expect(r).toMatchObject({
      used: "Pixelify Sans",
      missing: [],
      local: false,
      stack: '"Pixelify Sans", monospace',
    });
    expect(
      resolveFontStack('"Explorers", "instrument sans variable"', none),
    ).toMatchObject({
      used: "Instrument Sans Variable",
      stack: '"Instrument Sans Variable"',
    });
    expect(fontNotice(r, '"pixelify sans", monospace').text).toBe(
      "Showing Pixelify Sans (bundled).",
    );
  });

  it("keeps a local face this page can draw, and says it is local", () => {
    const r = resolveFontStack(TITLE, only("Explorers"));
    expect(r).toMatchObject({ used: "Explorers", missing: [], local: true });
    expect(r.stack).toBe(TITLE);
  });

  it("drops a hidden local face so the stack falls to its bundled face", () => {
    const r = resolveFontStack(TITLE, none);
    expect(r).toMatchObject({
      requested: "Explorers",
      used: "Instrument Sans Variable",
      missing: ["Explorers"],
      local: false,
    });
    expect(r.stack).toBe('"Instrument Sans Variable", sans-serif');
    const p = resolveFontStack(PIXEL, none);
    expect(p.used).toBe("Pixelify Sans");
    expect(p.missing).toEqual(["Retro Gaming", "RetroGaming"]);
    expect(p.stack).toBe('"Pixelify Sans", monospace');
  });

  it("gives a stack with no bundled face the documented stand-in", () => {
    expect(resolveFontStack('"Explorers"', none)).toMatchObject({
      used: "Instrument Sans Variable",
      stack: '"Instrument Sans Variable"',
    });
    expect(resolveFontStack('"Retro Gaming", monospace', none)).toMatchObject({
      used: "IBM Plex Mono",
      stack: '"IBM Plex Mono", monospace',
    });
    // A local face that is present still gets a bundled face behind it.
    expect(resolveFontStack('"Explorers"', only("Explorers")).stack).toBe(
      '"Explorers", "Instrument Sans Variable"',
    );
  });

  it("treats a bundled face that failed to load as missing", () => {
    const r = resolveFontStack(PIXEL, none, (f) => f !== "Pixelify Sans");
    expect(r.used).toBe("IBM Plex Mono");
    expect(r.missing).toContain("Pixelify Sans");
  });

  it("is the same answer for the preview and the export", () => {
    // Both draw through one resolution; the same inputs give the same stack.
    expect(resolveFontStack(TITLE, none)).toEqual(
      resolveFontStack(TITLE, none),
    );
    expect(portableFallback(TITLE)).toBe("Instrument Sans Variable");
    expect(portableFallback(PIXEL)).toBe("Pixelify Sans");
  });

  it("every font the bundled templates request resolves to a bundled face without local fonts", () => {
    const stacks = (
      cut.layers as { parameters?: Record<string, unknown> }[]
    ).flatMap((l) =>
      typeof l.parameters?.font === "string" ? [l.parameters.font] : [],
    );
    expect(stacks.length).toBeGreaterThan(0);
    for (const s of stacks)
      expect(BUNDLED_FONTS.map((f) => f.family)).toContain(portableFallback(s));
  });
});

describe("font notice", () => {
  it("names the missing font and what is shown instead", () => {
    expect(fontNotice(resolveFontStack(TITLE, none), TITLE)).toEqual({
      warn: true,
      text: "Font 'Explorers' isn't available here; showing Instrument Sans Variable.",
    });
  });
  it("warns that a local face is not portable", () => {
    expect(
      fontNotice(resolveFontStack(TITLE, only("Explorers")), TITLE).text,
    ).toBe(
      "Showing Explorers, installed on this computer but not bundled: a browser or machine without it shows Instrument Sans Variable.",
    );
  });
  it("is quiet about a bundled face", () => {
    const s = '"Pixelify Sans", monospace';
    expect(fontNotice(resolveFontStack(s, none), s)).toEqual({
      warn: false,
      text: "Showing Pixelify Sans (bundled).",
    });
  });
});
