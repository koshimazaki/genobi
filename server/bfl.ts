import { AppError } from "./errors";
import {
  mediaUrl,
  type Fetcher,
  type Provider,
  type ProviderBalance,
  type ProviderResult,
  type ProviderSubmission,
  type SubmitOptions,
} from "../shared/provider";
export type {
  Fetcher,
  ProviderResult,
  ProviderSubmission,
} from "../shared/provider";

export function providerUrl(value: unknown, kind: "poll" | "media"): URL {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new AppError(502, "The provider returned an invalid URL.");
  }
  const host = url.hostname.toLowerCase();
  const bflHost =
    host === "api.bfl.ai" || /^api\.[a-z0-9-]+\.bfl\.ai$/.test(host);
  // A media URL may come from BFL direct or from any partner Router forwards.
  if (kind === "media") {
    try {
      return mediaUrl(value);
    } catch {
      throw new AppError(
        502,
        "The provider returned an unsupported delivery location.",
      );
    }
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !bflHost ||
    url.pathname !== "/v1/get_result"
  ) {
    throw new AppError(
      502,
      "The provider returned an unsupported delivery location.",
    );
  }
  return url;
}

export class BflClient implements Provider {
  readonly id = "bfl" as const;
  constructor(
    private readonly fetcher: Fetcher = (...args) => fetch(...args),
  ) {}

  async submit(
    generator: import("../shared/types").Generator,
    body: object,
    key: string,
    options: SubmitOptions = {},
  ): Promise<ProviderSubmission> {
    // Klein's API (POST /v1/flux-3-image-klein) makes stills only.
    const klein = options.model === "flux-3-klein-api" && generator === "image";
    if (
      options.model &&
      options.model !== "flux-3" &&
      options.model !== "flux-3-i2v" &&
      !klein
    )
      throw new AppError(
        400,
        options.model.startsWith("flux-3-klein")
          ? "Klein runs here as BFL's image endpoint only."
          : "LTX runs through Comfy Router. Connect a Comfy key to use it.",
        "unsupported_model",
      );
    const endpoint = klein
      ? "flux-3-image-klein"
      : generator === "video"
        ? "flux-3-video"
        : generator === "upscale"
          ? "flux-tools/video-upscale-v1"
          : "flux-3-image";
    let response: Response;
    try {
      // An uncertain POST is never retried: it may already have incurred a charge.
      response = await this.fetcher(`https://api.bfl.ai/v1/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
        redirect: "manual",
      });
    } catch {
      throw new AppError(
        502,
        "Submission could not be confirmed. Check BFL usage before trying again.",
        "submission_unknown",
      );
    }
    if (response.status >= 500)
      throw new AppError(
        502,
        "Submission could not be confirmed. Check BFL usage before trying again.",
        "submission_unknown",
      );
    const result = await this.readJson<ProviderSubmission>(response);
    if (!result.id || !result.polling_url)
      throw new AppError(
        502,
        "Submission could not be confirmed. Check BFL usage before trying again.",
        "submission_unknown",
      );
    providerUrl(result.polling_url, "poll");
    return result;
  }

  async poll(pollingUrl: string, key: string): Promise<ProviderResult> {
    const url = providerUrl(pollingUrl, "poll");
    const response = await this.fetcher(url, {
      headers: { "x-key": key },
      signal: AbortSignal.timeout(20_000),
      redirect: "manual",
    });
    // BFL can report a terminal task error with HTTP 500. Only accept a
    // task-shaped response for this exact polling ID; generic outages retry.
    if (response.status >= 500) {
      const result = (await response
        .clone()
        .json()
        .catch(() => null)) as ProviderResult | null;
      if (
        result?.status === "Error" &&
        typeof result.id === "string" &&
        result.id.length > 0 &&
        result.id === url.searchParams.get("id")
      )
        return {
          id: result.id,
          status: "Error",
          ...(typeof result.cost === "number" &&
          Number.isFinite(result.cost) &&
          result.cost >= 0
            ? { cost: result.cost }
            : {}),
        };
    }
    return this.readJson<ProviderResult>(response);
  }

  async credits(key: string): Promise<number> {
    let response: Response;
    try {
      response = await this.fetcher("https://api.bfl.ai/v1/credits", {
        headers: { "x-key": key, accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
        cache: "no-store",
      });
    } catch {
      throw new AppError(502, "Could not check the BFL balance. Try again.");
    }
    const data = await this.readJson<{ credits?: unknown } | null>(response);
    if (
      typeof data?.credits !== "number" ||
      !Number.isFinite(data.credits) ||
      data.credits < 0
    )
      throw new AppError(502, "BFL returned an invalid credit balance.");
    return data.credits;
  }

  async balance(key: string): Promise<ProviderBalance> {
    return {
      usdCents: await this.credits(key),
      checkedAt: new Date().toISOString(),
    };
  }

  async download(url: string): Promise<Response> {
    const response = await this.fetcher(providerUrl(url, "media"), {
      signal: AbortSignal.timeout(60_000),
      redirect: "manual",
    });
    if (response.status === 403 || response.status === 404)
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
    const messages: Record<number, string> = {
      401: "The API key was not accepted.",
      403: "This key does not have access to this endpoint.",
      402: "Your BFL account does not have enough credits.",
      429: "BFL is busy. Please wait before trying again.",
      422: "BFL could not accept these settings or this source video.",
    };
    if (!response.ok)
      throw new AppError(
        response.status === 429 ? 429 : 502,
        messages[response.status] ?? "BFL could not complete the request.",
        `provider_${response.status}`,
      );
    try {
      return (await response.json()) as T;
    } catch {
      throw new AppError(502, "BFL returned an unreadable response.");
    }
  }
}
