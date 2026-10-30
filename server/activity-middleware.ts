import type express from "express";
import { randomUUID } from "node:crypto";
import type { ActivityEvent } from "../shared/activity";
import type { ActivityStore } from "./activity";
import type { MemoryProjects } from "./memory-projects";
import type { Store } from "./store";

/** One server boundary covers direct UI, voice-routed, MCP and CLI requests. */
export function activityMiddleware(
  activity: ActivityStore,
  projects: MemoryProjects,
  store: Store,
): express.RequestHandler {
  return async (req, res, next) => {
    const p = req.path;
    const tool =
      req.method === "POST"
        ? p === "/jobs" ||
          /^\/agent\/sessions\/[^/]+\/approvals\/[^/]+\/approve$/.test(p)
          ? "generation-submit"
          : p === "/quotes"
            ? "quote"
            : p === "/voice/transcribe" || p === "/voice/setup"
              ? "voice"
              : /^\/projects\/[^/]+\/(commands|takes)$/.test(p)
                ? "director"
                : /^\/(media|audio)\//.test(p)
                  ? p.split("/")[1]
                  : p === "/agent/sessions"
                    ? "agent-session"
                    : /^\/chains/.test(p)
                      ? "generation-chain"
                      : undefined
        : undefined;
    if (!tool) return next();
    let owner = res.locals.agentScope?.owner ?? res.locals.sessionId;
    if (tool === "director") {
      try {
        owner = projects.access(
          decodeURIComponent(p.split("/")[2]),
          res.locals.sessionId,
        ).owner;
      } catch {
        /* Failed access stays private to the requesting session. */
      }
    }
    const event: ActivityEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      tool,
      phase: "started",
      source: "server",
    };
    await activity.observe(owner, event);
    const json = res.json.bind(res);
    // The response contains only our local job handle; never persist provider identifiers.
    res.json = ((body: unknown) => {
      const job = (body as { job?: { id?: string; status?: string } })?.job;
      const held =
        job?.id &&
        store.data.jobs.find(
          (j) => j.id === job.id && j.sessionId === res.locals.sessionId,
        );
      if (held && held.take) {
        const r = held.take.recipe;
        event.backend =
          r.route === "workflow"
            ? r.location === "local"
              ? "local"
              : "cloud"
            : r.route === "router"
              ? "router"
              : "bfl";
      }
      if (job?.status === "Error") event.phase = "failed";
      return json(body);
    }) as express.Response["json"];
    let finished = false;
    res.once("finish", () => {
      finished = true;
      // HTTP completion is tool completion, not a claim that a queued video is ready.
      void activity.observe(owner, {
        ...event,
        phase:
          res.statusCode < 400 && event.phase !== "failed"
            ? "succeeded"
            : "failed",
      });
    });
    res.once("close", () => {
      if (!finished)
        void activity.observe(owner, { ...event, phase: "unknown" });
    });
    next();
  };
}
