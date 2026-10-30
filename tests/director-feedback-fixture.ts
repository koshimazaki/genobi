import { expect } from "vitest";
import { applyCommand, type DirectorCopy } from "../shared/director/commands";
import {
  diffCopies,
  startingCopy,
  type LabelledCommand,
} from "../shared/director/feedback";
import { normalProject } from "../shared/director/feedback-residual";
import type { Layer, Project } from "../shared/director/types";
import { validateProject } from "../src/director/validate";
import { base } from "./house-template-fixtures";

// The feedback tests' agent revision, the person's edit and the round trip:
// the commands applied to the agent's revision give the person's project.
export const agent = (): DirectorCopy => ({
  project: base().project,
  prompt: "Agent brief",
});
export const at = "2026-10-21T09:30:00.000Z";

/** The person's project: an edit made the way the studio makes it. */
export function person(
  change: (p: Project) => Project,
  prompt = "Agent brief",
): DirectorCopy {
  const p = change(structuredClone(agent().project));
  return { project: { ...p, revision: p.revision + 1 }, prompt };
}
export const layer = (
  p: Project,
  id: string,
  patch: Partial<Layer>,
): Project => ({
  ...p,
  layers: p.layers.map((l) =>
    l.id === id ? ({ ...l, ...patch } as Layer) : l,
  ),
});

/** Apply the commands to the agent's revision, as an agent would. */
export function replay(
  from: DirectorCopy,
  to: DirectorCopy,
  list: LabelledCommand[],
) {
  let copy = startingCopy(from, to);
  for (const { command } of list) {
    const result = applyCommand(copy, command);
    if (!result.ok) throw new Error(`${command.op}: ${result.error}`);
    copy = result.copy;
  }
  validateProject(copy.project);
  return copy;
}
/** Every change mapped, and the commands give the person's project back. */
export function roundTrip(current: DirectorCopy, from = agent()) {
  const diff = diffCopies(from, current);
  expect(diff.unmapped).toEqual([]);
  const replayed = replay(from, current, diff.commands);
  expect(replayed.prompt).toBe(current.prompt);
  expect(normalProject(replayed.project)).toEqual(
    normalProject(current.project),
  );
  return diff;
}
export const ops = (list: LabelledCommand[]) => list.map((c) => c.command.op);
