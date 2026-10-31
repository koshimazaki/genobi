import { z } from "zod";
import type { RunLocationState } from "../shared/comfy/run-location";
import type { WorkflowCatalogue } from "../shared/comfy/workflows";
import type { ToolDefinition } from "./definition";
import { RUN_LOCATIONS } from "../shared/comfy/run-location";
import { parseWorkflowDestination } from "../shared/comfy/destination";

// The run location and workflow swapping, through the same session settings
// the studio uses (`/api/settings` on the local server). Nothing here is paid
// or submitted; a quote taken before a change cannot be spent after it.

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const workflowTools: ToolDefinition[] = [
  {
    name: "genobi_run_location",
    title: "Genobi run location",
    description:
      "Read or set this session's open-workflow destination: local, cloud, both, or deployment with deploymentUrl (https://<name>.run.comfy.app). A deployment uses its workspace's billing. Without location this only reads readiness and input limits. No automatic fallback. A destination change invalidates earlier quotes and staged tickets; stage and quote again before an approved submission.",
    inputSchema: {
      location: z
        .enum(RUN_LOCATIONS)
        .optional()
        .describe("Set the run location; omit to read it"),
      deploymentUrl: z
        .string()
        .max(2048)
        .optional()
        .describe(
          "Required with location deployment; an exact https://<name>.run.comfy.app endpoint, without credentials, path or query.",
        ),
    },
    tags: ["agents", "mcp", "workflows", "comfy"],
    docs: ["docs/run-location.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      if (args.deploymentUrl !== undefined && args.location !== "deployment")
        throw new Error("deploymentUrl requires location deployment.");
      if (args.location === "deployment")
        parseWorkflowDestination("deployment", args.deploymentUrl);
      return args.location === undefined
        ? api.get<RunLocationState>("/api/settings/run-location")
        : api.post<RunLocationState>("/api/settings/run-location", {
            location: args.location,
            ...(args.deploymentUrl !== undefined
              ? { deploymentUrl: args.deploymentUrl }
              : {}),
          });
    },
  },
  {
    name: "genobi_workflows",
    title: "Genobi workflows",
    description:
      "List workflow templates and this session's selections. With checkLocal, inspect the local ComfyUI's node/model catalogue. With checkCloud, inspect this account's Comfy Cloud catalogue using the studio's Comfy connection; reports missing nodes/model slots, unknown availability and deployment-only templates. Choose at most one check. Metadata compatibility does not prove GPU execution, input compatibility or output quality. No generation is submitted, and the selected run location is not changed.",
    inputSchema: {
      checkLocal: z
        .boolean()
        .optional()
        .describe("Also check each template against the local ComfyUI"),
      checkCloud: z
        .boolean()
        .optional()
        .describe(
          "Check offered templates against this account's Comfy Cloud catalogue; requires a connected Comfy key",
        ),
    },
    tags: ["agents", "mcp", "workflows", "comfy"],
    docs: ["docs/run-location.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      if (args.checkLocal && args.checkCloud)
        throw new Error("Choose one check: local ComfyUI or Comfy Cloud.");
      return api.get<WorkflowCatalogue>(
        args.checkCloud
          ? "/api/settings/workflows?check=cloud"
          : args.checkLocal
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
