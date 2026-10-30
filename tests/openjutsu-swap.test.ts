import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { swapValues, swapWorkflow } from "../shared/comfy/openjutsu";
import { danglingLinks, fillSlots } from "../shared/comfy/slots";
import { workflowRun } from "../shared/comfy/runs";
import { isUnsent } from "../shared/comfy/workflow";
import { canonicalInput } from "../shared/idempotency";
import { swapFiles, swapPrompt } from "../shared/openjutsu";
import { validateInput } from "../server/validation";
import type { GenerateInput } from "../shared/types";

// Openjutsu's own tests (test/swap.test.ts at 70ec62d), against the copied
// graph and Genobi's slots, plus the swap request's validation.
const ref = `data:image/png;base64,${readFileSync(new URL("./fixtures/reference.png", import.meta.url)).toString("base64")}`;
const swapRequest = {
  generator: "video",
  model: "openjutsu-swap",
  description: "  keep the glasses  ",
  duration: 5,
  sourceId: "clip",
  imageReferences: [ref],
  swap: { start: 2.5, size: 768, seed: 42 },
};
const fill = (input: GenerateInput, anchor: boolean) =>
  fillSlots(swapWorkflow.graph, swapWorkflow.slots, {
    ...swapValues(input, input.description),
    clip: "clip.mp4",
    character: "character.png",
    ...(anchor ? { anchor: "anchor.png" } : {}),
  });

describe("the Openjutsu swap graph", () => {
  const input = validateInput(swapRequest);

  it("is Openjutsu's graph, byte for byte in content", () => {
    expect(swapWorkflow.graph["850"].inputs.lora_name).toBe(
      "h3_character_swap_v1.5.safetensors",
    );
    expect(danglingLinks(swapWorkflow.graph)).toEqual([]);
    expect(swapWorkflow.output).toEqual({ nodeId: "809", media: "video" });
    expect(swapWorkflow.hosts).toEqual(["deployment"]);
  });

  it("binds the clip, the character and the chosen part", () => {
    const graph = fill(input, false);
    expect(graph["30"].inputs.file).toBe("clip.mp4");
    expect(graph["9"].inputs.image).toBe("character.png");
    expect(graph.trim.inputs.video).toEqual(["30", 0]);
    expect(graph.trim.inputs.start_time).toBe(2.5);
    expect(graph.trim.inputs.duration).toBe(5);
    expect(graph["31"].inputs.video).toEqual(["trim", 0]);
    expect(graph["803"].inputs.source_video).toEqual(["trim", 0]);
  });

  it("asks PrepareVideo for the size as a number", () => {
    const small = validateInput({
      ...swapRequest,
      swap: { ...swapRequest.swap, size: 480 },
    });
    expect(fill(small, false)["31"].inputs.resolution).toBe(480);
    expect(fill(input, false)["31"].inputs.resolution).toBe(768);
    const nine = validateInput({ ...swapRequest, duration: 9 });
    expect(fill(nine, false)["31"].inputs.duration_seconds).toBe(9);
  });

  it("runs the v1.5 swap LoRA, the seed, and saves a video at 809", () => {
    const graph = fill(input, false);
    expect(graph["801"].inputs.seed).toBe(42);
    expect(graph["809"].inputs.video).toEqual(["808", 0]);
  });

  it("uses the first frame through a crop when there is one", () => {
    const anchored = validateInput({
      ...swapRequest,
      imageReferences: [ref, ref],
    });
    const graph = fill(anchored, true);
    expect(graph.anchor_image.inputs.image).toBe("anchor.png");
    expect(graph["803"].inputs.anchor).toEqual(["anchor_fit", 0]);
    expect(graph["803"].inputs.use_anchor).toBe(true);
    expect(String(graph["801"].inputs.prompt)).toMatch(/<Picture 2>/);
  });

  it("drops the first-frame nodes when there is none, leaving the template", () => {
    const graph = fill(input, false);
    expect(graph.anchor_image).toBeUndefined();
    expect(graph.anchor_fit).toBeUndefined();
    expect(graph["803"].inputs.anchor).toBeUndefined();
    expect(graph["803"].inputs.use_anchor).toBe(false);
    expect(danglingLinks(graph)).toEqual([]);
    expect(swapWorkflow.graph.anchor_image).toBeDefined();
    expect(String(graph["801"].inputs.prompt)).not.toMatch(/<Picture 2>/);
  });

  it("starts the prompt with the workflow's instruction, then the direction", () => {
    expect(swapPrompt("  keep the glasses  ", false)).toBe(
      "Replace the selected person in <Video 1> with the character in <Picture 1>. Preserve the source performance, scene and audio timing. keep the glasses",
    );
    expect(swapPrompt("", true)).toMatch(
      /Start from the first frame in <Picture 2>\.$/,
    );
    expect(swapPrompt("", true, ["hat", "red shirt"])).toMatch(
      /<Picture 2>\. Change only the hat and the red shirt on the person; keep their face, hair and the rest of their look from <Video 1>\.$/,
    );
  });

  it("sends the files under their slots, the first frame second", () => {
    const files = swapFiles(
      { ...input, imageReferences: [ref, ref] },
      new Uint8Array([1, 2, 3]),
    );
    expect(Object.keys(files)).toEqual(["clip", "character", "anchor"]);
    expect(files.clip.contentType).toBe("video/mp4");
    expect(Object.keys(swapFiles(input, new Uint8Array([1])))).toEqual([
      "clip",
      "character",
    ]);
  });

  it("refuses unsent on a host it cannot run on", () => {
    let error: unknown;
    try {
      workflowRun("workflow/openjutsu-swap", input, "x");
    } catch (caught) {
      error = caught;
    }
    expect(isUnsent(error)).toBe(true);
    expect(
      workflowRun(
        "workflow/openjutsu-swap",
        input,
        "x",
        undefined,
        "deployment",
      ).template.id,
    ).toBe("openjutsu-swap");
  });
});

describe("the swap request", () => {
  it("reads Openjutsu's settings and rounds the start", () => {
    const input = validateInput({
      ...swapRequest,
      swap: { start: 1.234, size: 480, seed: 7, items: ["hat"] },
    });
    expect(input).toMatchObject({
      model: "openjutsu-swap",
      description: "keep the glasses",
      duration: 5,
      cameraEnabled: false,
      swap: { start: 1.23, size: 480, seed: 7, items: ["hat"] },
    });
  });

  it("refuses what Openjutsu refuses", () => {
    for (const [patch, message] of [
      [{ duration: 4 }, /between 5 and 15/],
      [{ duration: 16 }, /between 5 and 15/],
      [{ swap: { ...swapRequest.swap, size: 1080 } }, /480 or 768/],
      [{ swap: { ...swapRequest.swap, seed: 1.5 } }, /whole-number seed/],
      [{ swap: { ...swapRequest.swap, seed: 2 ** 32 } }, /whole-number seed/],
      [{ swap: { size: 768 } }, /whole-number seed/],
      [{ description: "x".repeat(501) }, /500/],
      [{ imageReferences: [] }, /character/],
      [{ imageReferences: [ref, ref, ref] }, /character/],
      [{ sourceId: "" }, /clip/],
      [{ swap: { ...swapRequest.swap, items: ["a\u0000b"] } }, /items/],
      [{ swap: { ...swapRequest.swap, start: -1 } }, /starts/],
    ] as const)
      expect(() => validateInput({ ...swapRequest, ...patch })).toThrow(
        message,
      );
  });

  it("makes the part, size, seed and items part of replay", () => {
    const input = validateInput(swapRequest);
    const other = validateInput({
      ...swapRequest,
      swap: { ...swapRequest.swap, seed: 43 },
    });
    expect(canonicalInput(input)).not.toBe(canonicalInput(other));
    // A run without swap settings hashes as it did before they existed.
    const plain = { generator: "video", description: "x" } as GenerateInput;
    expect(JSON.parse(canonicalInput(plain))).toHaveLength(24);
  });
});
