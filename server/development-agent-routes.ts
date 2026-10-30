import express from "express";
import {
  developReceipt,
  developRequest,
  type DevelopmentRunner,
} from "../shared/development-session";
import type { RateBucket } from "../shared/limits";
import type { AgentScope } from "./agent-session-types";
import type { DevelopmentSessions } from "./development-sessions";
import { AppError } from "./errors";

/** How the server finds the runner the person saved for development. */
export interface DevelopOptions {
  runner: () => DevelopmentRunner | undefined;
}

/**
 * The one opening in `agent_nested`: a running, studio-started Genobi session
 * (agent-marked, with its grant's scope) may start a Developer and read the
 * Developers it started. Nothing else under /api/development answers an agent.
 * The person's own requests never come here; they use the Development panel.
 */
function caller(request: express.Request, locals: Record<string, unknown>) {
  const site = request.headers["sec-fetch-site"];
  if (!locals.agent || (site !== undefined && site !== "same-origin"))
    throw new AppError(
      403,
      "Only a creative Genobi session starts a Developer here; start development from Project Tools → Development.",
      "develop_agent_only",
    );
  const scope = locals.agentScope as AgentScope | undefined;
  if (!scope)
    throw new AppError(
      403,
      "Only a running, studio-started Genobi session can start a Developer.",
      "agent_nested",
    );
  return scope;
}

export function mountDevelop(
  router: express.Router,
  sessions: DevelopmentSessions,
  limit: (bucket: RateBucket, id: string) => void,
  options: DevelopOptions,
) {
  router.post(
    "/agent",
    express.json({ limit: "24kb" }),
    async (request, response) => {
      const scope = caller(request, response.locals);
      limit("submit", response.locals.sessionId);
      response.setHeader("Cache-Control", "no-store");
      const parsed = developRequest.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(
          400,
          "Send role developer, a task of up to 4000 characters, mode change or pr, and at most 20 repository-relative file hints.",
          "develop_request",
        );
      const runner = options.runner();
      if (!runner)
        throw new AppError(
          503,
          "No runner is saved for development. The person chooses one in setup's Connect step.",
          "develop_runner",
        );
      const view = await sessions.startDeveloper(scope.owner, {
        runner,
        request: parsed.data,
        agentSession: scope.agentSession,
      });
      response.status(201).json(developReceipt(view));
    },
  );
  router.get("/agent/:id", (request, response) => {
    const scope = caller(request, response.locals);
    limit("poll", response.locals.sessionId);
    response.setHeader("Cache-Control", "no-store");
    response.json(
      developReceipt(
        sessions.developerFor(
          request.params.id,
          scope.owner,
          scope.agentSession,
        ),
      ),
    );
  });
}
