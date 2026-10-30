import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyseAudio } from "../shared/audio-analysis";
import { beatGrid } from "../shared/director/beat-grid";
import { BEAT_GRID_LIMITS } from "../shared/director/beat-grid-command";
import {
  applyCommand,
  parseCommand,
  type DirectorCopy,
} from "../shared/director/commands";
import type { Project } from "../shared/director/types";
import { applyEvent, pushCopy, readCopy } from "../src/director/project-copy";
import { validateProject } from "../src/director/validate";
import { clickTrack, RATE } from "./audio-signals";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

// set-beat-grid: the composition's bpm, beatOffsetSeconds and beatsPerBar,
// so an audio analysis report's `composition` applies as one command.
const copy = (): DirectorCopy => ({
  project: JSON.parse(
    readFileSync("docs/director-bundle/example/studio.json", "utf8"),
  ) as Project,
  prompt: "",
});
function ok(from: DirectorCopy, command: unknown) {
  const result = applyCommand(from, command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  expect(result.copy.project.revision).toBe(from.project.revision + 1);
  return result.copy;
}
const refusal = (command: Record<string, unknown>) => {
  try {
    parseCommand({ op: "set-beat-grid", ...command });
    return "";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("set-beat-grid", () => {
  it("applies an audio analysis report's composition fields as they are", () => {
    const report = analyseAudio(clickTrack(98, 0.37, 30), RATE);
    expect(report.beatFound).toBe(true);
    const next = ok(copy(), { op: "set-beat-grid", ...report.composition });
    expect(next.project.composition).toMatchObject(report.composition!);
    // The full fitted tempo is kept, not rounded.
    expect(next.project.composition.bpm).toBe(report.composition!.bpm);
    const grid = beatGrid(next.project.composition);
    expect(grid.origin).toBeCloseTo(
      report.composition!.beatOffsetSeconds * next.project.composition.fps,
      6,
    );
  });

  it("sets only the fields given; the others keep their values", () => {
    const before = copy();
    const offset = ok(before, { op: "set-beat-grid", beatOffsetSeconds: 1.3 });
    expect(offset.project.composition).toEqual({
      ...before.project.composition,
      beatOffsetSeconds: 1.3,
    });
    const bar = ok(offset, { op: "set-beat-grid", beatsPerBar: 3 });
    expect(bar.project.composition).toMatchObject({
      bpm: before.project.composition.bpm,
      beatOffsetSeconds: 1.3,
      beatsPerBar: 3,
    });
    // Layers, assets and the prompt are untouched.
    expect(bar.project.layers).toEqual(before.project.layers);
  });

  it("holds each field to the schema's bounds", () => {
    expect(refusal({})).toMatch(
      /needs one of bpm, beatOffsetSeconds, beatsPerBar/,
    );
    expect(refusal({ bpm: 19.9 })).toMatch(
      /bpm must be a number from 20 to 300/,
    );
    expect(refusal({ bpm: 301 })).toMatch(/from 20 to 300/);
    expect(refusal({ bpm: "120" })).toMatch(/bpm must be a number/);
    expect(refusal({ bpm: Infinity })).toMatch(/bpm must be a number/);
    expect(refusal({ beatOffsetSeconds: -0.01 })).toMatch(
      /beatOffsetSeconds must be a number from 0 to 3600/,
    );
    expect(refusal({ beatOffsetSeconds: 3600.5 })).toMatch(/0 to 3600/);
    expect(refusal({ beatsPerBar: 4.5 })).toMatch(
      /beatsPerBar must be a whole number from 1 to 16/,
    );
    expect(refusal({ beatsPerBar: 0 })).toMatch(/1 to 16/);
    expect(refusal({ beatsPerBar: 17 })).toMatch(/1 to 16/);
    // Only the beat grid: frame rate and length stay studio edits.
    expect(refusal({ fps: 24 })).toMatch(/set-beat-grid does not take fps/);
    expect(refusal({ bpm: 20, beatOffsetSeconds: 3600, beatsPerBar: 16 })).toBe(
      "",
    );
  });

  it("uses the bounds the bundle schema sets", () => {
    const schema = JSON.parse(
      readFileSync("docs/director-bundle/schema/project.schema.json", "utf8"),
    );
    const fields = schema.properties.composition.properties;
    for (const [key, { min, max, whole }] of Object.entries(BEAT_GRID_LIMITS))
      expect(fields[key]).toEqual({
        type: whole ? "integer" : "number",
        minimum: min,
        maximum: max,
      });
  });
});

describe("set-beat-grid through the project copy", () => {
  it("lands the same composition on the server and in the studio", async () => {
    const harness = await setup();
    const fetcher = ((input: string, init: RequestInit = {}) =>
      fetch(`${harness.base}${input}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          cookie: harness.cookie,
        },
      })) as typeof fetch;
    const bundle = base();
    await pushCopy(bundle, null, new Set(), fetcher);
    const command = {
      op: "set-beat-grid",
      bpm: 98.2047,
      beatOffsetSeconds: 1.3,
      beatsPerBar: 4,
    };
    const send = (body: unknown) =>
      fetcher(`/api/projects/${bundle.project.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const refused = await send({
      baseRevision: 1,
      command: { ...command, beatsPerBar: 0 },
    });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toMatch(
      /beatsPerBar must be a whole number from 1 to 16/,
    );
    expect((await send({ baseRevision: 1, command })).status).toBe(200);
    const next = applyEvent(bundle, {
      projectId: bundle.project.id,
      revision: 2,
      baseRevision: 1,
      source: "command",
      command: command as never,
    })!;
    const stored = await readCopy(bundle.project.id, bundle, fetcher);
    expect(stored.project.composition).toMatchObject({
      bpm: 98.2047,
      beatOffsetSeconds: 1.3,
      beatsPerBar: 4,
    });
    expect(JSON.stringify(next.project)).toBe(JSON.stringify(stored.project));
  });
});
