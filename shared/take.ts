import { canonicalInput } from "./idempotency";
import { currentRoute } from "./legacy-route";
import { entryFor, type Route } from "./registry";
import type { GenerateInput, Job } from "./types";
import type { DestinationKind } from "./comfy/destination";

/**
 * One generation, by a person or an agent, is one take: validate → reserve →
 * submit once → poll → copy the output into storage we own → Ready. The take
 * is that job read as a record of what made it, so both adapters store one
 * row and nothing twice.
 *
 * What only the reservation knows — the recipe that ran and the hashes of what
 * went in — is recorded then, as a `TakeStart`, beside the job and never in its
 * public data: public jobs carry a reference count, not fingerprints. Outputs
 * and the receipt are read from the job as it finishes, so eviction and late
 * cost reports cannot leave a stale copy behind.
 */
export const TAKE_VERSION = 1;

export interface TakeRecipe {
  /** The registry entry that ran, such as `ltx-2-5-fast`. */
  id: string;
  /** The entry's `recipeVersion` when the run was reserved. */
  version: number;
  /** Where it ran: a Router entry runs on BFL direct when the key is BFL's. */
  route: Route;
  /** A `workflow` entry's template, when the session swapped or chose one. */
  workflow?: string;
  /** A `workflow` entry's run location on the local server. */
  location?: DestinationKind;
}
/** What the local server adds to a `workflow` entry's recipe. */
export type WorkflowPlan = Pick<TakeRecipe, "workflow" | "location">;

export type TakeInput =
  /** SHA-256 of the canonical settings, the same string replay compares. */
  | { role: "settings"; sha256: string }
  /** SHA-256 of an image reference as it was sent, in request order. */
  | { role: "reference"; sha256: string }
  /**
   * The clip an upscale read: a session asset or a library clip id, with the
   * SHA-256 of its bytes when it was an upload (generated clips carry none).
   */
  | { role: "source"; assetId: string; sha256?: string };

/** Recorded with the reservation, before anything is sent. */
export interface TakeStart {
  recipe: TakeRecipe;
  inputs: TakeInput[];
}

export interface TakeOutput {
  assetId: string;
  mediaType: "video" | "image" | "audio";
  contentType: string;
  /** False once retention or quota removed the media; the take still stands. */
  available: boolean;
}

export interface TakeReceipt {
  estimateUsd: number;
  /** Provider-confirmed charge; absent until the provider reports one. */
  actualUsd?: number;
  /** Comfy credits, when Router or Cloud reported them. */
  credits?: number;
}

export interface Take {
  version: typeof TAKE_VERSION;
  /** Stable across replays: the reserved job's id. */
  operationId: string;
  recipe: TakeRecipe;
  inputs: TakeInput[];
  outputs: TakeOutput[];
  receipt: TakeReceipt;
  /** The Director project revision the request named, if it named one. */
  projectRevision?: number;
  createdAt: string;
}

export const toHex = (digest: ArrayBuffer) =>
  [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");

export async function sha256Hex(text: string) {
  return toHex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
}

/**
 * The reservation half of a take. `input` is the stored request, with image
 * references already reduced to their hashes; `comfyKey` says which provider a
 * Router entry will reach.
 */
export async function startTake(
  input: GenerateInput,
  comfyKey: boolean,
  sourceSha256?: string,
  plan: WorkflowPlan = {},
): Promise<TakeStart> {
  const entry = entryFor(input.generator, input.model);
  return {
    recipe: {
      id: entry.id,
      version: entry.recipeVersion,
      // A Router entry runs on BFL direct with a BFL key; the others say where.
      route: entry.route === "router" && !comfyKey ? "bfl" : entry.route,
      ...(entry.route === "workflow" && plan.workflow
        ? { workflow: plan.workflow }
        : {}),
      ...(entry.route === "workflow" && plan.location
        ? { location: plan.location }
        : {}),
    },
    inputs: [
      { role: "settings", sha256: await sha256Hex(canonicalInput(input)) },
      ...(input.imageReferences ?? []).map((sha256) => ({
        role: "reference" as const,
        sha256,
      })),
      ...(input.sourceId
        ? [
            {
              role: "source" as const,
              assetId: input.sourceId,
              ...(sourceSha256 ? { sha256: sourceSha256 } : {}),
            },
          ]
        : []),
    ],
  };
}

/** The finished take, or null while the job has no owned output yet. */
export function takeOf(job: Job, start: TakeStart): Take | null {
  if (job.status !== "Ready") return null;
  return {
    version: TAKE_VERSION,
    operationId: job.id,
    // A take recorded as `cloud` reads as the route it ran on now.
    recipe: { ...start.recipe, route: currentRoute(start.recipe.route) },
    inputs: start.inputs,
    outputs: [
      {
        assetId: job.id,
        mediaType: job.mediaType ?? "video",
        contentType: job.resultContentType ?? "video/mp4",
        available: job.mediaAvailable !== false,
      },
    ],
    receipt: {
      estimateUsd: job.costEstimateUsd,
      ...(job.costActualUsd === undefined
        ? {}
        : { actualUsd: job.costActualUsd }),
      ...(job.costCredits === undefined ? {} : { credits: job.costCredits }),
    },
    ...(job.projectRevision === undefined
      ? {}
      : { projectRevision: job.projectRevision }),
    createdAt: job.createdAt,
  };
}
