import express from "express";
import { ActivityStore } from "./activity";
import {
  BROWSER_TOOLS,
  cleanActivity,
  type ActivityEvent,
} from "../shared/activity";
import type { MemoryProjects } from "./memory-projects";
import type { Store } from "./store";
import { AppError } from "./errors";
import { tools } from "../mcp/tools";
import type { RateBucket } from "../shared/limits";

const names = new Set(tools.map((tool) => tool.name));
export function activityRouter(
  activity: ActivityStore,
  projects: MemoryProjects,
  limit: (bucket: RateBucket, id: string) => void,
  store: Store,
) {
  const router = express.Router();
  router.use((req, res, next) => {
    // Opt-out remains available even if event traffic has exhausted its own bucket.
    limit(req.method === "PUT" ? "history" : "activity", res.locals.sessionId);
    next();
  });
  router.get("/", async (_req, res) => {
    await activity.flush();
    res.json(await activity.read(res.locals.sessionId));
  });
  router.put("/", express.json({ limit: "1kb" }), async (req, res) => {
    if (res.locals.agent || req.headers["x-genobi-mcp"] === "1")
      throw new AppError(
        403,
        "Only the studio owner can change activity logging.",
      );
    if (typeof req.body?.enabled !== "boolean")
      throw new AppError(400, "Choose whether to save activity.");
    await activity.configure(res.locals.sessionId, req.body.enabled);
    res.json(await activity.read(res.locals.sessionId));
  });
  router.post("/", express.json({ limit: "2kb" }), async (req, res) => {
    let event: ActivityEvent;
    try {
      event = cleanActivity(req.body?.event);
    } catch {
      throw new AppError(400, "Invalid activity event.");
    }
    if (
      (event.source === "mcp" && !names.has(event.tool)) ||
      (event.source === "browser" &&
        !(BROWSER_TOOLS as readonly string[]).includes(event.tool)) ||
      event.source === "server"
    )
      throw new AppError(400, "Unknown activity tool.");
    // Clients report tools, never attest a provider route. Actual routes come from take reservations.
    delete event.backend;
    const jobId = [
      "genobi_submit",
      "genobi_job",
      "genobi_take",
      "generation",
    ].includes(event.tool)
      ? req.body?.jobId
      : undefined;
    const reader = res.locals.agentScope?.readable.has(jobId)
      ? res.locals.agentScope.owner
      : res.locals.sessionId;
    const job =
      typeof jobId === "string" &&
      store.data.jobs.find((j) => j.id === jobId && j.sessionId === reader);
    if (job && job.take) {
      const recipe = job.take.recipe;
      event.backend =
        recipe.route === "router"
          ? "router"
          : recipe.route === "bfl"
            ? "bfl"
            : recipe.location === "local"
              ? "local"
              : recipe.location === "cloud"
                ? "cloud"
                : undefined;
    }
    const copy = req.body?.copyId;
    const owner =
      copy === undefined
        ? (res.locals.agentScope?.owner ?? res.locals.sessionId)
        : projects.access(String(copy), res.locals.sessionId).owner;
    event.at = new Date().toISOString();
    await activity.append(owner, event);
    res.json({ recorded: (await activity.read(owner)).enabled });
  });
  return router;
}
