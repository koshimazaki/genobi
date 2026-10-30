import express from "express";
import path from "node:path";
import { ArenaStore } from "./arena-store";
import { AppError } from "./errors";
import { uploadType } from "../shared/uploads";
import { inspectArenaUpload } from "../shared/arena-upload";
import type { RateBucket } from "../shared/limits";
export function arenaRouter(
  store: ArenaStore,
  limit: (bucket: RateBucket, id: string) => void,
  /** Routes that copy the studio's own media in (`server/arena-studio.ts`). */
  studioRoutes?: (router: express.Router) => void,
) {
  const router = express.Router();
  router.use((req, res, next) => {
    try {
      limit(
        req.method === "GET"
          ? req.path.includes("/files/")
            ? "media"
            : "history"
          : "edit",
        res.locals.sessionId,
      );
      next();
    } catch (error) {
      next(error);
    }
  });
  router.get("/", (_req, res) =>
    res.json({ arenas: store.list(res.locals.sessionId) }),
  );
  router.post("/", express.json({ limit: "64kb" }), async (req, res) => {
    res
      .status(201)
      .json({ arena: await store.create(res.locals.sessionId, req.body) });
  });
  router.post("/link", express.json({ limit: "1kb" }), (req, res) => {
    res.json({ arena: store.link(req.body?.code, res.locals.sessionId) });
  });
  router.get("/:id", (req, res) =>
    res.json({ arena: store.get(String(req.params.id), res.locals.sessionId) }),
  );
  router.post("/:id", express.json({ limit: "64kb" }), async (req, res) => {
    res.json({
      arena: await store.update(
        String(req.params.id),
        res.locals.sessionId,
        req.body?.revision,
        req.body?.draft,
      ),
    });
  });
  router.delete("/:id", async (req, res) => {
    await store.remove(String(req.params.id), res.locals.sessionId);
    res.json({ deleted: true });
  });
  router.post("/:id/link", (req, res) => {
    if (res.locals.agent)
      throw new AppError(403, "Connect from Arena in the studio.");
    res.json({ code: store.code(String(req.params.id), res.locals.sessionId) });
  });
  router.post(
    "/:id/files",
    (req, res, next) => {
      try {
        store.get(String(req.params.id), res.locals.sessionId);
        next();
      } catch (error) {
        next(error);
      }
    },
    express.raw({ type: () => true, limit: "64mb" }),
    async (req, res) => {
      const type = uploadType(req.headers["content-type"]);
      const bytes = req.body as Buffer;
      if (!type || type.kind === "audio" || !Buffer.isBuffer(bytes))
        throw new AppError(400, "Choose an MP4 or image file.");
      let measured;
      try {
        measured = await inspectArenaUpload(
          type,
          bytes.length,
          async (at, length) =>
            new Uint8Array(bytes.subarray(at, at + length)).buffer,
        );
      } catch (error) {
        throw new AppError(400, (error as Error).message);
      }
      const label =
        typeof req.query.name === "string"
          ? req.query.name.replace(/[\x00-\x1f\x7f/\\]/g, " ").slice(0, 100)
          : "Media";
      const slot = req.query.slot;
      if (
        slot !== undefined &&
        (typeof slot !== "string" || !/^[a-z0-9-]{1,40}$/.test(slot))
      )
        throw new AppError(400, "Name an approach in this comparison.");
      // `?slot=` makes the upload that approach's result in the same write.
      res.status(201).json(
        await store.attach(String(req.params.id), res.locals.sessionId, {
          bytes,
          measured: {
            ...measured,
            kind: type.kind,
            contentType: type.contentType,
            label,
          },
          ...(slot ? { slot: { id: slot } } : {}),
        }),
      );
    },
  );
  studioRoutes?.(router);
  router.get("/:id/files/:hash", (req, res) => {
    const arena = store.get(String(req.params.id), res.locals.sessionId);
    const media = arena.media.find((m) => m.hash === req.params.hash);
    if (!media) throw new AppError(404, "Comparison media not found.");
    res
      .type(media.contentType)
      .sendFile(path.resolve(store.directory, arena.id, media.hash), {
        dotfiles: "allow",
      });
  });
  return router;
}
