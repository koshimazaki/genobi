import type { Route } from "./registry";
import { tierFrom } from "./templates/plan";
import type { Tier } from "./templates/types";

/**
 * A provenance card says how one example was made (issue #15, ledger 373–375):
 * the agent and its model, every generation model and the take it made, the
 * workflow files, where it ran and on what, how long it took, what it cost and
 * the outputs with their hashes. The tier is derived from the models by the
 * rule the templates use (`tierFrom`), so "made with Hermes, only open
 * models" is checked, not claimed. `provenance-card.ts` builds a card from takes
 * and validates one from untrusted data; `provenance-render.ts` renders it.
 */
export const PROVENANCE_VERSION = 1;
export const MAX_GENERATIONS = 24;

export const HARNESSES = ["hermes", "claude-code", "codex", "person"] as const;
export type Harness = (typeof HARNESSES)[number];
/** Where the agent's model answered from: this machine or a hosted API. */
export const AGENT_PROVIDERS = [
  "local",
  "nous",
  "anthropic",
  "openai",
  "openrouter",
  "other",
] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export const RUNS_ON = [
  "comfy-router",
  "comfy-cloud",
  "local-comfyui",
  "bfl-api",
] as const;
export type RunsOn = (typeof RUNS_ON)[number];
export type Where = "local" | "cloud" | "mixed";

export interface ProvenanceAgent {
  harness: Harness;
  /** The model id as the provider names it; null for a person. */
  model: string | null;
  provider: AgentProvider;
  open: boolean;
  /** `licences`: the openness comes from LICENCES.md; `declared`: from the runner. */
  openness: "licences" | "declared";
}

export interface ProvenanceGeneration {
  /** The take's operation id (the job id). */
  operationId: string;
  /** The registry entry that ran, with its label, model and open flag. */
  entry: string;
  label: string;
  model: string;
  open: boolean;
  /** A video shot, or a step around it (still, edit, upscale). */
  role: "shot" | "step";
  route: Route;
  runsOn: RunsOn;
  /**
   * The workflow template a `workflow` take ran, as its take recorded it (the
   * entry's default for a take recorded before templates could be swapped);
   * null on any other route.
   */
  workflow: string | null;
  recipeVersion: number;
  /** SHA-256 of the canonical settings, from the take. */
  settingsSha256: string;
  estimateUsd: number;
  actualUsd: number | null;
  credits: number | null;
  outputs: string[];
}

export interface ProvenanceOutput {
  assetId: string;
  operationId: string;
  mediaType: "video" | "image";
  contentType: string;
  /** SHA-256 of the bytes; null when the media was not read. */
  sha256: string | null;
}

export interface ProvenanceCard {
  version: typeof PROVENANCE_VERSION;
  title: string;
  /** The house template it follows, or null. */
  template: string | null;
  /** The skill the agent followed, relative to the repository. */
  skill: string | null;
  agent: ProvenanceAgent;
  generations: ProvenanceGeneration[];
  /** The Comfy graphs the generations ran, derived from their entries. */
  workflowFiles: string[];
  run: { generations: Where; agent: "local" | "cloud"; hardware: string };
  /**
   * Null when a take's finish time could not be read: a card never guesses a
   * duration from creation times.
   */
  time: { startedAt: string; finishedAt: string; seconds: number } | null;
  cost: {
    estimateUsd: number;
    actualUsd: number | null;
    credits: number | null;
  };
  outputs: ProvenanceOutput[];
  tier: Tier;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Agent models whose openness LICENCES.md records. Anything else is declared
 * by whoever ran it, and the card says so.
 */
const OPEN_AGENTS = [/deepseek-v4\.1-flash/i, /qwen3-(vl|omni)/i, /hermes-4/i];
const CLOSED_AGENTS = [
  /claude|opus|sonnet|haiku|fable/i,
  /(^|\/)gpt-/i,
  /gemini/i,
];
export function knownAgentOpenness(model: string): boolean | undefined {
  if (OPEN_AGENTS.some((re) => re.test(model))) return true;
  if (CLOSED_AGENTS.some((re) => re.test(model))) return false;
  return undefined;
}

/** A workflow entry's graph file, as `workflows/` holds it. */
const LOCAL: readonly RunsOn[] = ["local-comfyui"];
export function runsOnFor(route: Route, workflows: "cloud" | "local"): RunsOn {
  if (route === "router") return "comfy-router";
  if (route === "bfl") return "bfl-api";
  return workflows === "local" ? "local-comfyui" : "comfy-cloud";
}
export const whereOf = (runs: RunsOn[]): Where =>
  runs.every((r) => LOCAL.includes(r))
    ? "local"
    : runs.some((r) => LOCAL.includes(r))
      ? "mixed"
      : "cloud";

/** Open, Semi-open or Premium, from the generations and the agent. */
export function provenanceTier(
  card: Pick<ProvenanceCard, "agent" | "generations">,
): Tier {
  const closedSteps = new Set(
    card.generations
      .filter((g) => g.role === "step" && !g.open)
      .map((g) => g.entry),
  );
  const closedAgent = card.agent.harness !== "person" && !card.agent.open;
  return tierFrom(
    card.generations.some((g) => g.role === "shot" && !g.open),
    closedSteps.size + (closedAgent ? 1 : 0),
  );
}

/** Sums; the confirmed cost and credits only when every take reported one. */
export function totals(
  generations: ProvenanceGeneration[],
): ProvenanceCard["cost"] {
  const sum = (values: (number | null)[]) =>
    values.every((n) => n !== null)
      ? round(values.reduce<number>((a, n) => a + (n ?? 0), 0))
      : null;
  return {
    estimateUsd: round(generations.reduce((a, g) => a + g.estimateUsd, 0)),
    actualUsd: sum(generations.map((g) => g.actualUsd)),
    credits: sum(generations.map((g) => g.credits)),
  };
}
