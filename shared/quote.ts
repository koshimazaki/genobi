import { isDeployModel } from "./comfy/deploy-catalogue";
import { isH3, h3EstimateCredits } from "./h3";
import { isSwap } from "./openjutsu";
import { readyEntry } from "./registry";
import { h3RouterCredits, isH3Router } from "./comfy/h3-router";
import { CREDITS_PER_USD, estimateVideoCredits, isLtx } from "./comfy/ltx";
import { estimateImageUsd, isImage } from "./image";
import { isMusic, MUSIC_ESTIMATE_CREDITS } from "./music";
import { estimateUpscaleUsd, estimateVideoUsd } from "./presets";
import { estimateSeedvr2Usd, isSeedvr2 } from "./comfy/seedvr2";
import type { TakeInput, TakeRecipe, TakeStart } from "./take";
import type { GenerateInput, Source } from "./types";

/**
 * A quote runs a submission's checks without submitting: the request is
 * validated, route-checked (`requireRoute`), held to the demo budget or the
 * balance, and priced exactly as `POST /api/jobs` would, and the answer
 * carries a one-use confirmation id. A submission that sends it as `Quote-Id`
 * must match the quoted settings, and spends it in the same step that reserves
 * the run, so one quote can never pay for two.
 *
 * It holds no funds: the provider stays authoritative for the charge, and the
 * budget and balance are checked again at submission. Agents quote before
 * every paid step; the studio may submit without one.
 */
export const QUOTE_TTL_MS = 10 * 60_000;

/** A quote's confirmation id: a UUID, as `crypto.randomUUID` writes it. */
export const QUOTE_ID = /^[0-9a-f-]{36}$/;

export interface Quote {
  /** The confirmation id, sent back as the `Quote-Id` header. */
  id: string;
  estimateUsd: number;
  recipe: TakeRecipe;
  expiresAt: string;
  /**
   * Who bills a run Genobi has no price for, in place of a number: the
   * swap's GPU time on its Comfy deployment. Its `estimateUsd`
   * is then 0, meaning unpriced, never free.
   */
  billing?: string;
}

/** What an adapter keeps: the quote, the settings it covers and its spender. */
export interface QuoteRecord extends Quote {
  /** SHA-256 of the canonical settings, the take's own settings hash. */
  settings: string;
  /** The run that spent it; absent while it is unspent. */
  jobId?: string;
}

/**
 * The price both adapters reserve and every quote states. An upscale's source
 * dimensions come from measured media, never from the request.
 */
export function estimateRunUsd(
  input: GenerateInput,
  source?: Pick<Source, "width" | "height" | "duration">,
) {
  const model = input.model ?? "flux-3";
  if (isImage(input.generator)) return estimateImageUsd(input);
  // Billed per GPU second by its host, at a rate Genobi does not know.
  if (isSwap(model) || isDeployModel(model)) return 0;
  if (isMusic(input.generator)) return MUSIC_ESTIMATE_CREDITS / CREDITS_PER_USD;
  if (isH3(model)) return h3EstimateCredits(model) / CREDITS_PER_USD;
  if (isH3Router(model))
    return h3RouterCredits(input.duration, input.resolution) / CREDITS_PER_USD;
  // A local ComfyUI's run is quoted at zero by the adapter, before this.
  if (isSeedvr2(model) && source)
    return estimateSeedvr2Usd(source, input.upscaleFactor);
  if (input.generator === "upscale" && source)
    return estimateUpscaleUsd(
      source,
      input.upscaleFactor,
      input.upscaleCreativity,
    );
  if (isLtx(model))
    return (
      estimateVideoCredits(model, input.duration, input.resolution) /
      CREDITS_PER_USD
    );
  return estimateVideoUsd(input.draft, input.duration, input.resolution);
}

export const settingsHash = (take: TakeStart) =>
  take.inputs.find(
    (input): input is Extract<TakeInput, { role: "settings" }> =>
      input.role === "settings",
  )!.sha256;

export function newQuote(
  take: TakeStart,
  estimateUsd: number,
  now = Date.now(),
): QuoteRecord {
  return {
    id: crypto.randomUUID(),
    estimateUsd,
    recipe: take.recipe,
    expiresAt: new Date(now + QUOTE_TTL_MS).toISOString(),
    settings: settingsHash(take),
  };
}

/** The billing line for a recipe whose host bills by GPU time; see `Quote`. */
export function billingOf(recipe: TakeRecipe): string | undefined {
  if (
    recipe.location !== "deployment" &&
    !isSwap(readyEntry(recipe.id)?.videoModel)
  )
    return undefined;
  return "Comfy deployment GPU time, billed by Comfy to the deployment's workspace";
}

export const publicQuote = ({
  id,
  estimateUsd,
  recipe,
  expiresAt,
}: Quote): Quote => {
  const billing = billingOf(recipe);
  return {
    id,
    estimateUsd,
    recipe,
    expiresAt,
    ...(billing ? { billing } : {}),
  };
};
