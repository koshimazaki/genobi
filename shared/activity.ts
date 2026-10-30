/** Private operational history. Never contains prompts, arguments, credentials or provider IDs. */
export const ACTIVITY_LIMIT = 200;
export const ACTIVITY_PHASES = [
  "started",
  "succeeded",
  "failed",
  "unknown",
] as const;
export interface ActivityEvent {
  id: string;
  at: string;
  tool: string;
  phase: (typeof ACTIVITY_PHASES)[number];
  source: "server" | "mcp" | "browser";
  backend?: "router" | "bfl" | "local" | "cloud" | "studio";
}
export interface ActivityHistory {
  enabled: boolean;
  events: ActivityEvent[];
  warning?: string;
}
export const BROWSER_TOOLS = [
  "director",
  "project-revision",
  "scene",
  "scrolls",
  "dual-swords",
  "generation",
  "voice",
] as const;
export function cleanActivity(value: unknown): ActivityEvent {
  const v = value as ActivityEvent;
  if (
    !v ||
    typeof v.id !== "string" ||
    typeof v.tool !== "string" ||
    typeof v.at !== "string" ||
    v.at.length > 40 ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id) ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(v.tool) ||
    !ACTIVITY_PHASES.includes(v.phase) ||
    !["server", "mcp", "browser"].includes(v.source) ||
    !Number.isFinite(Date.parse(v.at)) ||
    (v.backend !== undefined &&
      !["router", "bfl", "local", "cloud", "studio"].includes(v.backend))
  )
    throw new Error("Invalid activity event.");
  return {
    id: v.id,
    at: v.at,
    tool: v.tool,
    phase: v.phase,
    source: v.source,
    ...(v.backend ? { backend: v.backend } : {}),
  };
}
export function mergeActivity(events: ActivityEvent[], event: ActivityEvent) {
  const held = events.find((e) => e.id === event.id);
  // A delayed start cannot replace a terminal result from another request.
  if (held && held.phase !== "started" && event.phase === "started")
    return events;
  return [...events.filter((e) => e.id !== event.id), cleanActivity(event)]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-ACTIVITY_LIMIT);
}
