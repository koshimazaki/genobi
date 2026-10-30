import express from "express";
import { readFile } from "node:fs/promises";
import type { ArenaMedia } from "../shared/arena";
import { inspectArenaUpload } from "../shared/arena-upload";
import { inspectImage } from "../shared/image";
import type { RateBucket } from "../shared/limits";
import { arenaRouter } from "./arena-routes";
import type { ArenaStore } from "./arena-store";
import { AppError } from "./errors";
import type { JobService } from "./jobs";
import { loadSamples, sampleFile } from "./media";
import type { Store } from "./store";

/** A studio file Arena may copy: the session's own, or a catalogue clip. */
interface StudioFile {
  file: string;
  kind: "image" | "video";
  label: string;
}
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const SLOT = /^[a-z0-9-]{1,40}$/;

/**
 * Where Arena's studio media comes from. A run counts only when it is Ready
 * in this session; a source is this session's upload or result, or a public
 * catalogue clip. Nothing here reaches another session's files.
 */
export function arenaStudio(
  service: Pick<JobService, "owned">,
  store: Store,
  publicDirectory: string,
) {
  const own = (id: string, sessionId: string): StudioFile | undefined => {
    const source = store.data.sources.find(
      (s) => s.id === id && s.sessionId === sessionId,
    );
    if (!source || source.mediaType === "audio") return undefined;
    return {
      file: source.filePath,
      kind: source.mediaType === "image" ? "image" : "video",
      label: source.label,
    };
  };
  return {
    run(jobId: string, sessionId: string): StudioFile {
      const job = service.owned(jobId, sessionId);
      const found = job.status === "Ready" && own(job.id, sessionId);
      if (!found) throw new AppError(409, "That run has not finished yet.");
      return found;
    },
    async source(id: string, sessionId: string): Promise<StudioFile> {
      const found = own(id, sessionId);
      if (found) return found;
      const sample = (await loadSamples(publicDirectory)).find(
        (s) => s.id === id,
      );
      if (!sample || sample.mediaType === "audio")
        throw new AppError(404, "That media is not in this studio session.");
      return {
        file: await sampleFile(sample, publicDirectory),
        kind: sample.mediaType === "image" ? "image" : "video",
        label: sample.label,
      };
    },
  };
}
type Studio = ReturnType<typeof arenaStudio>;

/** Bytes measured as an upload is, so a copy obeys Arena's own limits. */
async function measure(found: StudioFile) {
  const bytes = await readFile(found.file);
  try {
    const contentType =
      found.kind === "video" ? "video/mp4" : inspectImage(bytes).contentType;
    const measured = await inspectArenaUpload(
      { kind: found.kind, contentType } as never,
      bytes.length,
      async (at, length) =>
        new Uint8Array(bytes.subarray(at, at + length)).buffer,
    );
    const media: Omit<ArenaMedia, "hash" | "bytes"> = {
      width: measured.width,
      height: measured.height,
      duration: "duration" in measured ? Number(measured.duration) : 0,
      kind: found.kind,
      contentType,
      label: found.label.replace(/[\x00-\x1f\x7f/\\]/g, " ").slice(0, 100),
    };
    return { bytes, media };
  } catch (error) {
    throw new AppError(400, (error as Error).message);
  }
}

function studioRoutes(store: ArenaStore, studio: Studio) {
  return (router: express.Router) => {
    // A finished run from the queue becomes its approach's result. The file
    // is copied, so the comparison outlives the job's own retention.
    router.post(
      "/:id/slots/:slot/result",
      express.json({ limit: "1kb" }),
      async (req, res) => {
        const jobId = req.body?.jobId;
        if (typeof jobId !== "string" || !/^[a-f0-9-]{36}$/.test(jobId))
          throw new AppError(400, "Choose a run from this comparison.");
        const { bytes, media } = await measure(
          studio.run(jobId, res.locals.sessionId),
        );
        res.json(
          await store.attach(String(req.params.id), res.locals.sessionId, {
            bytes,
            measured: media,
            slot: { id: String(req.params.slot), jobId },
          }),
        );
      },
    );
    // Studio media by id (an upload, a result or a catalogue clip): a
    // reference, or an approach's result when `slot` is named. Agents use
    // this; the browser's drag and drop uploads the same bytes.
    router.post(
      "/:id/media",
      express.json({ limit: "1kb" }),
      async (req, res) => {
        const { sourceId, slot } = req.body ?? {};
        if (typeof sourceId !== "string" || !ID.test(sourceId))
          throw new AppError(400, "Name the studio media to add.");
        if (
          slot !== undefined &&
          (typeof slot !== "string" || !SLOT.test(slot))
        )
          throw new AppError(400, "Name an approach in this comparison.");
        const { bytes, media } = await measure(
          await studio.source(sourceId, res.locals.sessionId),
        );
        res.status(201).json(
          await store.attach(String(req.params.id), res.locals.sessionId, {
            bytes,
            measured: media,
            ...(slot ? { slot: { id: slot } } : {}),
          }),
        );
      },
    );
    // An agent asks the person to run approaches; it cannot spend. The
    // studio shows the request beside Run, which quotes and confirms.
    router.post(
      "/:id/run-request",
      express.json({ limit: "2kb" }),
      async (req, res) => {
        res.json({
          arena: await store.requestRun(
            String(req.params.id),
            res.locals.sessionId,
            req.body?.slots,
          ),
        });
      },
    );
    router.delete("/:id/run-request", async (req, res) => {
      res.json({
        arena: await store.requestRun(
          String(req.params.id),
          res.locals.sessionId,
          null,
        ),
      });
    });
  };
}

/** Arena's routes, with the studio's own media to copy from. */
export const arenaRoutes = (
  arena: ArenaStore,
  limit: (bucket: RateBucket, id: string) => void,
  studio: Studio,
) => arenaRouter(arena, limit, studioRoutes(arena, studio));
