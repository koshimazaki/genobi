import { isTerminal } from "./types";
import type { PartSetView } from "./upscale-parts";

/** A failed set can still hold paid work whose result needs collecting. */
export function shouldPollParts(set: PartSetView): boolean {
  if (["quoted", "declined", "joined"].includes(set.status)) return false;
  return (
    set.status === "running" ||
    set.status === "joining" ||
    set.parts.some((part) => part.job && !isTerminal(part.job.status))
  );
}
