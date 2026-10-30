/**
 * The ids of the World Builder's named takes (`src/world-builder/named-takes.ts`
 * holds their recipes), kept here so the MCP tool and the templates name them
 * without loading the renderer's modules.
 */
export const NAMED_TAKE_IDS = ["falling-room"] as const;
export type NamedTakeId = (typeof NAMED_TAKE_IDS)[number];
