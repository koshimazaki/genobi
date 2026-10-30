// Local only: the hosted Worker has no ffmpeg. The ffmpeg media tools (trim,
// frames, concat, crossfade and space) and the clips the studio serves,
// mounted at /api by app.ts. Writes count with the paid POSTs; reads like
// history. A clip or probe by id is read through the
// agent read scope (`readerOf`, server/agent-scope.ts).
import express from "express";
import type { RateBucket } from "../shared/limits";
import { readerOf } from "./agent-scope";
import { AppError } from "./errors";
import type { MediaTools } from "./media-tools";
import type { Store } from "./store";

export function mediaRouter(
  tools: MediaTools,
  store: Store,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  router.get("/media/tools", async (_request, response) => {
    limit("history", response.locals.sessionId);
    response.json({ ffmpeg: await tools.available() });
  });
  router.get("/media/:id/probe", async (request, response) => {
    limit("history", response.locals.sessionId);
    response.json({
      probe: await tools.probe(
        request.params.id,
        readerOf(response.locals, request.params.id),
      ),
    });
  });
  router.post(
    "/media/:operation",
    express.json({ limit: "16kb" }),
    async (request, response) => {
      const session = response.locals.sessionId as string;
      const operation = request.params.operation;
      const result =
        operation === "trim"
          ? { source: await tools.trim(request.body, session) }
          : operation === "frames"
            ? { sources: await tools.frames(request.body, session) }
            : operation === "concat"
              ? { source: await tools.concat(request.body, session) }
              : operation === "crossfade"
                ? { source: await tools.crossfade(request.body, session) }
                : operation === "space"
                  ? { source: await tools.space(request.body, session) }
                  : undefined;
      if (!result) throw new AppError(404, "API route not found.");
      response.status(201).json(result);
    },
  );
  router.get("/clips/:id", async (request, response) => {
    limit("media", response.locals.sessionId);
    const owner = readerOf(response.locals, request.params.id);
    const source = store.data.sources.find(
      (item) => item.id === request.params.id && item.sessionId === owner,
    );
    if (!source) throw new AppError(404, "Video not found.");
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.setHeader("Content-Type", source.contentType ?? "video/mp4");
    // The authenticated source lookup supplies the path; .local is intentionally hidden.
    // Express otherwise rejects its dot-directory before applying byte-range handling.
    response.sendFile(source.filePath, {
      acceptRanges: true,
      dotfiles: "allow",
    });
  });
  return router;
}
