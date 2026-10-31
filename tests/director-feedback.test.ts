import { setResolution } from "../shared/director/resolution";
import { describe, expect, it } from "vitest";
import type { DirectorCopy } from "../shared/director/commands";
import { diffCopies } from "../shared/director/feedback";
import { normalProject } from "../shared/director/feedback-residual";
import { moveToLane } from "../shared/director/tracks";
import type { Layer, Note, Project } from "../shared/director/types";
import {
  agent,
  at,
  layer,
  ops,
  person,
  replay,
  roundTrip,
} from "./director-feedback-fixture";

// The feedback diff: the person's changes since the agent's revision become
// Director commands that, applied to that revision, give the person's
// project back; whatever no command can do is listed, never dropped.
describe("feedback commands reproduce the person's project", () => {
  it("is empty when nothing changed", () => {
    expect(
      diffCopies(
        agent(),
        person((p) => p),
      ),
    ).toEqual({
      commands: [],
      unmapped: [],
    });
  });

  it("moves a clip, labelled in frames and beats", () => {
    const diff = roundTrip(
      person((p) => layer(p, "photo-1", { startFrame: 72 })),
    );
    expect(diff.commands).toEqual([
      {
        command: { op: "move-clip", layerId: "photo-1", startFrame: 72 },
        label:
          "Orbit 1 starts 12 frames (0.8 beats) later, at frame 72 (3 frames before bar 2 beat 2)",
      },
    ]);
  });

  it("trims either end, and a left trim keeps the in-point in step", () => {
    const right = roundTrip(
      person((p) => layer(p, "photo-2", { durationFrames: 20 })),
    );
    expect(right.commands[0]).toMatchObject({
      command: { op: "trim-clip", startFrame: 90, durationFrames: 20 },
      label: expect.stringContaining("ends 10 frames (0.67 beats) earlier"),
    });
    const left = roundTrip(
      person((p) =>
        layer(p, "plate", {
          startFrame: 10,
          durationFrames: 170,
          sourceStartFrame: 10,
        }),
      ),
    );
    expect(ops(left.commands)).toEqual(["trim-clip"]);
    expect(left.commands[0].label).toContain(
      "in-point 10 frames later (source frame 10)",
    );
  });

  it("slips an in-point with a trim and a move", () => {
    const diff = roundTrip(
      person((p) =>
        layer(p, "plate", { durationFrames: 150, sourceStartFrame: 12 }),
      ),
    );
    expect(ops(diff.commands)).toEqual(["trim-clip", "move-clip"]);
  });

  it("moves a clip onto another track", () => {
    const diff = roundTrip(
      person((p) => moveToLane(p, "photo-2", 95, "photo-1")),
    );
    expect(diff.commands).toEqual([
      expect.objectContaining({
        command: {
          op: "move-clip",
          layerId: "photo-2",
          startFrame: 95,
          track: "photo-1",
        },
        label: expect.stringContaining("onto track photo-1"),
      }),
    ]);
  });

  it("places, animates and stops animating", () => {
    const diff = roundTrip(
      person((p) =>
        layer(
          layer(layer(p, "title", { position: { x: 0, y: 40 } }), "photo-1", {
            motion: { scaleTo: 1.3, xTo: 0, yTo: 0, opacityTo: 1 },
          }),
          "photo-2",
          { motion: undefined, scale: 1.25 },
        ),
      ),
    );
    expect(diff.commands.map((c) => c.label)).toEqual([
      "Orbit 1 now moves to scale 1.3, x 0, y 0, opacity 1 by its end",
      "Orbit 2 scale 1 → 1.25, no longer moves",
      "title SIGNAL STUDIES moved down 40 px",
    ]);
    expect(diff.commands[1].command).toEqual({
      op: "set-placement",
      layerId: "photo-2",
      scale: 1.25,
      motion: null,
    });
  });

  it("sets parameters, text included", () => {
    const diff = roundTrip(
      person((p) =>
        layer(p, "title", {
          parameters: { text: "変身", color: "#e4e8ed", size: 56, bpm: 120 },
        }),
      ),
    );
    expect(diff.commands).toEqual([
      {
        command: {
          op: "set-parameters",
          layerId: "title",
          parameters: { text: "変身", size: 56 },
        },
        label:
          'title SIGNAL STUDIES text "SIGNAL STUDIES" → "変身", size 42 → 56',
      },
    ]);
  });

  it("adds clips and titles, a new file included", () => {
    const clip: Layer = {
      id: "insert",
      name: "Insert shot",
      kind: "video",
      assetId: "clip-2",
      sourceStartFrame: 30,
      fit: "contain",
      startFrame: 20,
      durationFrames: 40,
      locked: false,
      opacity: 1,
      position: { x: 0, y: 0 },
      scale: 1.2,
      rotationDegrees: 0,
    };
    const current = person((p) => {
      p.assets["clip-2"] = { ...p.assets.video, origin: "uploaded" };
      const title = p.layers.find((l) => l.id === "title")!;
      const second = {
        ...title,
        id: "title-2",
        name: "Second title",
        startFrame: 30,
        durationFrames: 60,
        parameters: {
          ...("parameters" in title && title.parameters),
          text: "二",
        },
      } as Layer;
      const above = p.layers.findIndex((l) => l.kind === "graphics");
      p.layers.splice(above, 0, clip);
      p.layers.splice(
        p.layers.findIndex((l) => l.kind === "filter"),
        0,
        second,
      );
      return p;
    });
    const diff = diffCopies(agent(), current);
    expect(ops(diff.commands)).toEqual([
      "add-clip",
      "add-graphic",
      "set-placement",
      "set-parameters",
    ]);
    expect(diff.commands[0]).toEqual({
      command: {
        op: "add-clip",
        layerId: "insert",
        assetId: "clip-2",
        track: "new",
        startFrame: 20,
        durationFrames: 40,
        name: "Insert shot",
        sourceStartFrame: 30,
      },
      label:
        "added video Insert shot (asset clip-2) on track insert at frame 20 (5 frames after bar 1 beat 2), 40 frames (2.67 beats) long, in-point source frame 30",
    });
    // The new file is the one change no command makes; the rest replay.
    expect(diff.unmapped).toEqual([
      expect.objectContaining({ kind: "asset", id: "clip-2", field: "asset" }),
    ]);
    const replayed = replay(agent(), current, diff.commands);
    expect(normalProject(replayed.project)).toEqual(
      normalProject(current.project),
    );
  });

  it("adds, rewords, resolves and deletes notes, and rewrites the prompt", () => {
    const note = (id: string, text: string, extra: Partial<Note> = {}) => ({
      id,
      frame: 30,
      text,
      author: "person" as const,
      createdAt: at,
      ...extra,
    });
    const from = {
      ...agent(),
      project: {
        ...agent().project,
        notes: [
          note("keep", "Fine"),
          note("old", "Remove me"),
          note("words", "Lower"),
        ],
      },
    };
    const current: DirectorCopy = {
      prompt: "Faster, on the kick",
      project: {
        ...from.project,
        revision: 3,
        notes: [
          note("keep", "Fine", { resolved: true }),
          note("words", "Lower, by a beat", { layerId: "title" }),
          note("new", "Extend this title by a beat", { frame: 45 }),
        ],
      },
    };
    const diff = roundTrip(current, from);
    expect(ops(diff.commands)).toEqual([
      "set-prompt",
      "delete-note",
      "delete-note",
      "resolve-note",
      "add-note",
      "add-note",
    ]);
    expect(diff.commands.at(-1)!.label).toBe(
      'note at frame 45 (on bar 1 beat 4): "Extend this title by a beat"',
    );
    expect(diff.commands[4].label).toBe(
      'note at frame 30 (on bar 1 beat 3) on title SIGNAL STUDIES: "Lower, by a beat"',
    );
  });
});

describe("what no command expresses is listed, never dropped", () => {
  it("maps removal, mute and gain while listing renamed and protected fields", () => {
    const current = person((p) => {
      const q = layer(
        layer(layer(p, "score", { gain: 0.5, name: "Song" }), "pulse", {
          muted: true,
          locked: true,
        }),
        "labels",
        { startFrame: 40 },
      );
      return {
        ...q,
        composition: {
          ...setResolution(q, { width: 480, height: 360 }).composition,
          bpm: 98,
        },
        layers: q.layers.filter((l) => l.id !== "photo-2"),
      };
    });
    const diff = diffCopies(agent(), current);
    const listed = diff.unmapped.map((u) => `${u.kind} ${u.id} ${u.field}`);
    expect(listed).toEqual(
      expect.arrayContaining([
        "layer score name",
        "layer pulse locked",
        "layer labels timing",
      ]),
    );
    expect(listed).toHaveLength(3);
    const locked = diff.unmapped.find((u) => u.id === "labels")!;
    expect(locked.reason).toContain("Unlock Anime bars first");
    expect(diff.unmapped.every((u) => u.reason && u.label)).toBe(true);
    // Both resolution and tempo are commands.
    expect(diff.commands).toEqual([
      {
        command: { op: "set-resolution", width: 480, height: 360 },
        label: "resolution 640 × 360 → 480 × 360",
      },
      {
        command: { op: "set-beat-grid", bpm: 98 },
        label: "beat grid bpm 120 → 98",
      },
      {
        command: { op: "remove-clip", layerId: "photo-2" },
        label: "removed image Orbit 2",
      },
      {
        command: { op: "set-gain", layerId: "score", gain: 0.5 },
        label: "Pulse / 120 BPM gain 1 → 0.5",
      },
      {
        command: { op: "set-muted", layerId: "pulse", muted: true },
        label: "p5 rings muted/hidden",
      },
    ]);
  });

  it("lists a recipe no layer uses yet, and a restacked layer", () => {
    const current = person((p) => {
      const title = p.layers.find((l) => l.id === "title")!;
      const caption = {
        ...title,
        id: "caption-1",
        moduleId: "caption",
      } as Layer;
      const layers = p.layers.filter((l) => l.id !== "pulse");
      layers.splice(layers.findIndex((l) => l.id === "title") + 1, 0, caption);
      layers.splice(
        layers.findIndex((l) => l.id === "finish"),
        0,
        p.layers.find((l) => l.id === "pulse")!,
      );
      return { ...p, layers };
    });
    const diff = diffCopies(agent(), current);
    expect(diff.unmapped.map((u) => `${u.kind} ${u.id} ${u.field}`)).toEqual([
      "layer caption-1 layer",
      "project signal-studies layer order",
    ]);
    expect(diff.unmapped[0].reason).toContain("No layer uses caption yet");
  });
});

describe("beat labels", () => {
  const offset = (seconds: number) => (p: Project) => ({
    ...p,
    composition: { ...p.composition, beatOffsetSeconds: seconds },
  });
  const moved = (seconds: number) => {
    const from = { ...agent(), project: offset(seconds)(agent().project) };
    const current = person((p) =>
      layer(offset(seconds)(p), "photo-1", { startFrame: 63 }),
    );
    return roundTrip(current, from).commands[0].label;
  };

  it("counts bars from the grid's offset", () => {
    expect(moved(0.1)).toBe(
      "Orbit 1 starts 3 frames (0.2 beats) later, at frame 63 (on bar 2 beat 1)",
    );
    expect(moved(0)).toBe(
      "Orbit 1 starts 3 frames (0.2 beats) later, at frame 63 (3 frames after bar 2 beat 1)",
    );
  });

  it("says frames only when the composition has no tempo", () => {
    const untimed = (p: Project) => {
      const { bpm: _bpm, ...composition } = p.composition;
      return { ...p, composition };
    };
    const from = { ...agent(), project: untimed(agent().project) };
    const current = person((p) =>
      layer(untimed(p), "photo-1", { startFrame: 63 }),
    );
    expect(roundTrip(current, from).commands[0].label).toBe(
      "Orbit 1 starts 3 frames later, at frame 63",
    );
  });

  it("names a recipe swapped for another registered definition", () => {
    const from = agent();
    const current = person((p) => ({
      ...p,
      modules: { ...p.modules, title: p.modules.caption },
    }));
    const diff = diffCopies(from, current);
    expect(diff.unmapped).toContainEqual(
      expect.objectContaining({ kind: "recipe", id: "title" }),
    );
  });
});
