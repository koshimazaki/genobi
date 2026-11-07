import { BrowserExports } from "./browser-exports";
import { scrollsLiveRouter } from "./scrolls-live-routes";
/**
 * Explicit, ephemeral pairings between one open studio tab and the local
 * agents it hands work to: World's live control and Scrolls' panel fill.
 * Local only; the hosted Worker has neither.
 */
import type express from "express";
import type { RateBucket } from "../shared/limits";
import type { AgentSessions } from "./agent-sessions";
import { worldRouter } from "./world-routes";
import { scrollsFillRouter } from "./scrolls-fill-routes";
import type { ProjectCopies } from "./projects";
import { browserExportRouter } from "./browser-export-routes";

export async function mountPairings(
  app: express.Express,
  limit: (bucket: RateBucket, id: string) => void,
  agents: Pick<AgentSessions, "active">,
  projects?: ProjectCopies,
) {
  // A World tab may grant only its owner's running session.
  app.use(
    "/api/world",
    worldRouter({
      ownsRun: (run, owner) => agents.active(owner)?.id === run,
      projects,
    }),
  );
  // Scrolls' fill counts in the server's ceilings (edit, poll).
  app.use("/api/scrolls", scrollsFillRouter(limit));
  if (projects) {
    const browsers = new BrowserExports(projects);
    await browsers.load();
    app.use("/api/exports/scrolls", scrollsLiveRouter(browsers, limit));
    app.use("/api/exports", browserExportRouter(browsers, limit));
  }
}
