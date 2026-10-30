import type { VoiceInstaller } from "./voice-install";
import express from "express";
import type { RateBucket } from "../shared/limits";
import { UPLOAD_LIMITS, UPLOAD_TYPES, uploadType } from "../shared/uploads";
import { sameOrigin } from "./agent-routes";
import { AppError } from "./errors";
import type { VoiceService } from "./voice";

/** The audio types `POST /api/uploads` takes, so the two cannot drift. */
const AUDIO_TYPES = UPLOAD_TYPES.filter(
  (type) => uploadType(type)?.kind === "audio",
);

/**
 * Local only: `GET /api/voice/status`, `POST` and `DELETE /api/voice/prewarm`,
 * and `POST /api/voice/transcribe?language=…`. The hosted Worker has no
 * voice routes.
 * Voice is local and unpaid, so it stays out of the paid-write bucket (a few
 * notes must not hold up a Generate) and every route counts with history.
 */
export function voiceRouter(
  voice: VoiceService,
  limit: (bucket: RateBucket, id: string) => void,
  installer?: VoiceInstaller,
) {
  const router = express.Router();
  if (installer) {
    router.get("/setup", async (_request, response) => {
      limit("history", response.locals.sessionId);
      response.json(await installer.describe(response.locals.sessionId));
    });
    router.get("/setup/progress", (_request, response) =>
      response.json(installer.status(response.locals.sessionId)),
    );
    // A verified Qwen3-ASR-0.6B already on this machine, before any
    // download. Folder paths stay with the person's own studio session.
    // Same origin with the studio's header: a page on another site must not
    // start a home-folder search and its hashing with a plain image GET.
    router.get("/setup/found", sameOrigin, async (_request, response) => {
      if (response.locals.agent)
        throw new AppError(
          403,
          "Agents cannot search this machine for voice models.",
          "agent_nested",
        );
      limit("history", response.locals.sessionId);
      response.set("Cache-Control", "no-store").json(await installer.found());
    });
    router.post(
      "/setup/folder",
      express.json({ limit: "8kb" }),
      async (request, response) => {
        limit("history", response.locals.sessionId);
        response.json({
          folder: await installer.folder(
            response.locals.sessionId,
            request.body?.token,
          ),
        });
      },
    );
    router.post(
      "/setup",
      express.json({ limit: "8kb" }),
      async (request, response) => {
        limit("history", response.locals.sessionId);
        response
          .status(202)
          .json(
            await installer.start(
              response.locals.sessionId,
              request.body ?? {},
            ),
          );
      },
    );
    router.delete("/setup", async (_request, response) =>
      response.json(await installer.cancel(response.locals.sessionId)),
    );
  }
  router.get("/status", async (_request, response) => {
    limit("history", response.locals.sessionId);
    response.json(await voice.status());
  });
  router.post("/prewarm", async (_request, response) => {
    limit("history", response.locals.sessionId);
    response.status(202).json(await voice.prewarm());
  });
  // The studio discards a recording: free the model it started loading.
  router.delete("/prewarm", (_request, response) => {
    limit("history", response.locals.sessionId);
    response.json(voice.cancelPrewarm());
  });
  router.post(
    "/transcribe",
    (_request, response, next) => {
      limit("history", response.locals.sessionId);
      next();
    },
    express.raw({ type: AUDIO_TYPES, limit: UPLOAD_LIMITS.audio }),
    async (request, response) => {
      // A closed tab stops the worker rather than leaving it running.
      const controller = new AbortController();
      response.on("close", () => {
        if (!response.writableFinished) controller.abort();
      });
      response.json(
        await voice.transcribe(
          request.body,
          request.headers["content-type"],
          controller.signal,
          // `?language=English` or `auto`; checked against the allow-list.
          request.query.language,
        ),
      );
    },
  );
  return router;
}
