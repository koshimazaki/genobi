import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  active,
  editLayer,
  localSeconds,
  visualAt,
  type Project,
  type Layer,
} from "../shared/director/types";
import { splitLayer } from "../shared/director/split";
import { timelinePatch } from "../shared/director/timeline";
import { validateProject } from "../src/director/validate";
const fixture = (): Project =>
  JSON.parse(readFileSync("docs/director-bundle/example/studio.json", "utf8"));

it("preserves every media source frame through a cut", () => {
  for (const kind of ["audio", "video"]) {
    const p = fixture(),
      l = p.layers.find((l) => l.kind === kind)!;
    const next = validateProject(splitLayer(p, l.id, 67, "new-cut"));
    const right = next.layers.find((l) => l.id === "new-cut")!;
    expect(next.layers.length).toBe(p.layers.length + 1);
    expect("sourceStartFrame" in right && right.sourceStartFrame).toBe(67);
    expect(next.layers.find((x) => x.id === l.id)?.durationFrames).toBe(67);
    expect(right.durationFrames).toBe(113);
  }
});
it("preserves each animated image pose, including single-frame cut halves", () => {
  for (const at of [61, 74, 89]) {
    const p = fixture(),
      l = p.layers.find((l) => l.id === "photo-1")!;
    const next = splitLayer(p, l.id, at, "new-cut");
    for (let f = l.startFrame; f < l.startFrame + l.durationFrames; f++) {
      const piece = next.layers.find(
        (x) => (x.id === l.id || x.id === "new-cut") && active(x, f),
      )!;
      if ("opacity" in l && "opacity" in piece)
        expect(visualAt(piece, f).scale).toBeCloseTo(visualAt(l, f).scale, 12);
    }
  }
});
it("preserves p5, Anime and shader clocks after repeated cuts and left trims", () => {
  for (const id of ["pulse", "title", "crt-pass"]) {
    const p = fixture(),
      l = p.layers.find((l) => l.id === id)!;
    const next = splitLayer(
      splitLayer(p, id, 45, "first-cut"),
      "first-cut",
      81,
      "second-cut",
    );
    validateProject(next);
    const right = next.layers.find((l) => l.id === "second-cut")!;
    expect(localSeconds(right, 90, 30)).toBe(localSeconds(l, 90, 30));
    const trimmed: Layer = {
      ...right,
      ...timelinePatch(next, right, "left", 3, 1, 0),
    } as Layer;
    expect(localSeconds(trimmed, 90, 30)).toBe(localSeconds(l, 90, 30));
  }
});
it("rejects locked, duplicate-ID, boundary and fractional cuts", () => {
  const p = fixture();
  for (const f of [0, 180, 1.5])
    expect(() => splitLayer(p, "title", f, "cut")).toThrow();
  expect(() => splitLayer(p, "title", 30, "title")).toThrow("Duplicate");
  const locked = p.layers.find((l) => l.locked)!;
  expect(() => splitLayer(p, locked.id, locked.startFrame + 1, "cut")).toThrow(
    "Unlock",
  );
});
it("mutes every kind without removing timing and allows only mute on locked layers", () => {
  const p = fixture();
  for (const l of p.layers) {
    const muted = validateProject(editLayer(p, l.id, { muted: true }));
    const next = muted.layers.find((x) => x.id === l.id)!;
    expect(active(next, next.startFrame)).toBe(false);
    expect(next).toEqual({ ...l, muted: true });
    expect(
      active(
        editLayer(muted, l.id, { muted: false }).layers.find(
          (x) => x.id === l.id,
        )!,
        l.startFrame,
      ),
    ).toBe(true);
  }
  const locked = p.layers.find((l) => l.locked)!;
  expect(() => editLayer(p, locked.id, { muted: true, startFrame: 0 })).toThrow(
    "Unlock",
  );
});
