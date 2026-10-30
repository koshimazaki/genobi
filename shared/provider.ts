import { isH3 } from "./h3";
import { isH3Router } from "./comfy/h3-router";
import { isSwap } from "./openjutsu";
import { AppError } from "../server/errors";
import { isLtx } from "./comfy/ltx";
import { isSeedvr2 } from "./comfy/seedvr2";
import type { DurationEstimate, Generator, VideoModel } from "./types";

/**
 * One provider, two implementations: BFL direct (`server/bfl.ts`) and Comfy
 * Router (`shared/comfy/router.ts`). Both answer in BFL's task vocabulary so
 * the job service and the worker read one shape: a submission with a polling
 * URL, a poll with a status and a sample URL, a download, a balance.
 */
export interface ProviderSubmission {
  id: string;
  polling_url: string;
  /** BFL reports cents at submit time; Router reports nothing until the result. */
  cost?: number | null;
}
export interface ProviderResult {
  id: string;
  status: string;
  progress?: number | null;
  /** Cents, BFL direct. */
  cost?: number | null;
  /** Comfy credits, Router: the X-Comfy-Credits-Used header of the result. */
  credits?: number | null;
  result?: { sample?: string };
  /** Router's generation-duration estimate, sent while a run is in progress. */
  estimate?: DurationEstimate | null;
  /**
   * Why an `Error` ended, in Genobi's own words; never the provider's text.
   * Absent: a generic line.
   */
  error?: string;
}
export interface ProviderBalance {
  /** Cents when the provider reports a balance; null when it only verified the key. */
  usdCents: number | null;
  checkedAt: string;
}
export interface SubmitOptions {
  model?: VideoModel;
  idempotencyKey?: string;
}
export type Fetcher = typeof fetch;

export interface Provider {
  readonly id: "bfl" | "comfy";
  submit(
    generator: Generator,
    body: object,
    key: string,
    options?: SubmitOptions,
  ): Promise<ProviderSubmission>;
  poll(pollingUrl: string, key: string): Promise<ProviderResult>;
  balance(key: string): Promise<ProviderBalance>;
  download(url: string): Promise<Response>;
}

/** Comfy keys carry a documented prefix; everything else is treated as a BFL key. */
export const isComfyKey = (key: string) => key.startsWith("comfyui-");

/** Which provider a key belongs to, by the same prefix rule. */
export type KeyKind = "comfy" | "bfl";
export const keyKind = (key: string): KeyKind =>
  isComfyKey(key) ? "comfy" : "bfl";

/**
 * Whether the provider a key selects can run this generator and model. Both
 * adapters check it before pricing, so a quote is never issued for a run the
 * provider would refuse, and a refused run never reserves or spends a quote.
 * LTX (Router or a Cloud workflow) and the open Klein graph need a Comfy
 * key; Klein's API needs a BFL key, as Router lists no Klein model. FLUX 3 and
 * the upscale run on either.
 */
export function requireRoute(
  generator: Generator,
  model: VideoModel,
  key: string,
) {
  const refusal = routeRefusal(generator, model, keyKind(key));
  if (refusal) throw refusal;
}

function routeRefusal(generator: Generator, model: VideoModel, kind: KeyKind) {
  const comfy = kind === "comfy";
  if (isH3(model) && !comfy)
    return new AppError(
      400,
      "H3 runs as a Comfy workflow. Connect a Comfy key.",
      "unsupported_model",
    );
  if (isH3Router(model) && !comfy)
    return new AppError(
      400,
      "H3 reference to video runs through Comfy Router. Connect a Comfy key.",
      "unsupported_model",
    );
  if ((generator === "audio" || model === "minimax-music-3") && !comfy)
    return new AppError(
      400,
      "MiniMax Music 3 runs as a Comfy workflow. Connect a Comfy key.",
      "unsupported_model",
    );
  // The swap runs on its Comfy deployment, which takes a Comfy key.
  if (isSwap(model) && !comfy)
    return new AppError(
      400,
      "The character swap runs on its Comfy deployment. Connect a Comfy key.",
      "unsupported_model",
    );
  if (model === "flux-3-i2v" && comfy)
    return new AppError(
      400,
      "FLUX image-to-video runs on BFL direct here. Connect a BFL key.",
      "unsupported_model",
    );
  // Router lists no Klein model; BFL's own endpoint takes a BFL key.
  if (model === "flux-3-klein-api" && comfy)
    return new AppError(
      400,
      "FLUX 3 Image Klein's API runs on BFL direct. Connect a BFL key, or run Klein's open workflow with your Comfy key.",
      "unsupported_model",
    );
  // The open graph runs on the workflow route, which takes a Comfy key.
  if (model === "flux-3-klein" && !comfy)
    return new AppError(
      400,
      "Klein's open workflow runs through Comfy. Connect a Comfy key, or choose the API run with a BFL key.",
      "unsupported_model",
    );
  // SeedVR2 runs on the workflow route; Comfy Cloud takes a Comfy key. A run
  // on a local ComfyUI needs no key and is not route-checked.
  if (isSeedvr2(model) && !comfy)
    return new AppError(
      400,
      "SeedVR2 runs as an open Comfy workflow. Connect a Comfy key, run it on a local ComfyUI, or choose FLUX Video Upscale.",
      "unsupported_model",
    );
  if (isLtx(model) && !comfy)
    return new AppError(
      400,
      "LTX runs through Comfy Router. Connect a Comfy key to use it.",
      "unsupported_model",
    );
  // FLUX Video Upscale runs on either key: Router lists BFL's upscaler as
  // `bfl/video-upscale-v1`, and BFL direct takes a BFL key.
  return undefined;
}

/**
 * Which of a server's own keys a run uses. A connected BFL key overrides
 * compatible FLUX API models and upscales. Comfy-only models keep the Comfy
 * key. With one key held that key is returned, so
 * `requireRoute` still says what it cannot run.
 */
export function chooseKey(
  generator: Generator,
  model: VideoModel,
  keys: Partial<Record<KeyKind, string>>,
): string | undefined {
  const kind = chooseKeyKind(generator, model, {
    comfy: Boolean(keys.comfy),
    bfl: Boolean(keys.bfl),
  });
  return kind && keys[kind];
}

/**
 * `chooseKey` by slot rather than by key: which held slot a run spends. The
 * studio names the paying key from this, so the label and the server's own
 * choice are one rule. With both held, BFL for what a BFL key can run.
 */
export function chooseKeyKind(
  generator: Generator,
  model: VideoModel,
  held: Partial<Record<KeyKind, boolean>>,
): KeyKind | undefined {
  if (held.comfy && held.bfl)
    return routeRefusal(generator, model, "bfl") ? "comfy" : "bfl";
  return held.comfy ? "comfy" : held.bfl ? "bfl" : undefined;
}

/**
 * The key that would pay for this run, or undefined when none held here can
 * run it (`requireRoute` would refuse): what the composer says under the price.
 */
export function payingKeyKind(
  generator: Generator,
  model: VideoModel,
  held: Partial<Record<KeyKind, boolean>>,
): KeyKind | undefined {
  const kind = chooseKeyKind(generator, model, held);
  return kind && !routeRefusal(generator, model, kind) ? kind : undefined;
}

/**
 * The key a route needs before it can be priced or run: the same routes
 * `routeRefusal` refuses the other key for, so a quote and its refusal name
 * one provider. `either` means the route runs on a Comfy or a BFL key.
 */
export function requiredKeyKind(model: VideoModel): KeyKind | "either" {
  if (model === "flux-3-klein-api" || model === "flux-3-i2v") return "bfl";
  if (
    isH3(model) ||
    isH3Router(model) ||
    isLtx(model) ||
    model === "flux-3-klein" ||
    model === "minimax-music-3" ||
    isSwap(model) ||
    isSeedvr2(model)
  )
    return "comfy";
  return "either";
}

/**
 * The refusal when no usable key is held. It names the route's own key — a
 * Comfy key for LTX (Router or the Cloud workflow) and Klein's open graph, a
 * BFL key for Klein's API, either for FLUX 3 and the upscale — instead of
 * naming BFL for every route, which read as a wrong-provider error.
 */
export function missingKeyError(model: VideoModel) {
  const kind = requiredKeyKind(model);
  return new AppError(
    400,
    kind === "comfy"
      ? "Connect a Comfy key first."
      : kind === "bfl"
        ? "Connect a BFL key first."
        : "Connect your Comfy or BFL key first.",
    "invalid_key",
  );
}

/**
 * A media URL a provider handed back. Any public https origin is accepted:
 * the URL comes from an authenticated provider response, never from a visitor,
 * and Router forwards each partner's own delivery host.
 */
export function mediaUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error("invalid");
  }
  const host = url.hostname.toLowerCase();
  const literal =
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.startsWith("[") ||
    !host.includes(".");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    literal ||
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    throw new Error("unsupported");
  return url;
}
