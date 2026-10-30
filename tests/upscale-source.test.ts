import { describe, expect, it } from "vitest";
import {
  composerInput,
  initialComposer,
  upscaleSource,
} from "../src/useComposer";
import type { Job, Source } from "../shared/types";

const source = (
  id: string,
  origin: Source["origin"] = "generated",
): Source => ({
  id,
  origin,
  label: id,
  url: `/api/clips/${id}`,
  width: 1280,
  height: 720,
  duration: 5,
});
const job = (id: string, createdAt: string, patch: Partial<Job> = {}): Job => ({
  ...composerInput(initialComposer),
  id,
  createdAt,
  updatedAt: createdAt,
  status: "Ready",
  prompt: "A scene.",
  costEstimateUsd: 0.85,
  keyMode: "byo",
  ...patch,
});
const old = job("old", "2026-09-20T10:00:00Z");
const newest = job("new", "2026-09-20T11:00:00Z");

describe("default upscale source", () => {
  it("selects the newest saved generation regardless of history or source order", () => {
    const sources = [source("library", "sample"), source("new"), source("old")];
    const selected = upscaleSource("", [old, newest], sources);
    expect(selected?.id).toBe("new");
    expect(
      composerInput({
        ...initialComposer,
        generator: "upscale",
        sourceId: selected!.id,
      }).sourceId,
    ).toBe("new");
  });

  it("preserves an explicitly chosen gallery clip or upload", () => {
    const sources = [
      source("new"),
      source("library", "sample"),
      source("upload", "upload"),
    ];
    for (const id of ["library", "upload"])
      expect(upscaleSource(id, [newest], sources)?.id).toBe(id);
    // A missing explicit source must not silently submit a different clip.
    expect(upscaleSource("removed", [newest], sources)).toBeUndefined();
  });

  it("waits for Ready and source metadata, and excludes unavailable media", () => {
    const sources = [source("old"), source("new")];
    for (const patch of [
      { status: "Generating" as const },
      { status: "copying" as const },
      { status: "Error" as const },
      { mediaAvailable: false as const },
    ])
      expect(
        upscaleSource("", [old, { ...newest, ...patch }], sources)?.id,
      ).toBe("old");
    expect(upscaleSource("", [old, newest], [source("old")])?.id).toBe("old");
    expect(upscaleSource("", [old, newest], sources)?.id).toBe("new");
  });

  it("keeps first-run source selection empty rather than choosing a library clip", () => {
    expect(
      upscaleSource("", [], [source("library", "sample")]),
    ).toBeUndefined();
  });
});
