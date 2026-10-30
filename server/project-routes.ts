// The project copy routes, mounted at `/api/projects` after the session
// middleware: owner pushes, agent links, Director commands and a per-project
// event stream. Local only; the hosted Worker has no project copy.
import express from "express";
import { projectFeedback } from "../shared/director/feedback";
import type { RateBucket } from "../shared/limits";
import { FILE_BYTES, type CopyEvent, type ProjectCopies } from "./projects";

export function projectRouter(
  copies: ProjectCopies,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  const session = (response: express.Response) =>
    response.locals.sessionId as string;
  router.get("/", (_request, response) => {
    limit("history", session(response));
    response.json({ projects: copies.list(session(response)) });
  });
  router.post(
    "/link",
    express.json({ limit: "1kb" }),
    async (request, response) => {
      limit("edit", session(response));
      response.json({
        project: await copies.redeem(session(response), request.body),
      });
    },
  );
  router.get("/:id", (request, response) => {
    limit("history", session(response));
    response.json(copies.read(request.params.id, session(response)));
  });
  // The person's changes since the agent's revision, and the open notes.
  router.get("/:id/feedback", (request, response) => {
    limit("history", session(response));
    const read = copies.read(request.params.id, session(response));
    response.json(
      projectFeedback({
        project: read.project,
        prompt: read.brief?.text ?? "",
      }),
    );
  });
  // A 1 MB manifest, 1 MB more for the agent's revision, and the brief.
  router.put(
    "/:id",
    express.json({ limit: "3mb" }),
    async (request, response) => {
      limit("edit", session(response));
      response.json(
        await copies.put(request.params.id, session(response), request.body),
      );
    },
  );
  router.put(
    "/:id/files/:sha256",
    express.raw({ type: "application/octet-stream", limit: FILE_BYTES }),
    async (request, response) => {
      limit("edit", session(response));
      const body: unknown = request.body;
      const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
      const result = await copies.putFile(
        request.params.id,
        session(response),
        request.params.sha256,
        bytes,
      );
      response.status(result.stored ? 201 : 200).json(result);
    },
  );
  router.get("/:id/files/:sha256", (request, response) => {
    limit("media", session(response));
    const file = copies.filePath(
      request.params.id,
      session(response),
      request.params.sha256,
    );
    response.setHeader("Content-Type", "application/octet-stream");
    // The copy's own path under .local, chosen by the server.
    response.sendFile(file, { dotfiles: "allow" });
  });
  router.post(
    "/:id/commands",
    express.json({ limit: "64kb" }),
    async (request, response) => {
      limit("edit", session(response));
      response.json(
        await copies.command(
          request.params.id,
          session(response),
          request.body,
        ),
      );
    },
  );
  router.post("/:id/link", (request, response) => {
    limit("edit", session(response));
    response
      .status(201)
      .json(copies.link(request.params.id, session(response)));
  });
  // Server-sent events: one `revision` event now, then one per accepted write.
  router.get("/:id/events", (request, response) => {
    limit("history", session(response));
    const send = (event: CopyEvent) =>
      response.write(
        `id: ${event.revision}\nevent: revision\ndata: ${JSON.stringify(event)}\n\n`,
      );
    const stream = copies.subscribe(
      request.params.id,
      session(response),
      send,
      () => response.end(),
    );
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
    });
    send({
      projectId: stream.projectId,
      copyId: stream.copyId,
      revision: stream.revision,
      baseRevision: null,
      source: "snapshot",
    });
    const ping = setInterval(() => response.write(": ping\n\n"), 20_000);
    const stop = () => {
      clearInterval(ping);
      stream.unsubscribe();
    };
    response.on("close", stop);
  });
  return router;
}
