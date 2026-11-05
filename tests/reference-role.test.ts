import { describe, expect, it } from "vitest";
import {
  briefRoleNotes,
  checkGenerationInput,
  INSPIRATION_INPUT_NOTICE,
  INSPIRATION_OPT_IN,
  INSPIRATION_RULE,
  inspirationSentence,
  mayBeGenerationInput,
  referenceRole,
} from "../shared/director/reference-role";
import {
  readBrief,
  resolveBrief,
  writeBrief,
} from "../src/director/prompt-brief";
import { writeAssetDrag } from "../src/director/asset-drag";
import { droppedInspiration } from "../src/studio/media-drop";
import { assetFixture } from "./director-asset-fixture";

describe("what an Inspiration is for", () => {
  it("maps a reference asset to the style role and production to production", () => {
    expect(referenceRole("reference")).toBe("style");
    expect(referenceRole("production")).toBe("production");
    expect(mayBeGenerationInput("production")).toBe(true);
    expect(mayBeGenerationInput("reference")).toBe(false);
  });

  it("states the rule once: inform the prompt, never a generation input", () => {
    for (const word of ["style", "palette", "layout", "mood", "structure"])
      expect(INSPIRATION_RULE).toContain(word);
    expect(INSPIRATION_RULE).toContain("image reference");
    expect(INSPIRATION_RULE).toContain("explicitly asks");
    expect(inspirationSentence("Inspiration 2")).toBe(
      "[Inspiration 2] is a style reference: describe what to take from it in the prompt; do not pass it as an image reference.",
    );
  });

  it("writes one note per Inspiration, none for production, fonts or missing assets", () => {
    const assets = {
      board: { use: "reference" as const },
      shot: { use: "production" as const },
    };
    expect(
      briefRoleNotes(
        [
          { label: "Image 1", assetId: "shot" },
          { label: "Inspiration 2", assetId: "board" },
          { label: "Font 1" },
          { label: "Inspiration 3", assetId: "gone" },
        ],
        assets,
      ),
    ).toEqual([inspirationSentence("Inspiration 2")]);
  });

  it("refuses an Inspiration as input, naming it, unless the request opted in", () => {
    const board = { assetId: "board", use: "reference" as const, label: "pin" };
    expect(() => checkGenerationInput(board, undefined)).toThrow(
      /board \(pin\) is an Inspiration/,
    );
    expect(() => checkGenerationInput(board, false)).toThrow(
      INSPIRATION_OPT_IN,
    );
    expect(() => checkGenerationInput(board, true)).not.toThrow();
    expect(() =>
      checkGenerationInput({ assetId: "shot", use: "production" }, undefined),
    ).not.toThrow();
  });
});

describe("the compiled brief carries each reference's role", () => {
  it("marks an Inspiration as style and says so in one sentence", () => {
    const base = assetFixture();
    const bundle = writeBrief(base, {
      version: 1,
      text: "Light [Image 1] the way [Inspiration 2] is lit.",
      references: [
        { id: "ref-1", label: "Image 1", assetId: "image-1" },
        { id: "ref-2", label: "Inspiration 2", assetId: "moodboard" },
      ],
    });
    expect(readBrief(bundle).references).toHaveLength(2);
    const brief = resolveBrief(bundle);
    expect(
      brief.references.map((r) => [r.label, r.role, r.use ?? null]),
    ).toEqual([
      ["Image 1", "production", "production"],
      ["Inspiration 2", "style", "reference"],
    ]);
    expect(brief.notes).toEqual([
      "[Inspiration 2] is a style reference: describe what to take from it in the prompt; do not pass it as an image reference.",
    ]);
  });

  it("adds no note for a brief that names only production media", () => {
    const bundle = writeBrief(assetFixture(), {
      version: 1,
      text: "Hold on [Image 1].",
      references: [
        { id: "ref-1", label: "Image 1", assetId: "image-1" },
        // Bound but no longer named in the text: not part of this run.
        { id: "ref-2", label: "Inspiration 1", assetId: "moodboard" },
      ],
    });
    expect(resolveBrief(bundle).notes).toEqual([]);
  });
});

describe("the person's own drag of an Inspiration", () => {
  function drag(bundle: ReturnType<typeof assetFixture>, assetId?: string) {
    const data = new Map<string, string>();
    const transfer = {
      types: [] as string[],
      getData: (type: string) => data.get(type) ?? "",
      setData: (type: string, value: string) => {
        data.set(type, value);
        transfer.types.push(type);
      },
      effectAllowed: "none",
    };
    if (assetId)
      writeAssetDrag(transfer as unknown as DataTransfer, bundle, assetId);
    return transfer;
  }

  it("is recognised so the tray can say the role changed for this run", () => {
    const bundle = assetFixture();
    expect(droppedInspiration(drag(bundle, "moodboard"), bundle)).toBe(true);
    expect(droppedInspiration(drag(bundle, "image-1"), bundle)).toBe(false);
    expect(droppedInspiration(drag(bundle), bundle)).toBe(false);
    expect(droppedInspiration(drag(bundle, "moodboard"), undefined)).toBe(
      false,
    );
    expect(INSPIRATION_INPUT_NOTICE).toBe(
      "Inspiration used as an image reference for this run",
    );
  });
});
