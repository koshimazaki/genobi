// The studio's client for split upscales (`server/upscale-parts.ts`): plan
// and read are free; confirm and a part's retry confirm spend, each only on
// the person's press of the button that names the price.
import type { GenerateInput } from "../shared/types";
import type { PartSetView } from "../shared/upscale-parts";
import { expectedHeaders } from "./settings-store";
import { request } from "./useJobs";

type Reply = { set: PartSetView };
const BASE = "/api/upscale-parts";

function headers(input: GenerateInput, key: string, quoteId?: string) {
  return {
    "Content-Type": "application/json",
    ...(key ? { "x-byo-key": key } : {}),
    ...(quoteId ? { "Quote-Id": quoteId } : {}),
    // What the studio shows: the server refuses a run whose settings changed.
    ...expectedHeaders(input),
  };
}

export const partsClient = {
  /** The server reopens a set made from exactly this request. */
  plan: (input: GenerateInput & { partSeconds?: number }, key: string) =>
    request<Reply>(BASE, {
      method: "POST",
      headers: headers(input, key),
      body: JSON.stringify(input),
    }),
  read: (id: string, key: string) =>
    request<Reply>(`${BASE}/${encodeURIComponent(id)}`, {
      headers: key ? { "x-byo-key": key } : {},
    }),
  confirm: (input: GenerateInput, id: string, quoteId: string, key: string) =>
    request<Reply>(`${BASE}/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      headers: headers(input, key, quoteId),
    }),
  retry: (input: GenerateInput, id: string, part: number, key: string) =>
    request<Reply>(`${BASE}/${encodeURIComponent(id)}/parts/${part}/retry`, {
      method: "POST",
      headers: headers(input, key),
    }),
  confirmRetry: (
    input: GenerateInput,
    id: string,
    part: number,
    quoteId: string,
    key: string,
  ) =>
    request<Reply>(`${BASE}/${encodeURIComponent(id)}/parts/${part}/confirm`, {
      method: "POST",
      headers: headers(input, key, quoteId),
    }),
  rejoin: (id: string) =>
    request<Reply>(`${BASE}/${encodeURIComponent(id)}/join`, {
      method: "POST",
    }),
};

/** A part's line: its number, frames and seconds. */
export const partRange = (part: PartSetView["parts"][number]) =>
  `Part ${part.index + 1} · ${part.start.toFixed(2)}–${(part.start + part.duration).toFixed(2)} s · frames ${part.startFrame}–${part.startFrame + part.frames - 1}`;

/** What a part's run says now, in words. */
export function partState(part: PartSetView["parts"][number]) {
  if (part.refused) return `Not sent: ${part.refused}`;
  if (!part.job) return "Waiting";
  if (part.uncertain)
    return "Uncertain: it may have been charged. Check usage before retrying.";
  if (part.job.status === "Ready") return "Ready";
  if (part.job.error && part.job.status !== "Pending") return part.job.error;
  return part.job.status === "submitting" ? "Sending" : "Upscaling";
}
