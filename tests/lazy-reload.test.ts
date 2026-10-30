import { expect, it, vi } from "vitest";
import { isStaleChunk, reloadForStaleChunk } from "../src/lazy-reload";

const memory = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
};

it("recognises a stale chunk in each browser's words, and nothing else", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: http://127.0.0.1:4317/src/world-builder/WorldBuilder.tsx",
    "error loading dynamically imported module",
    "Importing a module script failed.",
  ])
    expect(isStaleChunk(new TypeError(message))).toBe(true);
  expect(isStaleChunk(new Error("Cannot read properties of undefined"))).toBe(
    false,
  );
  expect(isStaleChunk(undefined)).toBe(false);
});

it("reloads once, then lets the error show instead of looping", () => {
  const storage = memory(),
    reload = vi.fn();
  expect(reloadForStaleChunk(storage, reload, 1_000_000)).toBe(true);
  expect(reloadForStaleChunk(storage, reload, 1_010_000)).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
  // A later, separate failure (a new deploy) may reload again.
  expect(reloadForStaleChunk(storage, reload, 1_040_000)).toBe(true);
  expect(reload).toHaveBeenCalledTimes(2);
});

it("never reloads without storage to hold the guard", () => {
  const reload = vi.fn();
  expect(reloadForStaleChunk(undefined, reload)).toBe(false);
  const throwing = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota");
    },
  };
  expect(reloadForStaleChunk(throwing, reload)).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});
