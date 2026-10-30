/**
 * Scrolls' "Describe the video": an explicit, ephemeral hand-off between one
 * open scroll and the agent session its Send started (local only, like
 * World's pairing). The person's tab asks for a fill and gets a one-use code,
 * which goes into that session's prompt; the agent sends the panels back
 * with the code; the tab that asked, and only it, collects them and applies
 * them as ordinary revision-checked cell edits. Text only: nothing here
 * generates, quotes or spends, and nothing is written to disk.
 */
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { CELL_ID, FILL_CODE, parsePanels } from "../shared/scrolls/fill";
import type { PanelFill } from "../shared/scrolls/fill";
import { ID } from "../shared/scrolls/types";
import type { RateBucket } from "../shared/limits";
import { AppError } from "./errors";
import { sameCode } from "./pairing-code";

interface FillRequest {
  id: string;
  owner: string;
  documentId: string;
  cellIds: string[];
  /** Cleared once the agent's panels are accepted: one use. */
  code?: string;
  panels?: PanelFill[];
  created: number;
}

/** Longer than an agent session's default 15-minute timeout. */
export const FILL_TTL_MS = 20 * 60_000;
const MAX_REQUESTS = 8;

/**
 * `limit` is the server's per-session ceiling: the two writes count as
 * project edits (`edit`), the tab's two-second wait as polling (`poll`).
 */
export function scrollsFillRouter(
  limit: (bucket: RateBucket, id: string) => void = () => {},
  now: () => number = Date.now,
) {
  const router = express.Router(),
    requests = new Map<string, FillRequest>();
  const json = express.json({ limit: "64kb" });
  const owner = (res: express.Response) => res.locals.sessionId as string;
  function sweep() {
    for (const [id, r] of requests)
      if (now() - r.created > FILL_TTL_MS) requests.delete(id);
  }

  // The person's tab: one open request per session, so a new Send replaces
  // the last and only the latest session's panels can land.
  router.post("/fill", json, (req, res) => {
    limit("edit", owner(res));
    sweep();
    if (res.locals.agent)
      throw new AppError(403, "Ask for a fill from the Scrolls tab.");
    const documentId = req.body?.documentId;
    const cellIds = req.body?.cellIds;
    if (
      typeof documentId !== "string" ||
      !ID.test(documentId) ||
      !Array.isArray(cellIds) ||
      !cellIds.length ||
      cellIds.length > 16 ||
      cellIds.some((c) => typeof c !== "string" || !CELL_ID.test(c)) ||
      new Set(cellIds).size !== cellIds.length
    )
      throw new AppError(400, "Name the scroll and its 1 to 16 panels.");
    for (const [id, r] of requests)
      if (r.owner === owner(res)) requests.delete(id);
    if (requests.size >= MAX_REQUESTS)
      throw new AppError(429, "Too many scrolls are waiting for an agent.");
    const request: FillRequest = {
      id: randomUUID(),
      owner: owner(res),
      documentId,
      cellIds: [...cellIds],
      code: randomBytes(16).toString("hex"),
      created: now(),
    };
    requests.set(request.id, request);
    res.json({ id: request.id, code: request.code });
  });

  // The agent: the code from its prompt and the panels, checked whole.
  router.post("/fill/panels", json, (req, res) => {
    limit("edit", owner(res));
    sweep();
    const code = req.body?.code;
    if (typeof code !== "string" || !FILL_CODE.test(code))
      throw new AppError(400, "Use the fill code from your prompt.");
    const request = [...requests.values()].find((r) => sameCode(r.code, code));
    if (!request) throw new AppError(404, "Fill code expired or already used.");
    let panels: PanelFill[];
    try {
      panels = parsePanels(req.body?.panels, request.cellIds);
    } catch (error) {
      throw new AppError(400, (error as Error).message);
    }
    request.panels = panels;
    request.code = undefined;
    res.json({ accepted: panels.length, documentId: request.documentId });
  });

  // The tab that asked: the panels once, then the request is gone.
  router.get("/fill/:id", (req, res) => {
    limit("poll", owner(res));
    sweep();
    const request = requests.get(String(req.params.id));
    if (!request || request.owner !== owner(res) || res.locals.agent)
      throw new AppError(404, "No fill is waiting for this scroll.");
    if (!request.panels) return void res.json({ panels: null });
    requests.delete(request.id);
    res.json({ documentId: request.documentId, panels: request.panels });
  });
  return router;
}
