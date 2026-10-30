// `POST /api/agent/run/messages` (Box 1.8), mounted by `agentRouter`
// (server/agent-routes.ts) before the studio-origin check: the agent's
// Genobi MCP server is not the studio. It collects the person's messages
// that the message route queued for a runner without live input. It spends
// and submits nothing.
import type express from "express";
import type { RateBucket } from "../shared/limits";
import type { AgentScope } from "./agent-session-types";
import type { AgentSessions } from "./agent-sessions";
import { AppError } from "./errors";

/**
 * Only a request the server marked as an agent's, with a scope from its
 * grant (or its ticketed browser), collects anything: its owner's one
 * running session (`agent_busy` keeps it to one) answers its unread
 * messages, once each. A grant of an ended session has no scope.
 */
export function collectMessages(
  agents: Pick<AgentSessions, "collect">,
  limit: (bucket: RateBucket, id: string) => void,
): express.RequestHandler {
  return (_request, response) => {
    if (!response.locals.agent)
      throw new AppError(
        403,
        "Only an agent session collects the person's messages.",
        "agent_messages_scope",
      );
    limit("poll", response.locals.sessionId as string);
    const scope = response.locals.agentScope as AgentScope | undefined;
    response.json({ messages: scope ? agents.collect(scope.owner) : [] });
  };
}
