import { z } from "zod";
import {
  licenceMarkdown,
  licenceReport,
  tasteLibraries,
} from "../shared/licensing/report";
import { policies, purposes } from "../shared/licensing/types";
import type { UsagePreference } from "../shared/licensing/types";
import type { ToolDefinition } from "./definition";
import { tasteSources } from "../shared/licensing/taste-shelf";
export const licenceTools: ToolDefinition[] = [
  {
    name: "genobi_licences",
    title: "Genobi taste and licence check",
    description:
      "List curated creative libraries, or check a caller-supplied planned/used inventory against intended use and licence preference. Returns JSON and README-ready credits. Unknown components/models/assets require review. Advisory, not legal clearance or automatic generation enforcement. No provider call or spend.",
    inputSchema: {
      purpose: z.enum(purposes).optional(),
      policy: z.enum(policies).optional(),
      components: z
        .array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/))
        .max(100)
        .optional(),
      stage: z.enum(["planned", "used"]).default("planned"),
      versions: z
        .record(
          z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),
          z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/),
        )
        .optional()
        .describe(
          "Actual exact versions/commits, including dependencies, for a used inventory. Missing or changed versions require review.",
        ),
    },
    tags: ["agents", "mcp", "licences"],
    docs: ["docs/licence-strategy.md", "docs/credits/README.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(_api, args) {
      if (args.components === undefined)
        return {
          libraries: tasteLibraries,
          purposes,
          policies,
          tasteSources,
          selection:
            "All sources are included by default. Read genobi_context.tasteShelf for the linked owner's opt-outs and custom references. Inclusion is a reference preference, not a used-component inventory.",
        };
      if (!args.purpose || !args.policy)
        throw new Error(
          "State the intended use and licence preference before checking components.",
        );
      const report = licenceReport(
        { purpose: args.purpose, policy: args.policy } as UsagePreference,
        args.components as string[],
        (args.stage ?? "planned") as "planned" | "used",
        args.versions as Record<string, string> | undefined,
      );
      return { report, markdown: licenceMarkdown(report) };
    },
  },
];
