// Split upscales (`server/upscale-parts.ts`), mounted at /api/upscale-parts by
// app.ts. Local only: the hosted Worker has no ffmpeg and no such routes.
// POSTs count with the paid writes in the session middleware; reads poll.
import express, { type Request } from "express";
import type { RateBucket } from "../shared/limits";
import { AppError, requireKey } from "./errors";
import type { PartSetView } from "../shared/upscale-parts";
import type { MediaTools } from "./media-tools";
import { readerOf } from "./agent-scope";
import { expecting } from "./settings-expectation";
import { cutParts, joinParts, planSource } from "./upscale-media";
import { UpscalePartsService, type PartMedia } from "./upscale-parts";
import { validateQuoteId } from "./validation";

/** The media tools as the set service uses them. */
export const partMedia = (tools: MediaTools): PartMedia => ({
  plan: (from, limits) => planSource(tools, from, limits),
  cut: (from, plan, sessionId) => cutParts(tools, from, plan, sessionId),
  join: (parts, original, plan, sessionId) =>
    joinParts(tools, parts, original, plan, sessionId),
});

/** A plan an agent's session made: it becomes a step the person approves. */
export type OnPlanned = (
  request: Request,
  locals: Record<string, unknown>,
  set: PartSetView,
) => Promise<void>;

export function upscalePartsRouter(
  service: UpscalePartsService,
  limit: (bucket: RateBucket, id: string) => void,
  onPlanned: OnPlanned = async () => {},
) {
  const router = express.Router();
  const session = (response: express.Response) =>
    response.locals.sessionId as string;
  const byoKey = (request: Request) =>
    request.headers["x-byo-key"] === undefined
      ? undefined
      : requireKey(request.headers["x-byo-key"]);
  const quoteId = (request: Request) => {
    const id = validateQuoteId(request.headers["quote-id"]);
    if (!id)
      throw new AppError(
        400,
        "Confirm with the set's quote, as Quote-Id.",
        "quote_missing",
      );
    return id;
  };
  const index = (request: Request) => {
    const value = Number(request.params.index);
    if (!Number.isInteger(value) || value < 0)
      throw new AppError(404, "Part not found.");
    return value;
  };
  router.get("/", (_request, response) => {
    limit("history", session(response));
    response.json(service.list(session(response)));
  });
  router.post(
    "/",
    express.json({ limit: "16kb" }),
    async (request, response) => {
      // A clip the person picked is read as theirs, as a quote reads it.
      const sourceId: unknown = request.body?.sourceId;
      const reply = await expecting(response.locals, () =>
        service.plan(
          request.body,
          session(response),
          byoKey(request),
          typeof sourceId === "string"
            ? readerOf(response.locals, sourceId)
            : undefined,
        ),
      );
      // An agent session's plan becomes one step the person approves.
      await onPlanned(request, response.locals, reply.set);
      response.status(201).json(reply);
    },
  );
  router.get("/:id", async (request, response) => {
    // A read can poll the parts and quote again, so it counts like a poll.
    limit("poll", session(response));
    response.json(
      await service.read(request.params.id, session(response), byoKey(request)),
    );
  });
  router.post("/:id/confirm", async (request, response) => {
    const id = quoteId(request);
    response
      .status(202)
      .json(
        await expecting(response.locals, () =>
          service.confirm(
            request.params.id,
            session(response),
            id,
            byoKey(request),
          ),
        ),
      );
  });
  router.post("/:id/parts/:index/retry", async (request, response) => {
    response.json(
      await expecting(response.locals, () =>
        service.retry(
          request.params.id,
          index(request),
          session(response),
          byoKey(request),
        ),
      ),
    );
  });
  router.post("/:id/parts/:index/confirm", async (request, response) => {
    const id = quoteId(request);
    response
      .status(202)
      .json(
        await expecting(response.locals, () =>
          service.confirmRetry(
            request.params.id,
            index(request),
            session(response),
            id,
            byoKey(request),
          ),
        ),
      );
  });
  router.post("/:id/join", async (request, response) => {
    response.json(await service.rejoin(request.params.id, session(response)));
  });
  return router;
}
