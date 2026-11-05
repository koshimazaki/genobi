import { z } from "zod";
import { DIRECTOR_ID } from "./director/commands";
import { DIRECTOR_PROJECT_BYTES } from "./director/types";

export const EXPORT_BYTES = DIRECTOR_PROJECT_BYTES;
export const EXPORT_RETENTION_MS = 60 * 60_000;
export const EXPORT_TAB_TTL_MS = 15_000;
export const exportSource = z.strictObject({
  kind: z.enum(["director", "scrolls"]),
  id: z.string().regex(DIRECTOR_ID),
  revision: z.number().int().nonnegative(),
});
export const exportFormat = z.enum([
  "project-zip",
  "mp4",
  "scroll-zip",
  "scroll-json",
]);
export const exportRequest = z
  .strictObject({
    requestId: z.string().uuid(),
    tabId: z.string().uuid(),
    source: exportSource,
    format: exportFormat,
  })
  .refine((value) => exportFormats(value.source.kind).includes(value.format), {
    message: "Choose a format supported by this source.",
  });
export function exportFormats(kind: ExportSource["kind"]) {
  return kind === "director"
    ? ["project-zip", "mp4"]
    : ["scroll-zip", "scroll-json"];
}
export function exportFileInfo(format: z.infer<typeof exportFormat>) {
  if (format === "mp4")
    return { contentType: "video/mp4" as const, extension: "mp4" };
  if (format === "scroll-json")
    return { contentType: "application/json" as const, extension: "json" };
  return { contentType: "application/zip" as const, extension: "zip" };
}
export const exportUpdate = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("running"),
    progress: z.number().min(0).max(1),
  }),
  z.strictObject({
    state: z.literal("error"),
    error: z.string().min(1).max(300),
  }),
  z.strictObject({ state: z.literal("cancelled") }),
]);
export type ExportSource = z.infer<typeof exportSource>;
export type ExportRequest = z.infer<typeof exportRequest>;
export type ExportState =
  "queued" | "running" | "storing" | "done" | "error" | "cancelled";
export const exportReceipt = z.strictObject({
  artifactId: z.string().uuid(),
  source: exportSource,
  format: exportFormat,
  file: z.string().regex(/^[a-zA-Z0-9_-]+-r[0-9]+\.(zip|mp4|json)$/),
  contentType: z.enum(["application/zip", "video/mp4", "application/json"]),
  byteLength: z.number().int().positive().max(EXPORT_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  download: z.string().regex(/^\/api\/exports\/[a-f0-9-]{36}\/artifact$/),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type ExportReceipt = z.infer<typeof exportReceipt>;
export interface ExportStatus {
  id: string;
  request: ExportRequest;
  state: ExportState;
  progress: number;
  error?: string;
  receipt?: ExportReceipt;
}
export function sameExportSource(a: ExportSource, b: ExportSource) {
  return a.kind === b.kind && a.id === b.id && a.revision === b.revision;
}
