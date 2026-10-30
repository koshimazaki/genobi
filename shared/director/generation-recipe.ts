import { currentRoute } from "../legacy-route";
import type { Project } from "./types";

/** Public provenance allowlist; input/settings/job identity never cross it. */
export function publicGenerationRecipe(
  value: unknown,
): Project["generations"][number]["recipe"] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const held = value as Record<string, unknown>;
  // Older takes recorded `cloud` for what is now the workflow route.
  const v =
    typeof held.route === "string"
      ? { ...held, route: currentRoute(held.route) }
      : held;
  if (
    typeof v.id !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(v.id) ||
    !Number.isSafeInteger(v.version) ||
    (v.version as number) < 1 ||
    !["router", "workflow", "bfl"].includes(v.route as string) ||
    (v.location !== undefined &&
      !["local", "cloud", "deployment"].includes(v.location as string))
  )
    return undefined;
  return {
    id: v.id,
    version: v.version as number,
    route: v.route as "router" | "workflow" | "bfl",
    ...(v.location
      ? { location: v.location as "local" | "cloud" | "deployment" }
      : {}),
  };
}
