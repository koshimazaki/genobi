import express from "express";
import { developmentRequest } from "../shared/development-session";
import type { RateBucket } from "../shared/limits";
import { sameOrigin } from "./agent-routes";
import { DevelopmentSessions } from "./development-sessions";
import { AppError } from "./errors";
import { DevelopmentTerminal } from "./development-terminal";
import { terminalRequest } from "../shared/development-terminal";
import { inFlightSubmissions, ServerRestart } from "./server-restart";
import type { Store } from "./store";
import { mountDevelop, type DevelopOptions } from "./development-agent-routes";
import { savedDevelopRunner } from "./development-develop";
import type { AgentConfig } from "./agent-config";

export interface DevOptions {
  directory: string;
  /** Graceful exit for `scripts/dev-server.mjs` to start again; local dev only. */
  restart?: () => void;
}

export function mountDevelopment(
  app: express.Express,
  { directory, restart }: DevOptions,
  limit: (bucket: RateBucket, id: string) => void,
  /** The job store, so a restart waits for a submission still being sent. */
  store?: Store,
  /** The setup's harness choice: the runner of a Developer Genobi starts. */
  agent?: { config: Pick<AgentConfig, "runner" | "unsupportedRunner"> },
) {
  const sessions = new DevelopmentSessions(directory);
  const terminal = new DevelopmentTerminal(directory);
  app.use(
    "/api/development",
    developmentRouter(
      sessions,
      limit,
      terminal,
      new ServerRestart(
        restart,
        undefined,
        store && (() => inFlightSubmissions(store.data.jobs)),
      ),
      agent && { runner: () => savedDevelopRunner(agent.config) },
    ),
  );
  return {
    /** Also opens a harness's sign-in for setup (setup-routes.ts). */
    terminal,
    close: async () => {
      terminal.close();
      await sessions.close();
    },
  };
}

export function developmentRouter(
  sessions: DevelopmentSessions,
  limit: (bucket: RateBucket, id: string) => void,
  terminal?: DevelopmentTerminal,
  server: ServerRestart = new ServerRestart(),
  develop?: DevelopOptions,
) {
  const router = express.Router();
  // Before the boundary below: the Genobi MCP server is not the studio page.
  if (develop) mountDevelop(router, sessions, limit, develop);
  router.use(sameOrigin, (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next(
      response.locals.agent
        ? new AppError(
            403,
            "Agents cannot control development sessions.",
            "agent_nested",
          )
        : undefined,
    );
  });
  router.get("/", async (_request, response) => {
    limit("poll", response.locals.sessionId);
    response.json(await sessions.state(response.locals.sessionId));
  });
  router.get("/terminal", async (_request, response) => {
    limit("poll", response.locals.sessionId);
    if (!terminal)
      throw new AppError(
        503,
        "Restart the local server to enable native terminals.",
      );
    response.json(await terminal.state(response.locals.sessionId));
  });
  // Whether this process runs older code than the checkout, and a restart
  // through `npm run dev`'s supervisor. Native terminals are not children of
  // the server, so they stay open; recorded jobs resume polling after it, but
  // a submission still in flight would come back as an error with no provider
  // id, so the restart waits for it (`restart_busy`).
  router.get("/server", async (_request, response) => {
    limit("poll", response.locals.sessionId);
    response.json(await server.state());
  });
  router.post("/server/restart", (_request, response) => {
    limit("submit", response.locals.sessionId);
    const busy = server.busy();
    if (busy) throw new AppError(409, busy, "restart_busy");
    if (!server.request())
      throw new AppError(
        409,
        "This server was not started with npm run dev. Restart it in its terminal.",
        "restart_manual",
      );
    response.status(202).json({ restarting: true });
  });
  router.post(
    "/terminal",
    express.json({ limit: "16kb" }),
    async (request, response) => {
      limit("submit", response.locals.sessionId);
      const parsed = terminalRequest.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(400, "Choose a valid runner and session.");
      if (!terminal)
        throw new AppError(
          503,
          "Restart the local server to enable native terminals.",
        );
      const origin = new URL(`http://${request.get("host")}`).origin;
      if (
        !["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname)
      )
        throw new AppError(403, "Native terminals require the local studio.");
      response
        .status(201)
        .json(
          await terminal.start(response.locals.sessionId, parsed.data, origin),
        );
    },
  );
  router.post(
    "/",
    express.json({ limit: "24kb" }),
    async (request, response) => {
      limit("submit", response.locals.sessionId);
      const parsed = developmentRequest.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(
          400,
          "Choose a runner, a task and a valid session mode.",
          "development_request",
        );
      response
        .status(201)
        .json(await sessions.start(response.locals.sessionId, parsed.data));
    },
  );
  router.post("/:id/stop", (request, response) => {
    limit("edit", response.locals.sessionId);
    response.json(sessions.stop(request.params.id, response.locals.sessionId));
  });
  return router;
}
