import type { ProjectCopies } from "./projects";
import express from "express";
import { z } from "zod";
import {
  liveScrollRequest,
  scrollSnapshot,
  scrollLiveResult,
} from "../shared/scrolls/live";
import type { RateBucket } from "../shared/limits";
import type { BrowserExports } from "./browser-exports";
import { LiveScrolls } from "./scrolls-live";
import { AppError } from "./errors";

export function scrollsLiveRouter(
  browsers: BrowserExports,
  copies: ProjectCopies,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const service = new LiveScrolls(browsers, copies),
    router = express.Router(),
    json = express.json({ limit: "72kb" });
  const owner = (res: express.Response) => res.locals.sessionId as string;
  const browser = (res: express.Response) => {
    if (res.locals.agent)
      throw new AppError(
        403,
        "Only the person's browser can dispatch or acknowledge live Scroll commands.",
      );
    return owner(res);
  };
  const parsed = <T>(read: () => T): T => {
    try {
      return read();
    } catch {
      throw new AppError(
        400,
        "Send a valid bounded Scroll snapshot or exact command context.",
      );
    }
  };
  router.get("/targets", (_req, res) => {
    limit("history", owner(res));
    res.json({ targets: service.targets(owner(res)) });
  });
  router.get("/tabs/:id", (req, res) => {
    limit("history", owner(res));
    res.json(service.inspect(String(req.params.id), owner(res)));
  });
  router.post("/tabs/:id/poll", json, (req, res) => {
    limit("activity", owner(res));
    res.json(
      service.poll(
        String(req.params.id),
        browser(res),
        parsed(() => scrollSnapshot(req.body)),
      ),
    );
  });
  router.post("/commands", json, async (req, res) => {
    limit("edit", owner(res));
    res.status(202).json(
      await service.request(
        owner(res),
        parsed(() => liveScrollRequest.parse(req.body)),
      ),
    );
  });
  router.get("/commands/:id", (req, res) => {
    limit("history", owner(res));
    res.json(service.status(String(req.params.id), owner(res)));
  });
  router.post("/commands/:id/result", json, (req, res) => {
    limit("activity", owner(res));
    const result = parsed(() => {
      const r = z
        .union([
          z.object({ snapshot: z.unknown() }).strict(),
          z.object({ error: z.string().min(1).max(300) }).strict(),
        ])
        .parse(req.body);
      return "snapshot" in r ? { snapshot: scrollLiveResult(r.snapshot) } : r;
    });
    res.json(service.finish(String(req.params.id), browser(res), result));
  });
  router.get("/commands/:id/media", (req, res) => {
    limit("media", owner(res));
    const media = service.media(String(req.params.id), browser(res));
    res
      .set({
        "Content-Type": media.contentType,
        "X-Content-SHA256": media.sha256,
        "Cache-Control": "private, no-store",
      })
      .send(media.bytes);
  });
  return router;
}
