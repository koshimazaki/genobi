import { z } from "zod";
import {
  DEVELOP_FILE,
  DEVELOP_MODES,
  type DevelopReceipt,
} from "../shared/development-session";
import type { ToolDefinition } from "./definition";

const inputSchema = {
  task: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .optional()
    .describe(
      "The person's request, verbatim, plus the surface and the acceptance check. Leave out with id",
    ),
  files: z
    .array(z.string().trim().regex(DEVELOP_FILE))
    .max(20)
    .optional()
    .describe("Repository-relative file hints, such as src/voice/Mic.tsx"),
  mode: z
    .enum(DEVELOP_MODES)
    .optional()
    .describe(
      "change: make it, run the checks, leave a diff on the branch. pr: also commit and open a pull request; only when the person asked for a commit or PR",
    ),
  id: z
    .string()
    .uuid()
    .optional()
    .describe("A Developer this session started, to read its status"),
};

/** Start (task and mode) or read (id), never both. */
const inputObject = z
  .strictObject(inputSchema)
  .superRefine((input, ctx) => {
    const reading = input.id !== undefined;
    const starting = input.task !== undefined || input.mode !== undefined;
    if (reading === starting || (starting && (!input.task || !input.mode)))
      ctx.addIssue({
        code: "custom",
        path: ["task"],
        message:
          "Give task and mode to start a Developer, or id to read one, not both.",
      });
    if (reading && input.files !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["files"],
        message: "Files belong to a start, not a read.",
      });
  })
  .meta({ oneOf: [{ required: ["task", "mode"] }, { required: ["id"] }] });

/** What the creative session tells the person, and where to follow it. */
function answer(receipt: DevelopReceipt) {
  return {
    ...receipt,
    follow:
      "Project Tools → Development lists this Developer with its progress and a Stop button; the Hermes live viewer (npm run supervisor) shows a Hermes Developer's conversation.",
  };
}

/**
 * The creative Genobi session hands a change to the studio itself (its UI, a
 * tool, a skill, a workflow, a node) to a Developer session: the runner the
 * person saved in setup, in a fresh worktree from origin/main. Never spends,
 * generates, deploys or pushes to main. See docs/agent-sessions.md.
 */
export const developTools: ToolDefinition[] = [
  {
    name: "genobi_develop",
    title: "Genobi develop",
    description:
      "Start a Developer session for a change to the studio itself (UI, a tool, a skill, a workflow, a node), or read one you started. Start: task (the person's words verbatim, the surface, the acceptance check), optional files hints, mode change (diff on a branch) or pr (also commit and open a pull request against main; only when the person asked). The runner is the one the person saved in setup; it works in a fresh git worktree from origin/main on a genobi/develop-… branch, runs the repository checks, never merges, deploys, pushes to main or spends. One Developer runs at a time. Read: id answers status, branch, worktree, pull request URL and the Developer's summary. Local studio only.",
    inputSchema,
    inputObject,
    tags: ["agents", "mcp", "studio"],
    docs: ["docs/agent-sessions.md", "docs/supervisor.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async run(api, input) {
      const args = inputObject.parse(input);
      if (args.id)
        return answer(
          await api.get<DevelopReceipt>(
            `/api/development/agent/${encodeURIComponent(args.id)}`,
          ),
        );
      return answer(
        await api.post<DevelopReceipt>("/api/development/agent", {
          role: "developer",
          task: args.task,
          mode: args.mode,
          ...(args.files?.length ? { files: args.files } : {}),
        }),
      );
    },
  },
];
