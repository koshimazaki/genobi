import { z } from "zod";
import { liveScrollRequest, scrollContext } from "../shared/scrolls/live";
import type { ToolDefinition } from "./definition";
export const scrollsLiveTools: ToolDefinition[] = [
  {
    name: "genobi_scrolls_live",
    title: "Inspect or edit the mounted Scroll",
    description:
      "Link the one-use code shown in Scrolls Document & agent tools, then inspect the exact tab. Returns document, revision, selected cell and available media IDs. Keep that original context with the conversation; never silently retarget after a document/cell switch. Request applies an existing Scroll command against context and command.revision; metadata-only add-asset is refused. Read status for the applied document or explicit conflict. Reuse the exact requestId/body after an uncertain answer; never make a new request to retry. Commands and results are ephemeral, bounded to one hour; a server restart loses them, so inspect before proceeding. This is local paired-browser control; no headless service, paid generation or arbitrary document opening. Pure genobi_scrolls JSON tools remain available.",
    inputSchema: {
      action: z.enum(["targets", "link", "inspect", "request", "status"]),
      code: z.string().min(1).max(30).optional(),
      tabId: z.string().uuid().optional(),
      requestId: z.string().uuid().optional(),
      context: scrollContext.optional(),
      command: z.record(z.string(), z.unknown()).optional(),
      id: z.string().uuid().optional(),
    },
    tags: ["agents", "mcp", "storyboard"],
    docs: ["docs/live-scrolls.md", "docs/browser-exports.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    async run(api, args) {
      const root = "/api/exports/scrolls";
      if (args.action === "link") {
        if (typeof args.code !== "string")
          throw new Error("Supply the one-use code from the open Scroll.");
        return api.post("/api/exports/link", { code: args.code });
      }
      if (args.action === "targets") return api.get(`${root}/targets`);
      if (args.action === "request")
        return api.post(
          `${root}/commands`,
          liveScrollRequest.parse({
            requestId: args.requestId,
            tabId: args.tabId,
            context: args.context,
            command: args.command,
          }),
        );
      if (args.action === "inspect") {
        if (typeof args.tabId !== "string")
          throw new Error("Choose a linked tabId from targets.");
        return api.get(`${root}/tabs/${encodeURIComponent(args.tabId)}`);
      }
      if (typeof args.id !== "string")
        throw new Error("Supply the returned command id.");
      return api.get(`${root}/commands/${encodeURIComponent(args.id)}`);
    },
  },
];
