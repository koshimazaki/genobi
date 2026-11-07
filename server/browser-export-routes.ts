import express from "express";
import {
  EXPORT_BYTES,
  exportRequest,
  exportSource,
  exportUpdate,
} from "../shared/browser-export";
import type { RateBucket } from "../shared/limits";
import type { BrowserExports } from "./browser-exports";
import { AppError } from "./errors";

export function browserExportRouter(
  service: BrowserExports,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router(),
    json = express.json({ limit: "8kb" });
  const owner = (res: express.Response) => res.locals.sessionId as string;
  const browser = (res: express.Response) => {
    if (res.locals.agent)
      throw new AppError(
        403,
        "Only the person's browser can dispatch or complete an export.",
      );
    return owner(res);
  };
  router.get("/targets", (_req, res) => {
    limit("history", owner(res));
    res.json({ targets: service.targets(owner(res)) });
  });
  router.post("/tabs", json, (req, res) => {
    limit("edit", owner(res));
    const source = exportSource.safeParse(req.body);
    if (!source.success)
      throw new AppError(400, "Name the mounted project and revision.");
    res.json(service.connect(browser(res), source.data));
  });
  router.post("/tabs/:id/poll", json, (req, res) => {
    limit("activity", owner(res));
    const source = exportSource.safeParse(req.body);
    if (!source.success)
      throw new AppError(400, "Name the mounted source revision.");
    res.json(service.poll(String(req.params.id), browser(res), source.data));
  });
  router.delete("/tabs/:id", (req, res) => {
    limit("edit", owner(res));
    res.json(
      service.disconnect(
        String(req.params.id),
        browser(res),
        undefined,
        req.query.lost === "1",
      ),
    );
  });
  router.post("/tabs/:id/link", json, (req, res) => {
    limit("edit", owner(res));
    const source = exportSource.safeParse(req.body);
    if (!source.success)
      throw new AppError(400, "Name the Scroll document and revision to link.");
    res.json(
      service.createLink(String(req.params.id), browser(res), source.data),
    );
  });
  router.post("/link", json, (req, res) => {
    limit("runnerPair", owner(res));
    if (typeof req.body?.code !== "string" || req.body.code.length > 30)
      throw new AppError(400, "Supply the code from the Scroll tab.");
    res.json(service.link(owner(res), req.body.code));
  });
  router.post("/", json, (req, res) => {
    limit("edit", owner(res));
    const request = exportRequest.safeParse(req.body);
    if (!request.success)
      throw new AppError(
        400,
        "Send requestId, tabId, exact source revision and format.",
      );
    res.status(202).json(service.request(owner(res), request.data));
  });
  router.get("/:id", (req, res) => {
    limit("history", owner(res));
    res.json(service.status(String(req.params.id), owner(res)));
  });
  router.post("/:id/cancel", json, (req, res) => {
    limit("edit", owner(res));
    res.json(service.cancel(String(req.params.id), owner(res)));
  });
  router.post("/:id/progress", json, (req, res) => {
    limit("activity", owner(res));
    const update = exportUpdate.safeParse(req.body);
    if (!update.success)
      throw new AppError(400, "Send bounded progress or an export error.");
    res.json(service.update(String(req.params.id), browser(res), update.data));
  });
  router.post(
    "/:id/artifact",
    express.raw({
      type: ["application/zip", "video/mp4", "application/json"],
      limit: EXPORT_BYTES,
    }),
    async (req, res) => {
      limit("edit", owner(res));
      res.json(
        await service.finish(
          String(req.params.id),
          browser(res),
          Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
        ),
      );
    },
  );
  router.get("/:id/artifact", async (req, res) => {
    limit("media", owner(res));
    const { bytes, receipt } = await service.artifact(
      String(req.params.id),
      owner(res),
    );
    res
      .set({
        "Content-Type": receipt.contentType,
        "Content-Disposition": `attachment; filename="${receipt.file}"`,
        "Cache-Control": "private, no-store",
        "X-Content-SHA256": receipt.sha256,
      })
      .send(bytes);
  });
  return router;
}
