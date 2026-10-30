/**
 * Explicit, ephemeral pairings between one open studio tab and the local
 * agents it hands work to: World's live control and Scrolls' panel fill.
 * Local only; the hosted Worker has neither.
 */
import type express from "express";
import type { RateBucket } from "../shared/limits";
import { worldRouter } from "./world-routes";
import { scrollsFillRouter } from "./scrolls-fill-routes";

export function mountPairings(
  app: express.Express,
  limit: (bucket: RateBucket, id: string) => void,
) {
  app.use("/api/world", worldRouter());
  // Scrolls' fill counts in the server's ceilings (edit, poll).
  app.use("/api/scrolls", scrollsFillRouter(limit));
}
