import express from "express";
import {
  PROJECT_MEDIA_STAGE_BYTES,
  PROJECT_MEDIA_TYPES,
} from "../shared/project-media";
import type { RateBucket } from "../shared/limits";
import { ProjectMediaStaging } from "./project-media-stage";
import type { ProjectCopies } from "./projects";

export async function projectMediaRouter(
  copies: ProjectCopies,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const staging = new ProjectMediaStaging(copies);
  await staging.sweep();
  const router = express.Router();
  const session = (response: express.Response) =>
    response.locals.sessionId as string;
  router.post(
    "/:id/media/:sha256",
    express.raw({
      type: [...PROJECT_MEDIA_TYPES],
      limit: PROJECT_MEDIA_STAGE_BYTES,
    }),
    async (request, response) => {
      limit("edit", session(response));
      const result = await staging.stage(
        request.params.id,
        session(response),
        request.params.sha256,
        Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
        request.headers["content-type"],
      );
      response.status(result.stored ? 201 : 200).json(result);
    },
  );
  router.get("/:id/media/:sha256", async (request, response) => {
    limit("history", session(response));
    const { receipt } = await staging.read(
      request.params.id,
      session(response),
      request.params.sha256,
    );
    response.json({ receipt });
  });
  return router;
}
