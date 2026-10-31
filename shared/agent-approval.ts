/**
 * Confirm before spending (issue #23): when an agent session quotes a paid
 * step, the person sees that step in their studio, with its plan and price,
 * and approves or declines it there. Nothing paid runs without that click.
 * Paid approvals stay in the local studio; the hosted relay cannot approve.
 */
import type { DestinationKind } from "./comfy/destination";
import type { Quote } from "./quote";
import { entryLabel, readyEntry, type Route } from "./registry";
import { composePrompt, estimateUpscaleOutput } from "./presets";
import type { GenerateInput, Source } from "./types";

/**
 * - `pending`: waiting for the person.
 * - `submitting`: approved; the run is being reserved and sent, once.
 * - `started`: the run exists (`jobId`), in the person's gallery.
 * - `declined`: the person said no; the quote was voided.
 * - `expired`: the quote ran out before an approval.
 * - `refused`: the studio refused the run before anything was reserved
 *   (a setting, the key or the inputs changed); ask the agent for a new quote.
 * - `uncertain`: the run may or may not have started. It is never retried;
 *   the person checks the gallery.
 */
export type ApprovalStatus =
  | "pending"
  | "submitting"
  | "started"
  | "declined"
  | "expired"
  | "refused"
  | "uncertain";

/**
 * Whose key pays: the key the owner saved in the Keychain (`owner`), the
 * studio's demo key (`server`), or nobody, on this machine's ComfyUI
 * (`local`). The same words as the budget's payer (`shared/budget.ts`).
 */
export type ApprovalPayer = "owner" | "server" | "local";

/** What the step will run, as the quote priced it. */
export interface ApprovalPlan {
  /** The registry entry, such as `flux-3-video`, and its menu line. */
  entry: string;
  label: string;
  generator: GenerateInput["generator"];
  model: string;
  /** The agent's prompt for the run, bounded for display. */
  description: string;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  draft?: boolean;
  referenceCount?: number;
  guide?: { label: string; duration: number };
  route: Route;
  /** A workflow entry's run location. */
  location?: DestinationKind;
  workflow?: string;
  /** A GPU-time billed quote has no reliable USD estimate. */
  billing?: string;
  /** The validated endpoint the quoted workflow will reach. */
  deployment?: { url: string; name: string };
  /** An upscale: what it reads and makes, from the server's measured source. */
  upscale?: UpscalePlan;
}

/**
 * An upscale step, built only from what is submitted and from the server's
 * own record of the source (measured when it was stored), never from the
 * agent's or the browser's word.
 */
export interface UpscalePlan {
  sourceId: string;
  sourceLabel: string;
  width: number;
  height: number;
  /** Seconds, as measured. */
  duration: number;
  /** The requested factor, and the size it makes after the pixel cap. */
  factor: number;
  outputWidth: number;
  outputHeight: number;
  creativity: "Precise" | "Creative";
  /** The prompt sent with the run (the effective `upscalePrompt`), or "". */
  prompt: string;
  /** A split upscale: how many parts the one approval confirms. */
  parts?: number;
}

/** A source as the server recorded it: the trusted half of an upscale plan. */
export type MeasuredSource = Pick<
  Source,
  "id" | "label" | "width" | "height" | "duration"
>;

export interface AgentApproval {
  quoteId: string;
  status: ApprovalStatus;
  plan: ApprovalPlan;
  estimateUsd: number;
  expiresAt: string;
  payer: ApprovalPayer;
  /** The run an approval started. */
  jobId?: string;
  /** A split upscale's set, which the approval confirms (no single run). */
  setId?: string;
  /** Why a step was refused or is uncertain, in the studio's words. */
  message?: string;
}

/**
 * What an approved step came to, kept apart from the visible steps so a
 * step dropped from the list still tells recovery where its run is.
 */
export interface ApprovalResult {
  quoteId: string;
  status: "started" | "uncertain";
  jobId?: string;
}
/** Results kept per session, the oldest dropped first past this. */
export const APPROVAL_RESULTS_MAX = 100;

/** Steps kept per session; the oldest closed one goes first past this. */
export const APPROVALS_MAX = 6;
/**
 * Above any prompt a run can send (an image or edit description is up to
 * 12,000 characters, plus camera and Acoustic Space sentences), so the plan
 * always carries the whole prompt the person is approving.
 */
export const APPROVAL_DESCRIPTION_MAX = 20000;

const isImageGenerator = (generator: GenerateInput["generator"]) =>
  generator === "image" || generator === "edit";

const oneLine = (value: string) =>
  Array.from(value, (c) => (c < " " || c === "\x7f" ? " " : c))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
const bounded = (text: string) =>
  text.length > APPROVAL_DESCRIPTION_MAX
    ? `${text.slice(0, APPROVAL_DESCRIPTION_MAX - 1)}…`
    : text;

/**
 * The plan a quote stands for, from its own recipe and the quoted inputs. An
 * upscale needs its source as the server recorded it; without one it has no
 * plan, and the quote is not offered.
 */
export function approvalPlan(
  input: GenerateInput,
  quote: Quote,
  source?: MeasuredSource,
): ApprovalPlan {
  const entry = readyEntry(quote.recipe.id);
  const common = {
    entry: quote.recipe.id,
    label: entry ? entryLabel(entry) : quote.recipe.id,
    generator: input.generator,
    model: input.model ?? "flux-3",
    route: quote.recipe.route,
    ...(input.imageReferences?.length
      ? { referenceCount: input.imageReferences.length }
      : {}),
    ...(input.generator === "video" && source
      ? {
          guide: {
            label: bounded(oneLine(source.label)),
            duration: source.duration,
          },
        }
      : {}),
    ...(quote.recipe.location ? { location: quote.recipe.location } : {}),
    ...(quote.recipe.workflow ? { workflow: quote.recipe.workflow } : {}),
    ...(quote.billing ? { billing: quote.billing } : {}),
    ...(quote.recipe.deployment
      ? { deployment: { ...quote.recipe.deployment } }
      : {}),
  };
  if (input.generator === "upscale") {
    if (!source || source.id !== input.sourceId)
      throw new Error("An upscale plan needs its measured source.");
    // The prompt the run sends: `composePrompt` for an upscale.
    const prompt = bounded(oneLine(composePrompt(input)));
    const output = estimateUpscaleOutput(source, input.upscaleFactor);
    return {
      ...common,
      description: prompt,
      upscale: {
        sourceId: source.id,
        sourceLabel: bounded(oneLine(source.label)),
        width: source.width,
        height: source.height,
        duration: source.duration,
        factor: input.upscaleFactor,
        outputWidth: output.width,
        outputHeight: output.height,
        creativity: input.upscaleCreativity === 0 ? "Precise" : "Creative",
        prompt,
      },
    };
  }
  // The prompt the run sends, camera and Acoustic Space sentences included,
  // so the person approves exactly what reaches the model.
  const text = oneLine(composePrompt(input));
  return {
    ...common,
    description: bounded(text),
    ...(isImageGenerator(input.generator)
      ? {
          // The output shape the image run is sent with.
          ...(input.imageResolution
            ? { resolution: input.imageResolution }
            : {}),
          ...(input.imageAspectRatio
            ? { aspectRatio: input.imageAspectRatio }
            : {}),
        }
      : {
          duration: input.duration,
          resolution: input.resolution,
          aspectRatio: input.aspectRatio,
          draft: input.draft,
        }),
  };
}

/** A step the person can still approve: pending and not past its expiry. */
export const approvable = (approval: AgentApproval, now = Date.now()) =>
  approval.status === "pending" && Date.parse(approval.expiresAt) > now;

export const PAYER_LABEL: Record<ApprovalPayer, string> = {
  owner: "Your saved key",
  server: "The studio's demo key",
  local: "Nobody: this machine's ComfyUI",
};
