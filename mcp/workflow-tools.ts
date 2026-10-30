import { z } from "zod";
import type { RunLocationState } from "../shared/comfy/run-location";
import type { WorkflowCatalogue } from "../shared/comfy/workflows";
import type { ToolDefinition } from "./definition";

// The run location and workflow swapping, through the same session settings
// the studio uses (`/api/settings` on the local server). Nothing here is paid
// or submitted; a quote taken before a change cannot be spent after it.

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const workflowTools: ToolDefinition[] = [
  {
    name: "genobi_run_location",
    title: "Genobi run location",
    description:
      "Read or set where this session's open workflows run: local (the ComfyUI on this machine, its own models, nothing charged) or cloud (Comfy Cloud, charged to the Comfy key). Both combines local open workflows with cloud API models, with no automatic cloud fallback. Without `location` it only reads, and reports whether a local ComfyUI answers. A quote taken before a change cannot be spent after it; ask for a new one.",
    inputSchema: {
      location: z
        .enum(["local", "cloud", "both"])
        .optional()
        .describe("Set the run location; omit to read it"),
    },
    tags: ["agents", "mcp", "workflows", "comfy"],
    docs: ["docs/run-location.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      return args.location === undefined
        ? api.get<RunLocationState>("/api/settings/run-location")
        : api.post<RunLocationState>("/api/settings/run-location", {
            location: args.location,
          });
    },
  },
  {
    name: "genobi_workflows",
    title: "Genobi workflows",
    description:
      "List the workflow templates behind each capability (text to video, image, upscale, acoustic space, layout to render) and which one each workflow model runs in this session. With checkLocal, also asks the local ComfyUI which node types and model files each template lacks there (free; nothing is submitted).",
    inputSchema: {
      checkLocal: z
        .boolean()
        .optional()
        .describe("Also check each template against the local ComfyUI"),
    },
    tags: ["agents", "mcp", "workflows", "comfy"],
    docs: ["docs/run-location.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      return api.get<WorkflowCatalogue>(
        args.checkLocal
          ? "/api/settings/workflows?check=local"
          : "/api/settings/workflows",
      );
    },
  },
  {
    name: "genobi_workflow_select",
    title: "Genobi workflow select",
    description:
      "Swap the workflow template behind a workflow model for this session, such as running Acoustic Space on ltx-2-5-t2v where the AKUSPACE LoRA is not installed. The template must serve the model's capability; genobi_workflows lists the choices. Choosing the default template switches back.",
    inputSchema: {
      entry: z
        .string()
        .regex(TEMPLATE_ID)
        .describe(
          "The model entry id from genobi_workflows, e.g. ltx-2-5-akuspace",
        ),
      template: z
        .string()
        .regex(TEMPLATE_ID)
        .describe("The template id to run behind it, e.g. ltx-2-5-t2v"),
    },
    tags: ["agents", "mcp", "workflows", "comfy"],
    docs: ["docs/run-location.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      return api.post<WorkflowCatalogue>("/api/settings/workflows/selection", {
        entry: args.entry,
        template: args.template,
      });
    },
  },
];
