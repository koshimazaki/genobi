import express from "express";
import { AGENT_REQUEST_HEADER } from "../shared/agent-session-events";
import type { RateBucket } from "../shared/limits";
import type { RunnerConnection } from "./runner-connection";
import { AppError } from "./errors";
export function localRunnerRouter(
  connection: RunnerConnection,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (
      res.locals.agent ||
      req.headers[AGENT_REQUEST_HEADER.toLowerCase()] !== "1" ||
      (req.headers["sec-fetch-site"] !== undefined &&
        req.headers["sec-fetch-site"] !== "same-origin")
    )
      return next(
        new AppError(403, "Pair a runner from the local studio itself."),
      );
    limit("history", res.locals.sessionId);
    next();
  });
  router.get("/status", (_req, res) => {
    res.json(connection.status(res.locals.sessionId));
  });
  router.post("/connect", express.json({ limit: "2kb" }), async (req, res) => {
    res.json(await connection.connect(res.locals.sessionId, req.body));
  });
  router.delete("/connect", async (_req, res) => {
    res.json(await connection.disconnect(res.locals.sessionId));
  });
  return router;
}
