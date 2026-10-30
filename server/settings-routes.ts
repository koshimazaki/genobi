import express from "express";
import { AppError } from "./errors";
import type { RateBucket } from "../shared/limits";
import { workflowTemplates } from "../shared/comfy/workflows";
import type { LocalComfyWorkflows } from "./comfy-local";
import type { WorkflowSettings } from "./workflow-settings";

/**
 * `/api/settings`: the session's run location and workflow choices, read and
 * changed by the studio and by agents through MCP. Nothing here is paid or
 * sent to a provider; the only outside read is the local ComfyUI's
 * `/system_stats` (and `/object_info` when a check is asked for). Writes count
 * in the `edit` bucket, not with paid submissions.
 */
export function settingsRouter(
  settings: WorkflowSettings,
  limit: (bucket: RateBucket, id: string) => void,
  local?: LocalComfyWorkflows,
) {
  const router = express.Router();
  const body = express.json({ limit: "2kb" });
  const fields = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new AppError(400, "Send a JSON object.");
    return value as Record<string, unknown>;
  };
  router.get("/run-location", async (_request, response) => {
    limit("history", response.locals.sessionId);
    response.json(await settings.state(response.locals.sessionId));
  });
  router.post("/run-location", body, async (request, response) => {
    limit("edit", response.locals.sessionId);
    const { location, deploymentUrl } = fields(request.body);
    response.json(
      await settings.setLocation(
        response.locals.sessionId,
        location,
        deploymentUrl,
      ),
    );
  });
  router.get("/workflows", async (request, response) => {
    limit("history", response.locals.sessionId);
    const catalogue = settings.catalogue(response.locals.sessionId);
    // A detection read only when asked: /object_info can be large.
    const check =
      request.query.check === "local" && local
        ? await local.check(workflowTemplates.map((c) => c.template))
        : undefined;
    response.json(check ? { ...catalogue, local: check } : catalogue);
  });
  router.post("/workflows/selection", body, async (request, response) => {
    limit("edit", response.locals.sessionId);
    const { entry, template } = fields(request.body);
    if (typeof entry !== "string" || typeof template !== "string")
      throw new AppError(
        400,
        "Name the model entry and the workflow to run behind it.",
        "workflow_mismatch",
      );
    response.json(
      await settings.select(response.locals.sessionId, entry, template),
    );
  });
  return router;
}
