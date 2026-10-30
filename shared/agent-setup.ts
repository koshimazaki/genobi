/**
 * Setup ends by starting one agent session (the setup design, Box
 * 1.4). The page asks for it with `setup: true`; the server then adds this
 * block to the agent's brief from its own state: the harness it runs, the key
 * slots it holds (names only) and the voice model folder it is configured
 * with. The page never sends a path or a key for it. The run location and the
 * licence stance are the person's validated choices from the studio context.
 * Portable: no Node or DOM APIs.
 */
import type { AgentContext } from "./agent-context";
import type { UsagePreference } from "./licensing/types";
import type { KeyKind } from "./provider";

/** Setup's usage question: commercial use, or research only. */
export type LicenceStance = "commercial" | "research";

/** `demo` (personal, research and studies) is research; any other purpose needs commercial rights. */
export function licenceStance(usage?: UsagePreference) {
  if (!usage) return undefined;
  return (
    usage.purpose === "demo" ? "research" : "commercial"
  ) as LicenceStance;
}

/**
 * The usage preference a stance saves. Picking the stance already held keeps
 * the exact purpose and policy (a resale purpose set in Taste stays resale).
 */
export function stanceUsage(
  stance: LicenceStance,
  current?: UsagePreference,
): UsagePreference {
  if (current && licenceStance(current) === stance) return current;
  return {
    purpose: stance === "research" ? "demo" : "commercial-video",
    policy: current?.policy ?? "any-licensed",
  };
}

export const LICENCE_STANCE_TEXT: Record<LicenceStance, string> = {
  commercial:
    "commercial use: choose only models whose licences allow commercial work",
  research:
    "research only: research and personal licences fit; say when a result could not be used commercially",
};

export const KEY_SLOT_NAMES: Record<KeyKind, string> = {
  comfy: "Comfy",
  bfl: "BFL",
};

/** Where generation runs, from setup's run-location choice. */
export function runLocationText(execution?: string) {
  return execution === "local"
    ? "locally, on this machine's ComfyUI"
    : execution === "cloud"
      ? "on the web: Comfy Cloud and provider APIs"
      : "wherever fits the task, local or web";
}

/** What only the local server knows when the session starts. */
export interface SetupFacts {
  /** Key slots that hold a key, by kind. Never a key. */
  keys: KeyKind[];
  /** The voice model folder the server is configured with and found on disk. */
  voiceModel?: string;
}

/** The brief's setup block; `harness` is the runner the server is starting. */
export function setupBlock(input: {
  harness: string;
  facts: SetupFacts;
  context?: AgentContext;
}) {
  const { harness, facts, context } = input;
  const stance = licenceStance(context?.usage);
  const keys = facts.keys.map((kind) => KEY_SLOT_NAMES[kind]).join(", ");
  return [
    "## Setup just finished",
    "",
    "The person finished Genobi's setup and its last step started you. The studio's server states:",
    "",
    `- Harness: ${harness}, this session.`,
    `- Keys connected: ${keys || "none"}. You never see or need a key.`,
    facts.voiceModel
      ? `- Voice: installed. The local speech model's folder is ${JSON.stringify(facts.voiceModel)}; the studio's mic uses it, and you do not need to move or change it.`
      : "- Voice: not installed on this server.",
    "",
    "From the person's setup choices:",
    "",
    `- Generation runs ${runLocationText(context?.selection?.execution)}.`,
    stance
      ? `- Licence stance: ${LICENCE_STANCE_TEXT[stance]}. Load genobi-licensing and pick models whose licences fit it.`
      : "- Licence stance: not chosen. Ask before picking a model whose licence limits use.",
    "",
    "Check the studio is ready for these choices (`genobi_status`, `genobi_models` with status ready), then say what the person can make first. Do not install software, download models, change keys or quote paid steps they did not ask for. Never substitute a cloud route for a local-only choice.",
  ].join("\n");
}
