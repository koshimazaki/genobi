import {
  BOX_IDLE_REMINDER,
  uptime,
  type BoxStatus,
} from "../shared/comfy/gpu-box";
import type { LocalCheck } from "./run-mode";

/**
 * What the GPU box panel says, from the box's status and the free
 * `/object_info` check: ready, missing nodes, missing models, or not
 * answering; the GPU and its memory where ComfyUI reports them; how long it
 * has answered; and, once no job came for a while, a reminder to stop it.
 */
export interface BoxReadiness {
  state:
    "unreachable" | "checking" | "ready" | "missing-models" | "missing-nodes";
  headline: string;
  /** Templates with what each lacks, at most a few, for the detail line. */
  gaps: string[];
  device: string;
  uptime: string;
  idle: string;
}

const gib = (bytes: number) =>
  `${Math.round((bytes / 1024 ** 3) * 10) / 10} GB VRAM`;

const list = (names: string[]) =>
  names.length > 3
    ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
    : names.join(", ");

export function boxReadiness(
  status: BoxStatus | null,
  check: LocalCheck | null,
  url: string,
  now = Date.now(),
): BoxReadiness {
  const device = status
    ? [status.gpu, status.vramBytes ? gib(status.vramBytes) : null]
        .filter(Boolean)
        .join(" · ")
    : "";
  const base = {
    gaps: [],
    device,
    uptime: status?.upSince ? `Up ${uptime(status.upSince, now)}` : "",
    idle: status?.idle
      ? `No job for ${status.idleMinutes} min. ${BOX_IDLE_REMINDER}`
      : "",
  };
  if (!status?.reachable || check?.reachable === false)
    return {
      ...base,
      state: "unreachable",
      headline: `No ComfyUI answers at ${url}. Start the SSH tunnel and the box's ComfyUI.`,
      uptime: "",
      idle: "",
    };
  if (!check)
    return {
      ...base,
      state: "checking",
      headline: "Box answers. Checking its nodes and models…",
    };
  const entries = Object.entries(check.templates);
  const nodes = entries.filter(([, found]) => found.missingNodes.length);
  const models = entries.filter(
    ([, found]) => !found.missingNodes.length && found.missingModels.length,
  );
  const gaps = [
    ...nodes.map(
      ([id, found]) => `${id}: lacks nodes ${list(found.missingNodes)}`,
    ),
    ...models.map(([id, found]) => `${id}: lacks ${list(found.missingModels)}`),
  ];
  const ready = entries.length - nodes.length - models.length;
  if (!nodes.length && !models.length)
    return {
      ...base,
      state: "ready",
      headline: "Box ready: every workflow's nodes and models are there.",
    };
  return {
    ...base,
    gaps: gaps.slice(0, 6),
    state: nodes.length ? "missing-nodes" : "missing-models",
    headline: `${ready} of ${entries.length} workflows ready. ${
      nodes.length
        ? `${nodes.length} ${nodes.length === 1 ? "lacks" : "lack"} nodes`
        : ""
    }${nodes.length && models.length ? ", " : ""}${
      models.length
        ? `${models.length} ${models.length === 1 ? "lacks" : "lack"} models`
        : ""
    }. Runs that need them are refused before anything is sent.`,
  };
}
