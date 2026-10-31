import { describe, expect, it } from "vitest";
import { applyCommand, parseCommand } from "../shared/director/commands";
import type { DirectorCopy } from "../shared/director/commands";
import { directorCommandSchema } from "../mcp/director-command-schema";
import { duplicateLayer } from "../shared/director/duplicate";
import { splitLayer } from "../shared/director/split";
import { keepNotes } from "../shared/director/notes";
import { visualAt, active } from "../shared/director/types";
import { validateProject } from "../src/director/validate";
import { runDirectorCommand } from "../src/director/remix-commands";
import { executeStudioCommand } from "../src/studio/commands";
import { createStudioStore } from "../src/studio/store";
import { base } from "./house-template-fixtures";
import { agent, layer, roundTrip } from "./director-feedback-fixture";

function apply(copy: DirectorCopy, command: unknown) {
  const result = applyCommand(copy, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  expect(result.copy.project.revision).toBe(copy.project.revision + 1);
  return result.copy;
}

describe("basic timeline command contract", () => {
  it("rejects malformed commands in both shared and MCP schemas", () => {
    for (const command of [
      { op: "split-clip", layerId: "plate", frame: 90 },
      { op: "split-clip", layerId: "plate", frame: 1.5, newLayerId: "cut" },
      { op: "duplicate-clip", layerId: "plate", newLayerId: "../escape" },
      { op: "remove-clip", layerId: "plate", deleteMedia: true },
      { op: "set-muted", layerId: "plate", muted: "false" },
      { op: "set-muted", layerId: "plate", muted: true, locked: false },
      ...[-1, 2.1, NaN, Infinity, "1"].map((gain) => ({
        op: "set-gain",
        layerId: "score",
        gain,
      })),
    ]) {
      expect(() => parseCommand(command)).toThrow();
      expect(directorCommandSchema.safeParse(command).success).toBe(false);
    }
  });

  it("splits media and animated pictures exactly as the Editor does", () => {
    for (const [layerId, frame] of [
      ["plate", 67],
      ["score", 67],
      ["photo-1", 74],
    ] as const) {
      const before = agent();
      const after = apply(before, {
        op: "split-clip",
        layerId,
        frame,
        newLayerId: "cut",
      });
      expect(after.project).toEqual(
        splitLayer(before.project, layerId, frame, "cut"),
      );
      const source = before.project.layers.find((l) => l.id === layerId)!;
      for (
        let f = source.startFrame;
        f < source.startFrame + source.durationFrames;
        f++
      ) {
        const piece = after.project.layers.find(
          (l) => [layerId, "cut"].includes(l.id) && active(l, f),
        )!;
        if ("sourceStartFrame" in source && "sourceStartFrame" in piece)
          expect(piece.sourceStartFrame + f - piece.startFrame).toBe(
            source.sourceStartFrame + f - source.startFrame,
          );
        if ("opacity" in source && "opacity" in piece)
          expect(visualAt(piece, f).scale).toBeCloseTo(
            visualAt(source, f).scale,
            12,
          );
      }
      expect(before.project.revision).toBe(1);
    }
  });

  it("refuses cut boundaries, locks and existing clip/track identities", () => {
    const before = agent();
    before.project.layers.find((l) => l.id === "photo-1")!.track =
      "reserved-track";
    for (const frame of [0, 180])
      expect(() =>
        apply(before, {
          op: "split-clip",
          layerId: "plate",
          frame,
          newLayerId: "cut",
        }),
      ).toThrow(/inside/);
    for (const op of ["split-clip", "duplicate-clip"])
      for (const newLayerId of ["plate", "reserved-track"])
        expect(() =>
          apply(before, {
            op,
            layerId: "plate",
            newLayerId,
            ...(op === "split-clip" && { frame: 90 }),
          }),
        ).toThrow(/taken/);
    for (const command of [
      { op: "remove-clip", layerId: "labels" },
      { op: "split-clip", layerId: "labels", frame: 30, newLayerId: "cut" },
    ])
      expect(() => apply(before, command)).toThrow(/Unlock/);
    before.project.layers.find((l) => l.id === "score")!.locked = true;
    expect(() =>
      apply(before, { op: "set-gain", layerId: "score", gain: 0.5 }),
    ).toThrow(/Unlock/);
  });

  it("copies locked clips without changing them, using independent data and a new lane", () => {
    const before = agent();
    const source = before.project.layers.find((l) => l.id === "labels")!;
    const after = apply(before, {
      op: "duplicate-clip",
      layerId: "labels",
      newLayerId: "labels-copy",
    });
    const expected = duplicateLayer(before.project, "labels", "labels-copy");
    expect(after.project).toEqual({ ...expected, revision: 2 });
    expect(after.project.layers.find((l) => l.id === "labels")).toEqual(source);
    const copied = after.project.layers.at(-1)!;
    expect(copied).toMatchObject({ id: "labels-copy", locked: false });
    expect(copied.track).toBeUndefined();
    if ("parameters" in copied && "parameters" in source)
      expect(copied.parameters).not.toBe(source.parameters);
  });

  it("removes only the clip and keeps its notes, media and provenance", () => {
    const before = agent();
    before.project.notes = [
      {
        id: "review",
        layerId: "plate",
        frame: 30,
        text: "Keep the first moment",
      },
    ];
    const snapshot = structuredClone(before);
    const after = apply(before, { op: "remove-clip", layerId: "plate" });
    expect(after.project.layers.some((l) => l.id === "plate")).toBe(false);
    expect(after.project.notes).toEqual([
      { id: "review", frame: 30, text: "Keep the first moment" },
    ]);
    expect(after.project.assets).toBe(before.project.assets);
    expect(after.project.generations).toBe(before.project.generations);
    expect(after.project.generationPlans).toBe(before.project.generationPlans);
    expect(before).toEqual(snapshot);
  });

  it("mutes locked clips as the UI does and bounds gain to audio clips", () => {
    const before = agent();
    const muted = apply(before, {
      op: "set-muted",
      layerId: "labels",
      muted: true,
    });
    expect(muted.project.layers.find((l) => l.id === "labels")).toMatchObject({
      muted: true,
      locked: true,
    });
    expect(
      apply(muted, {
        op: "set-muted",
        layerId: "labels",
        muted: false,
      }).project.layers.find((l) => l.id === "labels")?.muted,
    ).toBe(false);
    for (const gain of [0, 0.5, 2])
      expect(
        apply(before, {
          op: "set-gain",
          layerId: "score",
          gain,
        }).project.layers.find((l) => l.id === "score"),
      ).toMatchObject({ gain });
    expect(() =>
      apply(before, { op: "set-gain", layerId: "plate", gain: 1 }),
    ).toThrow(/only audio/);
    for (const command of [
      { op: "remove-clip", layerId: "missing" },
      { op: "set-muted", layerId: "missing", muted: true },
      { op: "set-gain", layerId: "missing", gain: 1 },
      { op: "duplicate-clip", layerId: "missing", newLayerId: "copy" },
      { op: "split-clip", layerId: "missing", frame: 90, newLayerId: "cut" },
    ])
      expect(() => apply(before, command)).toThrow();
  });
});

describe("browser and feedback parity", () => {
  it("runs all five commands from the browser console with the same result and revision guard", async () => {
    for (const command of [
      { op: "remove-clip", layerId: "plate" },
      { op: "duplicate-clip", layerId: "plate", newLayerId: "copy" },
      { op: "split-clip", layerId: "plate", frame: 90, newLayerId: "cut" },
      { op: "set-muted", layerId: "labels", muted: true },
      { op: "set-gain", layerId: "score", gain: 0.25 },
    ]) {
      const bundle = base();
      const result = await runDirectorCommand(bundle, {
        ...command,
        revision: 1,
      });
      if (!("bundle" in result) || !result.bundle)
        throw new Error("missing bundle");
      expect(result.bundle.project).toEqual(
        apply({ project: bundle.project, prompt: "" }, command).project,
      );
      expect(result.bundle.files).toBe(bundle.files);
      await expect(
        runDirectorCommand(result.bundle, { ...command, revision: 1 }),
      ).rejects.toThrow(/changed/);
    }
  });

  it("keeps a clip removal undoable in the Studio store", async () => {
    const store = createStudioStore();
    const bundle = base();
    store.getState().actions.initialize(bundle);
    await executeStudioCommand(
      { op: "remove-clip", revision: 1, layerId: "plate" },
      undefined,
      store,
    );
    expect(
      store
        .getState()
        .director.bundle?.project.layers.some((l) => l.id === "plate"),
    ).toBe(false);
    store.getState().actions.undo();
    expect(store.getState().director.bundle?.project.layers).toEqual(
      bundle.project.layers,
    );
  });

  it("replays removals, mutes and gain changes in feedback without losing review notes", () => {
    const from = agent();
    from.project.notes = [
      { id: "review", frame: 30, layerId: "plate", text: "Keep this note" },
    ];
    const current = {
      ...from,
      project: keepNotes({
        ...layer(layer(from.project, "score", { gain: 0.5 }), "labels", {
          muted: true,
        }),
        layers: layer(layer(from.project, "score", { gain: 0.5 }), "labels", {
          muted: true,
        }).layers.filter((l) => l.id !== "plate"),
        revision: 2,
      }),
    };
    expect(roundTrip(current, from).commands.map((c) => c.command.op)).toEqual([
      "remove-clip",
      "set-gain",
      "set-muted",
    ]);
  });
});
