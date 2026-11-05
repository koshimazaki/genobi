import express from "express";
import { AppError } from "./errors";
import type { RateBucket } from "../shared/limits";
import { workflowTemplates } from "../shared/comfy/workflows";
import type { LocalComfyWorkflows } from "./comfy-local";
import type { GpuBoxes } from "./gpu-boxes";
import { boxUrl } from "../shared/comfy/gpu-box";
import type { WorkflowSettings } from "./workflow-settings";
import { checkedCloudCatalogue } from "./comfy-cloud-check";
import type { Fetcher } from "../shared/provider";

/**
 * `/api/settings`: the session's run location and workflow choices, read and
 * changed by the studio and by agents through MCP. Nothing here is paid or
 * submitted to a provider. Checks explicitly read the local or Cloud node
 * catalogue; ordinary settings reads stay offline. Writes count in the `edit`
 * bucket, and Cloud checks in `credits`, never with paid submissions.
 */
export function settingsRouter(
  settings: WorkflowSettings,
  limit: (bucket: RateBucket, id: string) => void,
  local?: LocalComfyWorkflows,
  boxes?: GpuBoxes,
  cloud?: { key: () => string | undefined; fetcher?: Fetcher },
) {
  /** The ComfyUI a local check reads: the session's GPU box, when it runs on one. */
  const localFor = (sessionId: string) => {
    const box = settings.box(sessionId);
    return settings.snapshot(sessionId).location === "box" && box
      ? boxes?.client(boxUrl(box.port))
      : local;
  };
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
    // A GPU box is a label and a tunnel port; an SSH host is never sent.
    const { location, deploymentUrl, box } = fields(request.body);
    response.json(
      await settings.setLocation(
        response.locals.sessionId,
        location,
        deploymentUrl,
        box,
      ),
    );
  });
  router.get("/workflows", async (request, response) => {
    limit("history", response.locals.sessionId);
    const catalogue = settings.catalogue(response.locals.sessionId);
    if (request.query.check === "cloud") {
      limit("credits", response.locals.sessionId);
      response.json(
        await checkedCloudCatalogue(
          catalogue,
          request.headers["x-byo-key"] ?? cloud?.key(),
          cloud?.fetcher,
        ),
      );
      return;
    }
    // A detection read only when asked: /object_info can be large.
    const target =
      request.query.check === "local"
        ? localFor(response.locals.sessionId)
        : undefined;
    const check = target
      ? await target.check(
          // Templates pinned to a deployment never run on a ComfyUI here.
          workflowTemplates
            .map((c) => c.template)
            .filter((t) => !t.hosts?.length),
        )
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
