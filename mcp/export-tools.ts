import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  EXPORT_BYTES,
  exportFormat,
  exportRequest,
  exportSource,
  type ExportStatus,
} from "../shared/browser-export";
import type { ToolDefinition } from "./definition";

export const exportTools: ToolDefinition[] = [
  {
    name: "genobi_export",
    title: "Export through the open browser",
    description:
      "Export the exact revision in a local Director/Editor or Scrolls browser, using its existing renderer. Read targets first: each tab has its own tabId, source and formats; Director needs linked project access; Scrolls needs action link with the one-use code shown under Document & agent tools. A link is consumed once; use targets to recover a lost link acknowledgement. Request takes that source, tabId, a supported format (project-zip, mp4, scroll-zip or scroll-json) and a fresh requestId UUID. Status reports queued/running/storing/done/error/cancelled; only done includes a completed artifact receipt with source, hash and download path. Cancel stops queued/rendering work; an atomic storage commit already started finishes and reports its result. Exact requestId/body replay returns the same result after a lost answer, including completed results after restart during one-hour retention. Never invent a new request after an uncertain answer. Download saves an already completed artifact to a new local file for an external agent; studio-started agents use the receipt URL. Missing browser, busy renderer or changed source is an explicit failure. No headless export or paid generation.",
    inputSchema: {
      action: z.enum([
        "targets",
        "link",
        "request",
        "status",
        "cancel",
        "download",
      ]),
      code: z.string().min(1).max(30).optional(),
      requestId: z.string().uuid().optional(),
      tabId: z.string().uuid().optional(),
      source: exportSource.optional(),
      format: exportFormat.optional(),
      id: z.string().uuid().optional(),
      filePath: z.string().min(1).max(4096).optional(),
    },
    tags: ["agents", "mcp", "director", "storyboard", "bundle"],
    docs: ["docs/browser-exports.md", "docs/project-archives.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
    async run(api, args) {
      if (args.action === "link") {
        if (typeof args.code !== "string")
          throw new Error("Supply the one-use code from the Scroll tab.");
        return api.post("/api/exports/link", { code: args.code });
      }
      if (args.action === "targets") return api.get("/api/exports/targets");
      if (args.action === "request")
        return api.post(
          "/api/exports",
          exportRequest.parse({
            requestId: args.requestId,
            tabId: args.tabId,
            source: args.source,
            format: args.format,
          }),
        );
      if (typeof args.id !== "string")
        throw new Error("Supply the export id returned by request.");
      const route = `/api/exports/${args.id}` as const;
      if (args.action === "cancel") return api.post(`${route}/cancel`, {});
      const result = await api.get<ExportStatus>(route);
      if (args.action !== "download") return result;
      if (api.agentSession)
        throw new Error(
          "Studio-started agents cannot write arbitrary local files. Return the completed receipt's download URL to the person.",
        );
      if (!result.receipt || result.state !== "done")
        throw new Error(
          "Read status until the export has a completed artifact receipt.",
        );
      if (typeof args.filePath !== "string")
        throw new Error(
          "Supply a new local filePath for the completed artifact.",
        );
      const bytes = await api.bytes(`${route}/artifact`, EXPORT_BYTES);
      if (
        bytes.length !== result.receipt.byteLength ||
        createHash("sha256").update(bytes).digest("hex") !==
          result.receipt.sha256
      )
        throw new Error("Downloaded export does not match its receipt.");
      const filePath = resolve(args.filePath);
      await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
      return { ...result.receipt, filePath };
    },
  },
];
