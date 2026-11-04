import { describe, expect, it } from "vitest";
import {
  applyCommand,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import { diffCopies } from "../shared/director/feedback";
import { retimeProject } from "../shared/director/retime";
import { lanes, reorderLane } from "../shared/director/tracks";
import type { Project } from "../shared/director/types";
import { directorCommandSchema } from "../mcp/director-command-schema";
import { validateProject } from "../src/director/validate";
import {
  agent,
  layer,
  ops,
  person,
  roundTrip,
} from "./director-feedback-fixture";

function apply(copy: DirectorCopy, command: unknown) {
  const result = applyCommand(copy, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  expect(result.copy.project.revision).toBe(copy.project.revision + 1);
  return result.copy;
}
const refusal = (copy: DirectorCopy, command: unknown) => {
  const result = applyCommand(copy, command);
  return result.ok ? "" : result.error;
};
const laneOrder = (p: Project) => lanes(p.layers).map((l) => l.id);

describe("Editor timing, name and order commands", () => {
  it("refuses malformed commands in both shared and MCP schemas", () => {
    for (const command of [
      ...[0, 121, 29.97, "30", null].map((fps) => ({ op: "set-fps", fps })),
      { op: "set-fps", fps: 24, durationFrames: 10 },
      ...[0, 1.5, -1, "90"].map((durationFrames) => ({
        op: "set-duration",
        durationFrames,
      })),
      { op: "rename-project" },
      { op: "rename-project", name: "" },
      { op: "rename-project", name: "x".repeat(121) },
      { op: "rename-layer", layerId: "Plate", name: "Shot" },
      { op: "rename-layer", layerId: "plate", name: 7 },
      ...[0, 1.5, 128, -128, "1"].map((by) => ({
        op: "reorder-layer",
        layerId: "pulse",
        by,
      })),
    ]) {
      expect(() => parseCommand(command)).toThrow();
      expect(directorCommandSchema.safeParse(command).success).toBe(false);
    }
    // A name made only of control characters is empty once they are removed.
    expect(() =>
      parseCommand({ op: "rename-project", name: "\x00\x1f\x7f" }),
    ).toThrow(/1 to 120/);
  });

  it("replaces control characters and trims names before storing them", () => {
    const after = apply(agent(), {
      op: "rename-layer",
      layerId: "plate",
      name: "  Orbit\x00plate\x1f2\x7f ",
    });
    expect(after.project.layers.find((l) => l.id === "plate")!.name).toBe(
      "Orbit plate 2",
    );
    const renamed = apply(agent(), {
      op: "rename-project",
      name: "Signal\nstudies / 02",
    });
    expect(renamed.project.name).toBe("Signal studies / 02");
    expect(renamed.project.layers).toEqual(agent().project.layers);
  });

  it("retimes exactly as the transport does, locked clips and notes included", () => {
    const from = agent();
    from.project.notes = [{ id: "cue", frame: 179, text: "Last frame" }];
    const after = apply(from, { op: "set-fps", fps: 24 });
    expect(after.project).toEqual({
      ...retimeProject(from.project, 24),
      revision: from.project.revision + 1,
    });
    expect(after.project.composition).toMatchObject({
      fps: 24,
      durationFrames: 144,
    });
    // The locked bars keep their moment in seconds: 1 s to 5 s.
    expect(after.project.layers.find((l) => l.id === "labels")).toMatchObject({
      locked: true,
      startFrame: 24,
      durationFrames: 96,
    });
    expect(after.project.notes![0].frame).toBe(143);
    // No media clip asks its file for a frame past the end.
    for (const l of after.project.layers)
      if ("sourceStartFrame" in l) {
        const seconds = after.project.assets[l.assetId].durationSeconds ?? 0;
        expect(
          (l.sourceStartFrame + l.durationFrames) / 24,
        ).toBeLessThanOrEqual(seconds + 1e-6);
      }
  });

  it("lengthens freely and shortens only once clips and notes are inside", () => {
    const from = agent();
    expect(
      apply(from, { op: "set-duration", durationFrames: 240 }).project
        .composition.durationFrames,
    ).toBe(240);
    expect(refusal(from, { op: "set-duration", durationFrames: 120 })).toBe(
      "Pulse / 120 BPM ends at frame 180; move or trim it before shortening the composition",
    );
    expect(refusal(from, { op: "set-duration", durationFrames: 3601 })).toMatch(
      /at most 120 seconds: 3600 frames at 30 fps/,
    );
    // Every clip trimmed to end by frame 150 (the locked bars already do).
    let copy = from;
    for (const l of from.project.layers)
      if (!l.locked && l.startFrame + l.durationFrames > 150)
        copy = apply(copy, {
          op: "trim-clip",
          layerId: l.id,
          startFrame: l.startFrame,
          durationFrames: 150 - l.startFrame,
        });
    copy = apply(copy, {
      op: "add-note",
      noteId: "late",
      frame: 160,
      text: "Ending",
    });
    expect(refusal(copy, { op: "set-duration", durationFrames: 150 })).toMatch(
      /Note late is at frame 160/,
    );
    copy = apply(copy, { op: "delete-note", noteId: "late" });
    const short = apply(copy, { op: "set-duration", durationFrames: 150 });
    expect(short.project.composition.durationFrames).toBe(150);
    expect(short.project.layers).toEqual(copy.project.layers);
  });

  it("restacks whole tracks as Move up and Move down do, respecting locks", () => {
    const from = agent();
    const up = apply(from, { op: "reorder-layer", layerId: "pulse", by: 1 });
    expect(up.project.layers).toEqual(
      reorderLane(from.project.layers, "pulse", 1),
    );
    const far = apply(from, { op: "reorder-layer", layerId: "score", by: 3 });
    expect(laneOrder(far.project).slice(0, 4)).toEqual([
      "plate",
      "photo-1",
      "photo-2",
      "score",
    ]);
    const down = apply(far, { op: "reorder-layer", layerId: "score", by: -3 });
    expect(down.project.layers).toEqual(from.project.layers);
    expect(
      refusal(from, { op: "reorder-layer", layerId: "score", by: -1 }),
    ).toMatch(/can move down at most 0/);
    expect(
      refusal(from, { op: "reorder-layer", layerId: "title", by: 2 }),
    ).toMatch(/can move up at most 1/);
    expect(
      refusal(from, { op: "rename-layer", layerId: "labels", name: "Bars" }),
    ).toBe("Unlock Anime bars first");
    expect(
      refusal(from, { op: "reorder-layer", layerId: "labels", by: 1 }),
    ).toBe("Unlock Anime bars first");
  });

  it("clears a tempo field with null, so it reads as its default", () => {
    const cleared = apply(agent(), { op: "set-beat-grid", bpm: null });
    expect("bpm" in cleared.project.composition).toBe(false);
    expect(() => parseCommand({ op: "set-beat-grid", bpm: "none" })).toThrow(
      /or null to clear it/,
    );
  });
});

describe("feedback replays Editor timing, names and order", () => {
  it("replays a rate change, then the clip it moved", () => {
    const current = person((p) =>
      layer(retimeProject(p, 25), "photo-1", { startFrame: 40 }),
    );
    const diff = roundTrip(current);
    expect(ops(diff.commands)).toEqual(["set-fps", "move-clip"]);
    expect(diff.commands[0].label).toBe("frame rate 30 → 25 fps");
  });

  it("lengthens before a clip moves into the new time, shortens after", () => {
    const longer = person((p) =>
      layer(
        { ...p, composition: { ...p.composition, durationFrames: 240 } },
        "photo-2",
        { startFrame: 200 },
      ),
    );
    expect(ops(roundTrip(longer).commands)).toEqual([
      "set-duration",
      "move-clip",
    ]);
    const shorter = person((p) => ({
      ...p,
      composition: { ...p.composition, durationFrames: 150 },
      layers: p.layers.map((l) =>
        l.locked || l.startFrame + l.durationFrames <= 150
          ? l
          : { ...l, durationFrames: 150 - l.startFrame },
      ),
    }));
    const diff = roundTrip(shorter);
    expect(ops(diff.commands).at(-1)).toBe("set-duration");
    expect(diff.commands.at(-1)!.label).toBe("length 180 → 150 frames");
  });

  it("replays renames and a restack, and clears a tempo field", () => {
    const current = person((p) => {
      const { bpm: _bpm, ...composition } = p.composition;
      return {
        ...layer(p, "title", { name: "Signal title" }),
        name: "Signal studies / 02",
        composition,
        layers: reorderLane(
          layer(p, "title", { name: "Signal title" }).layers,
          "score",
          1,
        ),
      };
    });
    const diff = roundTrip(current);
    expect(ops(diff.commands)).toEqual([
      "set-beat-grid",
      "rename-project",
      "rename-layer",
      "reorder-layer",
    ]);
    expect(diff.commands[0]).toEqual({
      command: { op: "set-beat-grid", bpm: null },
      label: "beat grid bpm 120 → cleared",
    });
  });

  it("lists a rename and a shortening the agent's revision refuses", () => {
    const current = person((p) => ({
      ...layer(p, "labels", { name: "Bars" }),
      composition: { ...p.composition, durationFrames: 100 },
    }));
    const diff = diffCopies(agent(), current);
    expect(diff.unmapped.map((u) => `${u.kind} ${u.id} ${u.field}`)).toEqual([
      "layer labels name",
      "project signal-studies composition.durationFrames",
    ]);
    expect(diff.unmapped[0].reason).toContain("Unlock Anime bars first");
    expect(diff.unmapped[1].reason).toContain("ends at frame 180");
  });
});
