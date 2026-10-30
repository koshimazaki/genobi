/** Portable provenance only. Never paths, URLs, file bytes or private labels. */
import { CHARACTER_MODELS } from "./character-catalog";
export const CREATURE_SHA256 =
  "464911455033e0d3637333a1e5bd9f8653c4ea295c3700a114bd498bbfe5670b";
export const LOCAL_MOTION_SOURCE = "local FBX; rights supplied by operator";
export interface CreatureReference {
  sha256: string;
  motions: Record<
    string,
    { sha256: string; source: typeof LOCAL_MOTION_SOURCE }
  >;
}
const HASH = /^[a-f0-9]{64}$/;
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid creature reference.");
  return v as Record<string, unknown>;
};
const hash = (v: unknown) => {
  if (typeof v !== "string" || !HASH.test(v))
    throw new Error("Invalid creature fingerprint.");
  return v;
};
export function parseCreatureReference(value: unknown): CreatureReference {
  const r = record(value);
  if (Object.keys(r).some((k) => !["sha256", "motions"].includes(k)))
    throw new Error("Unexpected creature reference field.");
  const motions = record(r.motions);
  const parsed: CreatureReference["motions"] = {};
  for (const [pose, value] of Object.entries(motions)) {
    if (!Object.hasOwn(CHARACTER_MODELS.creature.clips, pose))
      throw new Error("Unknown creature motion slot.");
    const motion = record(value);
    if (
      Object.keys(motion).some((k) => !["sha256", "source"].includes(k)) ||
      motion.source !== LOCAL_MOTION_SOURCE
    )
      throw new Error("Invalid creature motion reference.");
    parsed[pose] = { sha256: hash(motion.sha256), source: LOCAL_MOTION_SOURCE };
  }
  return { sha256: hash(r.sha256), motions: parsed };
}
