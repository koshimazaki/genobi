import { AppError } from "../../server/errors";
import {
  mediaUrl,
  type Fetcher,
  type Provider,
  type ProviderBalance,
  type ProviderResult,
  type ProviderSubmission,
  type SubmitOptions,
} from "../provider";
import type { DurationEstimate, Generator, VideoModel } from "../types";
import { H3_ROUTER_ROUTE } from "./h3-router";

/**
 * Comfy Router, checked against docs.comfy.org/router-openapi.yaml on
 * 10 October 2026. Queued route only: POST …/requests answers 201 with a
 * status URL and a response URL; the status is IN_QUEUE, IN_PROGRESS or
 * COMPLETED; the response URL returns the partner's native output, 202 while
 * unfinished, 410 once the result aged out. The key travels in X-API-Key. There
 * is no balance endpoint; a finished run reports its cost in a header.
 */
export const ROUTER_BASE = "https://api.comfy.org";
/**
 * Acoustic Space and open Klein are workflow-route graphs, and Router lists no
 * Klein model, so none of the three has a Router route. Stills and edits go to
 * `bfl/flux-3-image`, and the upscale to `UPSCALE_ROUTE`.
 */
const ROUTES: Record<
  Exclude<
    VideoModel,
    | import("./deploy-catalogue").DeployModel
    | "ltx-2.5-open"
    | "ltx-2.5-akuspace"
    | "flux-3-klein"
    | "flux-3-klein-api"
    | "flux-3-i2v"
    | "minimax-h3"
    | "minimax-h3-canny"
    | "minimax-h3-depth"
    | "minimax-h3-combined"
    | "openjutsu-swap"
    | "seedvr2-upscale"
    | "minimax-music-3"
  >,
  string
> = {
  "flux-3": "bfl/flux-3-video",
  "ltx-2.5": "ltx/ltx-2-5-fast",
  "ltx-2.5-pro": "ltx/ltx-2-5-pro",
  "minimax-h3-router": H3_ROUTER_ROUTE,
};
/**
 * FLUX Video Upscale through Router, checked against
 * docs.comfy.org/router-schemas/bfl/video-upscale-v1.json on 23 October 2026
 * (body: `shared/upscale.ts`). The page documents the synchronous route only;
 * the queued route refuses models that answer in bytes, and this one answers
 * with BFL's JSON result document (`result.sample` re-hosted by Comfy), so it
 * is sent queued like the others. Unverified until a real run.
 */
export const UPSCALE_ROUTE = "bfl/video-upscale-v1";
const STATUS_PATH =
  /^\/v2\/models\/[a-z0-9-]+\/[a-z0-9.-]+\/requests\/[A-Za-z0-9_-]+\/status$/;
const messages: Record<string, string> = {
  invalid_input: "Comfy could not accept these settings.",
  content_policy_violation: "This request was stopped by Comfy moderation.",
  insufficient_credits: "Your Comfy account does not have enough credits.",
  unauthorized: "The API key was not accepted.",
  forbidden: "This key does not have access to this model.",
  rate_limited: "Comfy is busy. Please wait before trying again.",
  concurrency_limit_exceeded: "Comfy is busy. Please wait before trying again.",
  model_not_found: "Comfy does not know this model.",
  // Router's rollout state, not a fault: terminal, so never retried.
  not_enabled: "Comfy Router is not switched on for this key yet.",
};

/** api.comfy.org/openapi, checked 26 October 2026: even *_micros is cents. */
function customerBalanceCents(data: unknown): number | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const balance = data as Record<string, unknown>;
  if (
    typeof balance.currency !== "string" ||
    balance.currency.toLowerCase() !== "usd"
  )
    return null;
  // Effective balance includes pending charges and may legitimately be negative.
  // Prefer it over the total, then the explicit cents names over legacy aliases.
  for (const field of [
    "effective_balance_cents",
    "effective_balance_micros",
    "amount_cents",
    "amount_micros",
  ]) {
    if (balance[field] === undefined) continue;
    const value = balance[field];
    return typeof value === "number" &&
      Number.isFinite(value) &&
      (value >= 0 || field.startsWith("effective_"))
      ? value
      : null;
  }
  return null;
}

export function routerStatusUrl(value: unknown): URL {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new AppError(502, "The provider returned an invalid URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.comfy.org" ||
    url.username ||
    url.password ||
    url.port ||
    !STATUS_PATH.test(url.pathname)
  )
    throw new AppError(
      502,
      "The provider returned an unsupported delivery location.",
    );
  return url;
}

/** Cost of a finished run, from the result's header. A missing header is not "free". */
/**
 * Router's generation-duration estimate from a status read while the run is
 * `IN_PROGRESS` (router-openapi.yaml, checked 25 October 2026): the median of
 * recent runs in whole seconds, its 90th percentile, and whether it was
 * measured (`historical`) or a per-media fallback (`default`). It is the whole
 * run once the provider accepted it, not time remaining; absent until the
 * provider has the job, and whenever Router cannot give one.
 */
export function durationEstimate(
  response: Response,
): DurationEstimate | undefined {
  const whole = (name: string) => {
    const raw = response.headers.get(name);
    if (raw === null || !/^\d{1,6}$/.test(raw.trim())) return undefined;
    const value = Number(raw.trim());
    return value > 0 ? value : undefined;
  };
  const seconds = whole("X-Comfy-Estimated-Duration-Seconds");
  if (seconds === undefined) return undefined;
  const source =
    response.headers.get("X-Comfy-Estimate-Source")?.trim() === "historical"
      ? "historical"
      : "default";
  const p90 = whole("X-Comfy-Estimated-Duration-P90-Seconds");
  return {
    seconds,
    ...(p90 !== undefined && p90 >= seconds ? { p90Seconds: p90 } : {}),
    source,
  };
}

export function creditsUsed(response: Response): number | null {
  const raw = response.headers.get("X-Comfy-Credits-Used");
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export class ComfyRouter implements Provider {
  readonly id = "comfy" as const;
  constructor(
    private readonly fetcher: Fetcher = (...args) => fetch(...args),
  ) {}

  async submit(
    generator: Generator,
    body: object,
    key: string,
    options: SubmitOptions = {},
  ): Promise<ProviderSubmission> {
    const model = options.model ?? "flux-3";
    if ((generator === "image" || generator === "edit") && model !== "flux-3")
      throw new AppError(400, "Images run on FLUX 3.", "unsupported_model");
    // An upscale carries FLUX 3 (`shared/registry.ts`); anything else is a fault.
    if (generator === "upscale" && model !== "flux-3")
      throw new AppError(
        400,
        "Upscales run on FLUX Video Upscale.",
        "unsupported_model",
      );
    if (!(model in ROUTES))
      throw new AppError(
        400,
        "This model runs as a Comfy Cloud workflow, not through Comfy Router.",
        "unsupported_model",
      );
    const route =
      generator === "image" || generator === "edit"
        ? "bfl/flux-3-image"
        : generator === "upscale"
          ? UPSCALE_ROUTE
          : ROUTES[model as keyof typeof ROUTES];
    let response: Response;
    try {
      // An uncertain POST is never retried: it may already have incurred a charge.
      response = await this.fetcher(
        `${ROUTER_BASE}/v2/models/${route}/requests`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": key,
            ...(options.idempotencyKey
              ? { "Idempotency-Key": options.idempotencyKey }
              : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
          redirect: "manual",
        },
      );
    } catch {
      throw new AppError(
        502,
        "Submission could not be confirmed. Check Comfy usage before trying again.",
        "submission_unknown",
      );
    }
    if (response.status >= 500)
      throw new AppError(
        502,
        "Submission could not be confirmed. Check Comfy usage before trying again.",
        "submission_unknown",
      );
    const result = await this.readJson<{
      request_id?: string;
      status_url?: string;
    }>(response);
    if (!result.request_id || !result.status_url)
      throw new AppError(
        502,
        "Submission could not be confirmed. Check Comfy usage before trying again.",
        "submission_unknown",
      );
    routerStatusUrl(result.status_url);
    return { id: result.request_id, polling_url: result.status_url };
  }

  async poll(pollingUrl: string, key: string): Promise<ProviderResult> {
    const url = routerStatusUrl(pollingUrl);
    const id = url.pathname.split("/").at(-2) ?? "";
    const read = await this.fetcher(url, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(20_000),
      redirect: "manual",
    });
    const status = await this.readJson<{
      status?: string;
      error_type?: string;
    }>(read);
    if (status.status === "IN_QUEUE") return { id, status: "Pending" };
    if (status.status === "IN_PROGRESS")
      return { id, status: "Generating", estimate: durationEstimate(read) };
    if (status.status !== "COMPLETED")
      throw new AppError(502, "Comfy returned an unexpected job state.");
    if (status.error_type)
      return {
        id,
        status:
          status.error_type === "content_policy_violation"
            ? "Content Moderated"
            : "Error",
      };
    // COMPLETED: collect the native output from the response URL.
    const response = await this.fetcher(
      new URL(url.pathname.replace(/\/status$/, ""), ROUTER_BASE),
      {
        headers: { "X-API-Key": key },
        signal: AbortSignal.timeout(20_000),
        redirect: "manual",
      },
    );
    if (response.status === 202) return { id, status: "Generating" };
    if (response.status === 410) return { id, status: "Task not found" };
    const credits = creditsUsed(response);
    const native = await this.readJson<{
      status?: string;
      result?: { sample?: string; video_url?: string } | null;
      error?: unknown;
      // MiniMax H3's terminal task document (`shared/comfy/h3-router.ts`).
      task?: {
        status?: string;
        content?: { url?: string } | null;
        error?: unknown;
      } | null;
    }>(response);
    const sample =
      native.result?.sample ??
      native.result?.video_url ??
      (native.task?.status === "succeeded"
        ? native.task.content?.url
        : undefined);
    if (sample && !native.error && !native.task?.error) {
      mediaUrl(sample);
      return { id, status: "Ready", result: { sample }, credits };
    }
    return { id, status: "Error", credits };
  }

  /**
   * Router has no balance route. The key is verified against the model
   * catalogue (read-only, free); the Cloud customer balance is tried after
   * and reported when it answers, so the pill can show spend alone when it
   * does not.
   */
  async balance(key: string): Promise<ProviderBalance> {
    const probe = await this.fetcher(
      `${ROUTER_BASE}/v2/models/${ROUTES["ltx-2.5"]}`,
      {
        headers: { "X-API-Key": key, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
        cache: "no-store",
      },
    ).catch(() => {
      throw new AppError(502, "Could not reach Comfy. Try again.");
    });
    await this.readJson<unknown>(probe);
    const checkedAt = new Date().toISOString();
    let usdCents: number | null = null;
    try {
      const response = await this.fetcher(`${ROUTER_BASE}/customers/balance`, {
        headers: { "X-API-Key": key, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
        cache: "no-store",
      });
      if (response.ok) {
        usdCents = customerBalanceCents(await response.json());
      }
    } catch {
      usdCents = null;
    }
    return { usdCents, checkedAt };
  }

  async download(url: string): Promise<Response> {
    let target: URL;
    try {
      target = mediaUrl(url);
    } catch {
      throw new AppError(
        502,
        "The provider returned an unsupported delivery location.",
      );
    }
    const response = await this.fetcher(target, {
      signal: AbortSignal.timeout(60_000),
      redirect: "manual",
    });
    // A signed link past its window (H3's lasts 12 hours) is refused or gone.
    if ([403, 404, 410].includes(response.status))
      throw new AppError(
        410,
        "The provider’s result link expired before it could be saved.",
        "delivery_expired",
      );
    if (!response.ok || !response.body)
      throw new AppError(502, "The download failed. We will try again.");
    return response;
  }

  private async readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const type = response.headers.get("X-Comfy-Error-Type") ?? "";
      const byStatus: Record<number, string> = {
        401: messages.unauthorized,
        402: messages.insufficient_credits,
        403: messages.forbidden,
        // Router documents a 413 but no size; a 50 MB upscale source is ~67 MB inline.
        413: "This source video is too large to send to Comfy.",
        422: messages.invalid_input,
        429: messages.rate_limited,
      };
      throw new AppError(
        response.status === 429 ? 429 : 502,
        messages[type] ??
          byStatus[response.status] ??
          "Comfy could not complete the request.",
        `provider_${response.status}`,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppError(502, "Comfy returned an unreadable response.");
    }
  }
}
