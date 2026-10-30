// `POST /api/uploads`, mounted at /api by app.ts: a file the studio or an
// agent sends, measured from its bytes and stored in the request's own
// session. Counted with the paid writes by the session middleware.
import { createHash, randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import {
  inspectUpload,
  UPLOAD_LABEL,
  UPLOAD_MESSAGE,
  UPLOAD_SUFFIX,
  UPLOAD_TYPES,
  uploadType,
} from "../shared/uploads";
import { UPSCALE_SPLIT_MAX_SECONDS } from "../shared/upscale-parts";
import { AppError } from "./errors";
import { MAX_INPUT_BYTES } from "./media";
import { publicSource, type Store } from "./store";

export function uploadRouter(store: Store) {
  const router = express.Router();
  router.post(
    "/uploads",
    express.raw({ type: UPLOAD_TYPES, limit: MAX_INPUT_BYTES }),
    async (request, response) => {
      const type = uploadType(request.headers["content-type"]);
      const body: unknown = request.body;
      if (!type || !Buffer.isBuffer(body) || body.length === 0)
        throw new AppError(400, UPLOAD_MESSAGE);
      // Measured from the bytes; browser-supplied dimensions cannot set a price.
      let metadata;
      try {
        metadata = await inspectUpload(
          type,
          body.length,
          async (at, length) =>
            new Uint8Array(body.subarray(at, at + length)).buffer,
          // This server can cut a longer clip into parts to upscale.
          UPSCALE_SPLIT_MAX_SECONDS,
        );
      } catch (error) {
        throw new AppError(400, (error as Error).message);
      }
      const id = randomUUID();
      const filePath = path.join(
        store.directory,
        "media",
        `${id}.${UPLOAD_SUFFIX[type.kind]}`,
      );
      await writeFile(filePath, body, { mode: 0o600 });
      try {
        const source = {
          id,
          filePath,
          sessionId: response.locals.sessionId as string,
          sha256: createHash("sha256").update(body).digest("hex"),
          url: `/api/clips/${id}`,
          label:
            typeof request.query.filename === "string"
              ? path
                  .basename(request.query.filename)
                  .replace(/[\x00-\x1f\x7f]/g, " ")
                  .trim()
                  .slice(0, 100)
              : UPLOAD_LABEL[type.kind],
          origin: "upload" as const,
          ...(type.kind === "video" ? {} : { mediaType: type.kind }),
          ...metadata,
        };
        store.data.sources.push(source);
        await store.save();
        response.status(201).json({ source: publicSource(source) });
      } catch (error) {
        await unlink(filePath).catch(() => {});
        throw error;
      }
    },
  );
  return router;
}
