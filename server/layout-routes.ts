import express from "express";
import { AppError } from "./errors";
import type { RateBucket } from "../shared/limits";
import { LayoutError, MAX_SAVED_LAYOUT_BYTES } from "../shared/saved-layouts";
import type { LocalLayouts } from "./layouts";

const STATUS = { invalid: 400, missing: 404, full: 409, name_taken: 409 };

/**
 * `/api/layouts`: the machine's saved studio layouts. Local only, like voice:
 * the hosted Worker answers 404 here and the studio keeps layouts in the
 * browser instead. Nothing is paid; writes count in the `edit` bucket and use
 * PUT and DELETE, so the paid-write ceiling never sees them.
 */
export function layoutRouter(
  layouts: LocalLayouts,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  const body = express.json({ limit: MAX_SAVED_LAYOUT_BYTES });
  const answer =
    (
      bucket: RateBucket,
      run: (request: express.Request) => Promise<unknown>,
    ): express.RequestHandler =>
    async (request, response) => {
      limit(bucket, response.locals.sessionId);
      try {
        response.json({ layouts: await run(request) });
      } catch (error) {
        if (error instanceof LayoutError)
          throw new AppError(STATUS[error.code], error.message, error.code);
        throw error;
      }
    };
  router.get(
    "/",
    answer("history", () => layouts.list()),
  );
  router.put(
    "/:id",
    body,
    answer("edit", (request) => layouts.save(request.params.id, request.body)),
  );
  router.delete(
    "/:id",
    answer("edit", (request) => layouts.remove(request.params.id)),
  );
  return router;
}
