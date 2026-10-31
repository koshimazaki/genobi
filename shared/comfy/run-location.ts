import { AppError } from "../../server/errors";
import { HOSTED_DEPLOY_INPUT_BYTES } from "./deploy-file";
import type { DestinationKind } from "./destination";

/**
 * The run location: one setting every `workflow` entry follows, Local (a
 * ComfyUI on this machine), Cloud (Comfy Cloud), or Both (local workflows
 * alongside cloud API models). The local server reads its
 * default from `GENOBI_WORKFLOW_DESTINATION` and keeps a per-session choice
 * the studio and agents share; the hosted Worker offers Comfy Cloud and registered deployments.
 */
export const RUN_LOCATIONS = ["local", "cloud", "both", "deployment"] as const;
export type RunLocation = (typeof RUN_LOCATIONS)[number];

export const LOCATION_LABEL: Record<DestinationKind, string> = {
  local: "Local ComfyUI",
  cloud: "Comfy Cloud",
  deployment: "Comfy API deployment",
};

export function parseRunLocation(value: unknown): RunLocation {
  if (
    value === "local" ||
    value === "cloud" ||
    value === "both" ||
    value === "deployment"
  )
    return value;
  throw new AppError(
    400,
    "The run location must be local, cloud, both or deployment.",
    "invalid_run_location",
  );
}

/** What a detection read of the local ComfyUI found. No paths, no argv. */
export interface LocalComfyStatus {
  reachable: boolean;
  /** ComfyUI's own version string, when it answered with a plain one. */
  version: string | null;
}

/**
 * The settings revision every settings answer carries (`GET` and write, run
 * location and workflows, on both adapters). The local server bumps one
 * counter on every accepted settings write and answers with the counter as it
 * handled the request, so answers order by when the server handled them, not
 * by when they arrived; the studio applies only an answer newer than the last
 * it applied. It lives in memory and starts each process above the last one's
 * (`firstSettingsRevision`). The hosted Worker increments a per-session D1 revision.
 */
export const firstSettingsRevision = (now = Date.now()) => now * 1000;
export const HOSTED_SETTINGS_REVISION = 0;

/** The answer to `GET /api/settings/run-location` on both adapters. */
export interface RunLocationState {
  /** The settings revision this answer reflects. */
  revision: number;
  location: DestinationKind;
  /** Configuration choice; Both resolves workflows to Local, APIs stay cloud. */
  mode?: RunLocation | "deployment";
  label: string;
  /** Where the location came from: this session's choice or the server's default. */
  source: "session" | "server";
  /** True where this adapter cannot change settings. */
  fixed: boolean;
  choices: RunLocation[];
  /** The local ComfyUI, where the adapter has one to ask. */
  local: LocalComfyStatus | null;
  deployment?: { url: string; name: string };
  /** Maximum bytes per staged deployment input, enforced by this adapter. */
  deploymentInputBytes?: number;
  note: string;
}

/** Prefer the mixed local/API mode, but never invent an unsupported choice. */
export function localRunChoice(
  state: Pick<RunLocationState, "choices" | "fixed">,
) {
  if (state.fixed) return undefined;
  return state.choices.includes("both")
    ? "both"
    : state.choices.includes("local")
      ? "local"
      : undefined;
}

export const HOSTED_RUN_LOCATION: RunLocationState = {
  revision: HOSTED_SETTINGS_REVISION,
  location: "cloud",
  label: LOCATION_LABEL.cloud,
  source: "server",
  fixed: true,
  choices: ["cloud"],
  local: null,
  deploymentInputBytes: HOSTED_DEPLOY_INPUT_BYTES,
  note: "The hosted studio runs every workflow on Comfy Cloud. Run the studio on your own machine to use a local ComfyUI. Register a Comfy deployment endpoint in Settings to use its workflows.",
};
