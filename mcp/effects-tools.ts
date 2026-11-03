import { z } from "zod";
import type { ToolDefinition } from "./definition";

const presetId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const effectTools: ToolDefinition[] = [
  {
    name: "genobi_effects",
    title: "Genobi effect presets",
    description:
      "List the configurable Animations & Effects catalogue, or inspect presetId for exposed controls, defaults, source requirements, ordered layers and pinned module hashes. Uses the same catalogue as the 3D gallery and Editor. Apply with genobi_director_command's apply-effect-preset using a fresh instanceId and the current expectedRevision; effects treat the composition below, not an isolated clip. Never generates or spends.",
    inputSchema: { presetId: presetId.optional() },
    tags: ["agents", "mcp", "director"],
    docs: ["docs/effects-catalogue.md"],
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(api, args) {
      return api.get(
        `/api/effects${args.presetId === undefined ? "" : `?presetId=${encodeURIComponent(String(args.presetId))}`}`,
      );
    },
  },
  {
    name: "genobi_effect_variant",
    title: "Genobi effect variant",
    description:
      "Create a portable configured variant from presetId, name and parameters, or validate an imported variant. Returns bounded JSON containing control values and trusted module identities for the caller to save; does not persist anything on the server, apply an effect, execute imported code, or activate Taste. Reuse the returned variant with apply-effect-preset.",
    inputSchema: {
      action: z.enum(["create", "validate"]),
      presetId: presetId.optional(),
      name: z.string().min(1).max(80).optional(),
      parameters: z
        .record(
          z.string(),
          z.union([z.string().max(200), z.number().finite(), z.boolean()]),
        )
        .optional(),
      variant: z.record(z.string(), z.unknown()).optional(),
    },
    tags: ["agents", "mcp", "director"],
    docs: ["docs/effects-catalogue.md"],
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async run(api, args) {
      return api.post("/api/effects/variants", args);
    },
  },
];
