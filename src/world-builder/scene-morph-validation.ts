import { MOD_SOURCES } from "./mod-routes";
import type { SceneMorphControl } from "./scene-morph-control";

const fields = (v: unknown, allowed: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).every((key) => allowed.includes(key));
const finite = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const source = (v: unknown) =>
  typeof v === "string" && MOD_SOURCES.some((name) => name === v);
const fail = (): never => {
  throw new Error(
    "Invalid morph routing: use bounded independent axes and unique existing target states.",
  );
};

/** Reference-only data: no additional geometry, executable expressions or sources. */
export function validateMorphControl(
  input: unknown,
  stateIds: Set<string>,
): asserts input is SceneMorphControl {
  if (
    !fields(input, [
      "version",
      "enabled",
      "originStateId",
      "progress",
      "target",
    ]) ||
    input.version !== 1 ||
    typeof input.enabled !== "boolean" ||
    typeof input.originStateId !== "string" ||
    !stateIds.has(input.originStateId) ||
    !fields(input.progress, ["mode", "position", "source", "amount"]) ||
    typeof input.progress.mode !== "string" ||
    !["manual", "timeline"].includes(input.progress.mode) ||
    !finite(input.progress.position, 0, 1) ||
    !source(input.progress.source) ||
    !finite(input.progress.amount, 0, 2) ||
    !fields(input.target, ["position", "amount", "mode", "routes"]) ||
    !finite(input.target.position, 0, 1) ||
    !finite(input.target.amount, 0, 1) ||
    typeof input.target.mode !== "string" ||
    !["blend", "strongest"].includes(input.target.mode) ||
    !Array.isArray(input.target.routes) ||
    input.target.routes.length < 1 ||
    input.target.routes.length > 15
  )
    fail();
  const control = input as unknown as SceneMorphControl;
  const seen = new Set<string>([control.originStateId]);
  for (const route of control.target.routes) {
    if (
      !fields(route, ["stateId", "source", "amount", "enabled"]) ||
      typeof route.stateId !== "string" ||
      !stateIds.has(route.stateId) ||
      seen.has(route.stateId) ||
      !source(route.source) ||
      !finite(route.amount, 0, 2) ||
      typeof route.enabled !== "boolean"
    )
      fail();
    seen.add(route.stateId);
  }
}
