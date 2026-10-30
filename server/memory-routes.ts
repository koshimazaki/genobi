import express from "express";
import { z } from "zod";
import { tasteShelfSchema } from "../shared/licensing/taste-shelf";
import { memoryId, scopeSchema } from "../shared/memory/schema";
import {
  memoryError,
  parseMemory,
  type MemoryProjects,
} from "./memory-projects";
import type { TasteProfiles } from "./taste-profiles";
import type { RateBucket } from "../shared/limits";

/** Local session/link ownership is exactly the existing project-copy boundary. */
export function memoryRouter(
  projects: MemoryProjects,
  profiles: TasteProfiles,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  router.use(express.json({ limit: "24kb" }));
  const session = (res: express.Response) => res.locals.sessionId as string;
  const ownerAction = (req: express.Request, res: express.Response) => {
    const site = req.headers["sec-fetch-site"];
    if (
      res.locals.agent ||
      req.headers["x-genobi-owner-action"] !== "1" ||
      (site !== undefined && site !== "same-origin")
    )
      throw memoryError("Use an explicit owner action in the studio.", 403);
  };
  router.get("/taste", async (_req, res) => {
    limit("history", session(res));
    // A linked agent reads applicable taste through project context, not every personal profile.
    if (res.locals.agent)
      throw memoryError("Read scoped taste through project context.", 403);
    res.json(await profiles.read(session(res)));
  });
  router.post("/taste/shelf", async (req, res) => {
    limit("edit", session(res));
    ownerAction(req, res);
    const body = parseMemory(
      z.strictObject({
        revision: z.number().int().min(0),
        shelf: tasteShelfSchema,
      }),
      req.body,
    );
    res.json(await profiles.setShelf(session(res), body.revision, body.shelf));
  });
  router.post("/taste", async (req, res) => {
    limit("edit", session(res));
    ownerAction(req, res);
    const body = parseMemory(
      z.strictObject({
        revision: z.number().int().min(0),
        id: memoryId,
        action: z.enum(["activate", "disable", "delete"]),
        edit: z.unknown().optional(),
      }),
      req.body,
    );
    res.json(
      await profiles.manage(
        session(res),
        body.revision,
        body.id,
        body.action,
        body.edit,
      ),
    );
  });
  router.use("/projects/:id", (req, res, next) => {
    const scope = res.locals.agentScope;
    if (
      scope?.memoryCopyId &&
      projects.access(req.params.id, session(res)).copyId !== scope.memoryCopyId
    )
      throw memoryError("This runner is scoped to one working project.", 403);
    next();
  });
  router.get("/projects/:id/context", async (req, res) => {
    limit("history", session(res));
    const access = projects.access(req.params.id, session(res));
    const scope = parseMemory(scopeSchema, {
      medium: req.query.medium ?? "video",
      useCase: req.query.useCase ?? "general",
    });
    const after = parseMemory(
      z.coerce.number().int().min(0),
      req.query.after ?? 0,
    );
    const profile = await profiles.read(access.owner);
    res.json({
      ...projects.context(
        req.params.id,
        session(res),
        profile.preferences,
        scope,
        after,
        profile.shelf,
      ),
      tasteRevision: profile.revision,
    });
  });
  router.post("/projects/:id/decisions", async (req, res) => {
    limit("edit", session(res));
    const access = projects.access(req.params.id, session(res));
    const isOwner = access.isOwner && !res.locals.agent;
    if (isOwner) ownerAction(req, res);
    res.json(
      await projects.decide(
        req.params.id,
        session(res),
        req.body,
        isOwner ? "owner" : "agent",
        res.locals.agentScope?.memorySession,
      ),
    );
  });
  router.post("/projects/:id/checkpoint", async (req, res) => {
    limit("edit", session(res));
    res.json(
      await projects.checkpoint(
        req.params.id,
        session(res),
        req.body,
        res.locals.agentScope?.memorySession,
        res.locals.agentScope?.owner,
      ),
    );
  });
  router.post("/projects/:id/sessions", async (req, res) => {
    limit("edit", session(res));
    if (res.locals.agentScope?.memorySession)
      throw memoryError("This runner already has a memory session.", 409);
    const body = parseMemory(
      z.strictObject({
        id: memoryId,
        runner: z.string().min(1).max(60),
        goal: z.string().min(1).max(4000),
      }),
      req.body,
    );
    res.json(await projects.beginSession(req.params.id, session(res), body));
  });
  router.post("/projects/:id/taste", async (req, res) => {
    limit("edit", session(res));
    const body = parseMemory(
      z.strictObject({
        revision: z.number().int().min(0),
        preference: z.unknown(),
      }),
      req.body,
    );
    res.json(
      await profiles.propose(
        req.params.id,
        session(res),
        body.revision,
        body.preference,
        res.locals.agent ? "agent" : undefined,
      ),
    );
  });
  router.post("/projects/:id/references", async (req, res) => {
    limit("edit", session(res));
    res.json(await projects.reference(req.params.id, session(res), req.body));
  });
  router.get("/projects/:id/memory-export", (req, res) => {
    limit("history", session(res));
    if (
      !projects.access(req.params.id, session(res)).isOwner ||
      res.locals.agent
    )
      throw memoryError("Only the owner may export private history.", 403);
    res.json(projects.exportMemory(req.params.id, session(res)));
  });
  router.post("/projects/:id/forget", async (req, res) => {
    limit("edit", session(res));
    ownerAction(req, res);
    const body = parseMemory(
      z.strictObject({
        revision: z.number().int().min(0),
        eventId: memoryId.optional(),
        referenceId: memoryId.optional(),
      }),
      req.body,
    );
    const access = projects.access(req.params.id, session(res));
    if (!access.isOwner)
      throw memoryError("Only the owner may forget history.", 403);
    res.json(
      await projects.forget(
        req.params.id,
        session(res),
        body.revision,
        body.eventId,
        body.referenceId,
        body.referenceId
          ? undefined
          : () =>
              profiles.forgetEvidence(
                access.owner,
                access.copyId,
                body.eventId,
              ),
      ),
    );
  });
  return router;
}
