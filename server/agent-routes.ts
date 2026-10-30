// The project-prompt routes, mounted at `/api/agent` after the session
// middleware, the ticket route that signs an agent's browser in, and the
// guard that keeps an agent's sessions off the paid routes. Local only: the
// hosted Worker has separate paired-runner relay routes.
import express, { type RequestHandler } from "express";
import {
  parseAgentMessage,
  parseAgentSessionRequest,
} from "../shared/agent-session";
import {
  AGENT_MARK_HEADER,
  AGENT_REQUEST_HEADER,
  AGENT_SPEND_CODE,
  AGENT_SPEND_MESSAGE,
} from "../shared/agent-session-events";
import type { RateBucket } from "../shared/limits";
import type { AgentSessions } from "./agent-sessions";
import { collectMessages } from "./agent-message-routes";
import { AppError } from "./errors";
import { QUOTE_ID } from "../shared/quote";
import { expecting } from "./settings-expectation";
import { publicJob, type StoredJob } from "./store";
import { validateIdempotencyKey } from "./validation";

/**
 * Every route that spends the person's money. An agent's session is refused
 * on each; `tests/agent-spend.test.ts` walks this list.
 */
export const PAID_ROUTES = [
  "/api/jobs",
  "/api/chains/:id/approve",
  "/api/agent/sessions/:id/approvals/:quote/approve",
  "/api/upscale-parts/:id/confirm",
  "/api/upscale-parts/:id/parts/:index/confirm",
] as const;

const LOOPBACK = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

/** True when the request comes from an agent's browser or MCP server. */
export function fromAgent(
  agents: Pick<AgentSessions, "isAgent">,
  request: express.Request,
  sessionId: string,
) {
  return (
    agents.isAgent(sessionId) ||
    request.headers[AGENT_MARK_HEADER.toLowerCase()] !== undefined
  );
}

/** Mounted on each paid POST before its handler. */
export const refuseAgentSpend: RequestHandler = (_request, response, next) =>
  next(
    response.locals.agent
      ? new AppError(403, AGENT_SPEND_MESSAGE, AGENT_SPEND_CODE)
      : undefined,
  );

/**
 * Same origin and the studio's header, on every agent route. A page on another
 * site can make the person's browser send a simple request to localhost, but
 * not one with a custom header, which needs a CORS preflight never granted.
 */
export const sameOrigin: RequestHandler = (request, _response, next) => {
  const host = request.headers.host ?? "";
  const origin = request.headers.origin;
  const site = request.headers["sec-fetch-site"];
  const refused =
    request.headers[AGENT_REQUEST_HEADER.toLowerCase()] !== "1" ||
    !LOOPBACK.test(host) ||
    (origin !== undefined && origin !== `http://${host}`) ||
    (site !== undefined && site !== "same-origin");
  next(
    refused
      ? new AppError(
          403,
          "Start an agent from the studio itself.",
          "agent_cross_site",
        )
      : undefined,
  );
};

export function agentRouter(
  agents: AgentSessions,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  const session = (response: express.Response) =>
    response.locals.sessionId as string;
  // The agent's Genobi MCP server is not the studio: before the origin check.
  router.post("/run/messages", collectMessages(agents, limit));
  router.use(sameOrigin);
  router.get("/status", async (_request, response) => {
    limit("history", session(response));
    response.json(await agents.status());
  });
  // A start spends the person's subscription, so it takes the paid-write
  // ceiling; Stop takes the edit bucket, so a busy minute never blocks it.
  router.post(
    "/sessions",
    express.json({ limit: "24kb" }),
    async (request, response) => {
      limit("submit", session(response));
      if (response.locals.agent)
        throw new AppError(
          403,
          "An agent cannot start another agent session.",
          "agent_nested",
        );
      let parsed;
      try {
        parsed = parseAgentSessionRequest(request.body);
      } catch (error) {
        throw new AppError(400, (error as Error).message, "agent_request");
      }
      response.status(201).json(await agents.start(session(response), parsed));
    },
  );
  // After a reload the panel finds the owner's running session again, as the
  // hosted relay restores its latest: a Terminal session outlives the page,
  // and its approvals must stay reachable. None answers null.
  router.get("/sessions", (_request, response) => {
    limit("history", session(response));
    response.json({ session: agents.active(session(response)) ?? null });
  });
  router.get("/sessions/:id", (request, response) => {
    limit("poll", session(response));
    response.json(agents.read(request.params.id, session(response)));
  });
  // A further message for the owner's running session (Box 1.8): the same
  // header, ownership, length and control-character rules as a start, and
  // the same ceiling, since each turn spends the person's subscription.
  router.post(
    "/sessions/:id/messages",
    express.json({ limit: "24kb" }),
    (request, response) => {
      limit("submit", session(response));
      if (response.locals.agent)
        throw new AppError(
          403,
          "An agent cannot message an agent session.",
          "agent_nested",
        );
      let parsed;
      try {
        parsed = parseAgentMessage(request.body);
      } catch (error) {
        throw new AppError(400, (error as Error).message, "agent_request");
      }
      // A runner without live input (Hermes, a Terminal window) gets it
      // through its Genobi MCP server instead (`server/agent-inbox.ts`).
      response
        .status(202)
        .json(
          agents.message(
            request.params.id,
            session(response),
            parsed.prompt,
            parsed.source,
          ),
        );
    },
  );
  router.post("/sessions/:id/stop", (request, response) => {
    limit("edit", session(response));
    response.json(agents.stop(request.params.id, session(response)));
  });
  // Confirm before spending: the person's Approve runs the quoted step once,
  // through the ordinary quoted submission; Decline voids its quote.
  const quoteOf = (request: express.Request) => {
    const quote = String(request.params.quote ?? "");
    if (!QUOTE_ID.test(quote))
      throw new AppError(
        404,
        "That paid step was not found.",
        "approval_missing",
      );
    return quote;
  };
  router.post(
    "/sessions/:id/approvals/:quote/approve",
    async (request, response) => {
      limit("submit", session(response));
      const quote = quoteOf(request);
      const key = validateIdempotencyKey(request.headers["idempotency-key"]);
      const { session: view, job } = await expecting(response.locals, () =>
        agents.approve(request.params.id, session(response), quote, key),
      );
      // A split upscale's approval confirms its set: no single run.
      response.status(202).json({
        session: view,
        ...(job ? { job: publicJob(job as StoredJob) } : {}),
      });
    },
  );
  router.post(
    "/sessions/:id/approvals/:quote/decline",
    async (request, response) => {
      limit("edit", session(response));
      response.json(
        await agents.decline(
          request.params.id,
          session(response),
          quoteOf(request),
        ),
      );
    },
  );
  return router;
}

/**
 * `GET /api/agent/ticket/:ticket`, mounted before the session middleware: the
 * agent's browser opens it once, gets a studio session marked as an agent's,
 * and lands on the studio. An unknown ticket changes nothing.
 */
export function agentTicket(agents: AgentSessions): RequestHandler {
  return (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!LOOPBACK.test(request.headers.host ?? ""))
      return void response.status(403).json({ error: "Loopback only." });
    const marked = agents.redeem(String(request.params.ticket ?? ""));
    if (!marked)
      return void response
        .status(404)
        .json({ error: "That agent ticket is unknown or used." });
    response.cookie("camera_session", marked, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: 86400_000,
      path: "/",
    });
    response.redirect(303, "/");
  };
}
