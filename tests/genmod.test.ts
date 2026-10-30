import { describe, expect, it } from "vitest";
import {
  GENMOD_SCHEMA,
  genmodFrames,
  newGenModRecipe,
  parseGenModRecipe,
} from "../shared/genmod/recipe";
import {
  genmodMaskRect,
  genmodPrompt,
  genmodVideoPass,
} from "../shared/genmod/plan";
import { swapInput } from "../src/director/remix-prompt";
import { boxFromAgent, subjectBox } from "../shared/genmod/detect";

const recipe = (extra: Record<string, unknown> = {}) => ({
  schema: GENMOD_SCHEMA,
  kind: "character",
  source: { assetId: "take-1", in: 0, out: 100 },
  route: "control",
  control: { guide: "pose", isolate: "the man" },
  change: "the man is now the orange robot from the reference",
  action: "A man confidently walks toward the camera while talking.",
  keep: ["camera", "performance"],
  audio: "keep",
  ...extra,
});
const masked = (extra: Record<string, unknown> = {}) =>
  recipe({
    route: "masked",
    control: undefined,
    mask: { region: [100, 300, 900, 700], dilation: 15 },
    ...extra,
  });

describe("Gen-Mod recipe", () => {
  it("accepts a control recipe and orders its keep list", () => {
    const r = parseGenModRecipe(
      recipe({ keep: ["performance", "camera"], change: "  a robot " }),
    );
    expect(r.keep).toEqual(["camera", "performance"]);
    expect(r.change).toBe("a robot");
    expect(r.control).toEqual({ guide: "pose", isolate: "the man" });
    expect(r).not.toHaveProperty("firstFrame");
    expect(r).not.toHaveProperty("mask");
  });

  it("fills a missing control from the kind and defaults the audio to the source's", () => {
    const r = parseGenModRecipe(
      recipe({ kind: "background", control: undefined, audio: undefined }),
    );
    expect(r.control).toEqual({ guide: "pose" });
    expect(r.audio).toBe("keep");
  });

  it("refuses unknown fields, so an editor typo cannot drop a setting", () => {
    expect(() => parseGenModRecipe(recipe({ dilaton: 4 }))).toThrow(
      "Unexpected",
    );
    expect(() =>
      parseGenModRecipe(
        recipe({ source: { assetId: "take-1", in: 0, out: 100, fps: 24 } }),
      ),
    ).toThrow("Unexpected");
    expect(() =>
      parseGenModRecipe(recipe({ control: { guide: "pose", strength: 1 } })),
    ).toThrow("Unexpected");
  });

  it("keeps each route's settings to that route", () => {
    expect(() =>
      parseGenModRecipe(
        recipe({ mask: { region: [0, 0, 500, 500], dilation: 1 } }),
      ),
    ).toThrow("control settings only");
    expect(() =>
      parseGenModRecipe(masked({ control: { guide: "pose" } })),
    ).toThrow("mask settings only");
    expect(() => parseGenModRecipe(masked({ mask: undefined }))).toThrow(
      "mask",
    );
  });

  it("refuses bad regions, ranges, dilation, guides, keep and text", () => {
    const region = (r: unknown) => masked({ mask: { region: r, dilation: 1 } });
    expect(() => parseGenModRecipe(region([900, 0, 100, 1000]))).toThrow(
      "region",
    );
    expect(() => parseGenModRecipe(region([0, 0, 1000, 1001]))).toThrow(
      "region",
    );
    expect(() =>
      parseGenModRecipe(
        masked({ mask: { region: [0, 0, 500, 500], dilation: 65 } }),
      ),
    ).toThrow("dilation");
    expect(() =>
      parseGenModRecipe(recipe({ source: { assetId: "t", in: 10, out: 18 } })),
    ).toThrow("at least 9 frames");
    expect(() =>
      parseGenModRecipe(recipe({ control: { guide: "normals" } })),
    ).toThrow("guide");
    expect(() =>
      parseGenModRecipe(recipe({ keep: ["camera", "camera"] })),
    ).toThrow("keep");
    expect(() => parseGenModRecipe(recipe({ change: " " }))).toThrow(
      "Describe",
    );
    expect(() => parseGenModRecipe(recipe({ action: "a\u0007b" }))).toThrow(
      "action",
    );
    expect(() => parseGenModRecipe(recipe({ audio: "music" }))).toThrow(
      "audio",
    );
    expect(() => parseGenModRecipe(recipe({ schema: "v0" }))).toThrow("schema");
  });

  it("starts each kind from its defaults", () => {
    const source = { assetId: "take-1", in: 0, out: 97 };
    const character = newGenModRecipe("character", source, "a robot");
    expect(character.control).toEqual({ guide: "pose" });
    const background = newGenModRecipe("background", source, "a neon street");
    expect(background.control).toEqual({ guide: "pose" });
    expect(background.keep).not.toContain("background");
    expect(newGenModRecipe("face", source, "her face").keep).toContain(
      "wardrobe",
    );
    expect(newGenModRecipe("edit", source, "he holds a banana").route).toBe(
      "control",
    );
  });
});

describe("Gen-Mod passes", () => {
  it("cuts the largest 8k+1 window inside the range", () => {
    expect(genmodFrames({ in: 0, out: 97 })).toBe(97);
    expect(genmodFrames({ in: 0, out: 100 })).toBe(97);
    expect(genmodFrames({ in: 5, out: 14 })).toBe(9);
    expect(genmodFrames({ in: 0, out: 8 })).toBe(0);
    expect(genmodFrames({ in: 0, out: 10_000 })).toBe(241);
  });

  it("grows the mask by the dilation and clamps it to the frame", () => {
    expect(
      genmodMaskRect({ region: [100, 250, 900, 750], dilation: 10 }, 360, 640),
    ).toEqual({ x: 80, y: 54, width: 200, height: 532 });
    expect(
      genmodMaskRect({ region: [0, 0, 1000, 1000], dilation: 64 }, 360, 640),
    ).toEqual({ x: 0, y: 0, width: 360, height: 640 });
    expect(() =>
      genmodMaskRect({ region: [0, 0, 10, 10], dilation: 0 }, 0, 640),
    ).toThrow();
  });

  it("writes the action, the change and the keep list, never a camera move", () => {
    const r = parseGenModRecipe(
      recipe({
        firstFrame: { assetId: "still" },
        change: "his head is a chicken's head.",
        keep: ["camera", "performance", "background"],
      }),
    );
    const prompt = genmodPrompt(r);
    expect(prompt).toMatch(/^A man confidently walks toward the camera/);
    expect(prompt).toContain(
      "His head is a chicken's head, as in the first frame.",
    );
    expect(prompt).toContain("every camera movement stay exactly");
    expect(prompt).toContain("original timing");
    expect(prompt).toContain("background stays as the first frame shows it");
    expect(prompt).not.toContain("lighting");
    expect(
      genmodPrompt(
        parseGenModRecipe(masked({ keep: ["background"], action: "" })),
      ),
    ).toBe(
      "The man is now the orange robot from the reference. Everything outside the marked region stays unchanged.",
    );
  });

  it("needs an approved first frame before any video pass", () => {
    expect(() =>
      genmodVideoPass(parseGenModRecipe(recipe()), { width: 360, height: 640 }),
    ).toThrow("first frame");
    const control = genmodVideoPass(
      parseGenModRecipe(
        recipe({
          firstFrame: { assetId: "still" },
          source: { assetId: "t", in: 3, out: 103 },
        }),
      ),
      { width: 360, height: 640 },
    );
    expect(control).toMatchObject({
      cut: { in: 3, out: 100 },
      frames: 97,
      firstFrame: "still",
      route: "control",
      control: { guide: "pose", isolate: "the man" },
      audio: "keep",
    });
    const pass = genmodVideoPass(
      parseGenModRecipe(masked({ firstFrame: { assetId: "still" } })),
      { width: 360, height: 640 },
    );
    expect(pass.route).toBe("masked");
    expect(pass).toHaveProperty("mask.width");
  });

  it("gives the Director's still pass face and background modes", () => {
    const face = swapInput("face", ["scene", "face"], [50, 400, 300, 600], "");
    expect(face.description).toContain("Replace only the face and hair");
    const place = swapInput(
      "background",
      ["scene", "place"],
      [0, 0, 1000, 1000],
      "",
    );
    expect(place.description).toContain("Keep the person from image 1");
    expect(place.description).toContain("place from image 2");
  });
});

describe("Gen-Mod automatic targeting", () => {
  const matte = (fill: (x: number, y: number) => boolean, size = 64) => {
    const m = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        m[(y * size + x) * 4 + 3] = fill(x, y) ? 255 : 0;
    return m;
  };

  it("boxes the subject on the 0–1000 grid with a margin", () => {
    const m = matte((x, y) => x >= 16 && x < 48 && y >= 8 && y < 64);
    expect(subjectBox(m, { size: 64, margin: 20 })).toEqual([
      105, 230, 1000, 770,
    ]);
    expect(subjectBox(m, { size: 64, margin: 0 })).toEqual([
      125, 250, 1000, 750,
    ]);
  });

  it("reports no subject for an empty or speck matte", () => {
    expect(
      subjectBox(
        matte(() => false),
        { size: 64 },
      ),
    ).toBeNull();
    expect(
      subjectBox(
        matte((x, y) => x === 3 && y === 3),
        { size: 64 },
      ),
    ).toBeNull();
    expect(() => subjectBox(new Uint8ClampedArray(10), { size: 64 })).toThrow(
      "smaller",
    );
  });

  it("gives a recipe region the parser accepts", () => {
    const region = subjectBox(
      matte((x) => x > 20 && x < 40),
      { size: 64 },
    )!;
    expect(() =>
      parseGenModRecipe(masked({ mask: { region, dilation: 15 } })),
    ).not.toThrow();
  });
});

describe("Gen-Mod boxes from an agent", () => {
  it("turns pixel and 0–1000 xyxy boxes into FLUX's top,left,bottom,right", () => {
    expect(
      boxFromAgent([128, 72, 640, 648], { width: 1280, height: 720 }),
    ).toEqual([100, 100, 900, 500]);
    expect(boxFromAgent([250, 100, 750, 900], "1000")).toEqual([
      100, 250, 900, 750,
    ]);
  });

  it("accepts corners in either order and clamps to the frame", () => {
    expect(boxFromAgent([1100, 900, 500, -20], "1000")).toEqual([
      0, 500, 900, 1000,
    ]);
  });

  it("refuses slivers and malformed boxes", () => {
    expect(() => boxFromAgent([100, 100, 105, 500], "1000")).toThrow(
      "too small",
    );
    expect(() =>
      boxFromAgent(
        [0, 0, Number.NaN, 10] as [number, number, number, number],
        "1000",
      ),
    ).toThrow("four numbers");
    expect(() =>
      boxFromAgent([0, 0, 10, 10], { width: 0, height: 10 }),
    ).toThrow("positive");
  });
});

describe("Gen-Mod audio route", () => {
  const audio = (extra: Record<string, unknown> = {}) =>
    recipe({ route: "audio", control: undefined, ...extra });

  it("takes frame 0 and the source's soundtrack, with no guide or mask", () => {
    const r = parseGenModRecipe(audio({ firstFrame: { assetId: "still" } }));
    expect(r).not.toHaveProperty("control");
    expect(r).not.toHaveProperty("mask");
    expect(genmodVideoPass(r, { width: 1280, height: 720 })).toMatchObject({
      route: "audio",
      audio: "keep",
      firstFrame: "still",
    });
  });

  it("refuses route settings and generated sound", () => {
    expect(() =>
      parseGenModRecipe(audio({ control: { guide: "pose" } })),
    ).toThrow("no control or mask");
    expect(() => parseGenModRecipe(audio({ audio: "generate" }))).toThrow(
      "own soundtrack",
    );
  });
});
