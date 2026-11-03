import { Router, json } from "express";
import {
  effectCatalogueResponse,
  effectVariantResponse,
} from "../shared/effects/service";
import { CommandError } from "../shared/director/layer-commands";
import type { RateBucket } from "../shared/limits";
import { AppError } from "./errors";

export function effectsRouter(
  limit: (bucket: RateBucket, session: string) => void,
) {
  const router = Router();
  const validated = (run: () => unknown) => {
    try {
      return run();
    } catch (error) {
      if (error instanceof CommandError)
        throw new AppError(400, error.message, "invalid_effect");
      throw error;
    }
  };
  router.get("/", (request, response) => {
    limit("history", response.locals.sessionId);
    response.json(
      validated(() => effectCatalogueResponse(request.query.presetId)),
    );
  });
  router.post("/variants", json({ limit: "16kb" }), (request, response) => {
    limit("history", response.locals.sessionId);
    response.json(validated(() => effectVariantResponse(request.body)));
  });
  return router;
}
