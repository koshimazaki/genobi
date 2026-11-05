import { AppError } from "../../server/errors";
import type { WorkflowPlan } from "../take";
import { templateById } from "./workflows";
import { parseGpuBox, type GpuBox } from "./gpu-box";
export interface Expectation {
  location?: "local" | "cloud" | "deployment";
  workflow?: string;
  /**
   * The GPU box the studio shows (`Genobi-Gpu-Box`), or `none` for Local: a
   * box and Local both run at `location: "local"`, so the location alone
   * cannot tell a stale tab from the box now selected.
   */
  box?: GpuBox | "none";
}

/** `none`, or `<port>:<name>` with the name URL-encoded. */
function readBox(value: unknown): GpuBox | "none" | undefined {
  if (value === undefined) return undefined;
  const refused = () =>
    new AppError(
      400,
      "The expected GPU box must be none or <port>:<name>.",
      "invalid_run_location",
    );
  if (value === "none") return "none";
  const match =
    typeof value === "string" ? /^(\d{4,5}):(.{1,160})$/.exec(value) : null;
  if (!match) throw refused();
  try {
    return parseGpuBox({
      name: decodeURIComponent(match[2]),
      port: Number(match[1]),
    });
  } catch {
    throw refused();
  }
}

export function readExpectation(
  location: unknown,
  workflow: unknown,
  box?: unknown,
): Expectation {
  const shownBox = readBox(box);
  if (
    location !== undefined &&
    location !== "local" &&
    location !== "cloud" &&
    location !== "deployment"
  )
    throw new AppError(
      400,
      "The expected run location must be local, cloud or deployment.",
      "invalid_run_location",
    );
  if (
    workflow !== undefined &&
    (typeof workflow !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(workflow))
  )
    throw new AppError(
      400,
      "The expected workflow is not a template id.",
      "workflow_mismatch",
    );
  return {
    ...(location ? { location } : {}),
    ...(workflow ? { workflow: workflow as string } : {}),
    ...(shownBox ? { box: shownBox } : {}),
  };
}
export function requireExpectedPlan(
  plan: WorkflowPlan,
  expected?: Expectation,
) {
  if (!expected || !plan.location) return;
  const pinned = Boolean(templateById(plan.workflow)?.template.hosts);
  if (
    (expected.location && !pinned && expected.location !== plan.location) ||
    (expected.workflow && expected.workflow !== plan.workflow) ||
    (expected.box && !pinned && !sameBox(expected.box, plan))
  )
    throw new AppError(
      409,
      "The run location or workflow changed since you chose it. Check them and try again; nothing was sent or charged.",
      "settings_changed",
    );
}

/** Whether the plan runs on the box the studio showed, or on none when it showed none. */
function sameBox(shown: GpuBox | "none", plan: WorkflowPlan) {
  if (shown === "none") return !plan.box;
  return (
    plan.box?.name === shown.name &&
    plan.box.url === `http://127.0.0.1:${shown.port}`
  );
}
