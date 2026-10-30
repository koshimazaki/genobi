import type { Route } from "./registry";

/**
 * Route names older records carry, and the route each one means now. Takes
 * reserved before the workflow route had destinations recorded `cloud`; they
 * read as `workflow` rather than being rewritten, as `legacy-camera.ts` keeps
 * older preset ids replayable.
 */
const RENAMED: Readonly<Record<string, Route>> = { cloud: "workflow" };

export const currentRoute = (route: string): Route =>
  RENAMED[route] ?? (route as Route);
