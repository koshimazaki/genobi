/**
 * World Builder's Space and Delete shortcuts belong to its own surface, so a
 * focused button in another panel keeps its key (PR 52 re-review).
 */
import { describe, expect, it } from "vitest";
import { withinSurface } from "../src/world-builder/useWorldShortcuts";

describe("World Builder shortcut scope", () => {
  const body = { name: "body" };
  const html = { name: "html" };
  const doc = { body, documentElement: html } as unknown as Document;
  const inside = { name: "World Builder canvas" };
  const plateButton = { name: "3D camera plate button" };
  const root = { contains: (n: unknown) => n === inside } as Pick<
    Node,
    "contains"
  >;
  const target = (t: object) => t as unknown as EventTarget;

  it("acts on keys from inside World Builder", () => {
    expect(withinSurface(target(inside), root, doc)).toBe(true);
  });

  it("acts when nothing in particular has focus", () => {
    expect(withinSurface(target(body), root, doc)).toBe(true);
    expect(withinSurface(target(html), root, doc)).toBe(true);
    expect(withinSurface(null, root, doc)).toBe(true);
  });

  it("leaves a focused control in another panel alone", () => {
    expect(withinSurface(target(plateButton), root, doc)).toBe(false);
  });

  it("does nothing before its surface has mounted", () => {
    expect(withinSurface(target(body), null, doc)).toBe(false);
  });
});
