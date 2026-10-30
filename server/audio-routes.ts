import express from "express";
import type { RateBucket } from "../shared/limits";
import type { AudioAnalysis } from "./audio-analysis";
import { readerOf } from "./agent-scope";

/**
 * Local only: `GET /api/audio/status` (booleans) and `POST
 * /api/audio/analyze`. The hosted Worker has no audio analysis route.
 * Analysis runs on this machine and is unpaid, so like voice it stays out of
 * the paid-write bucket and counts with history.
 */
export function audioRouter(
  audio: AudioAnalysis,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  router.get("/status", async (_request, response) => {
    limit("history", response.locals.sessionId);
    response.json(await audio.status());
  });
  router.post(
    "/analyze",
    (_request, response, next) => {
      limit("history", response.locals.sessionId);
      next();
    },
    express.json({ limit: "4kb" }),
    async (request, response) => {
      response.json({
        report: await audio.analyze(
          request.body,
          response.locals.sessionId,
          // A picked source is read as the person's (agent-scope.ts).
          readerOf(response.locals, String(request.body?.sourceId ?? "")),
        ),
      });
    },
  );
  return router;
}
