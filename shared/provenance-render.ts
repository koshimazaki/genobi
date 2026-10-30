import type { ProvenanceCard, RunsOn } from "./provenance";
import { TIER_LABEL } from "./templates/plan";

/**
 * A provenance card as people read it: Markdown for the docs and a run's
 * write-up, and a small JSON summary for a gallery card. Both read a card
 * that `readProvenance` or `buildProvenance` already checked.
 */
const HARNESS: Record<ProvenanceCard["agent"]["harness"], string> = {
  hermes: "Hermes",
  "claude-code": "Claude Code",
  codex: "Codex",
  person: "A person",
};
const RUNS_ON: Record<RunsOn, string> = {
  "comfy-router": "Comfy Router",
  "comfy-cloud": "Comfy Cloud",
  "local-comfyui": "local ComfyUI",
  "bfl-api": "BFL API",
};
const WHERE = { local: "Local", cloud: "Cloud", mixed: "Local and cloud" };
const PROVIDER: Record<ProvenanceCard["agent"]["provider"], string> = {
  local: "this machine",
  nous: "Nous inference API",
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  other: "a hosted API",
};

/** "Hermes on deepseek/deepseek-v4.1-flash", or "A person". */
export function agentLine(card: ProvenanceCard) {
  const { harness, model } = card.agent;
  return model ? `${HARNESS[harness]} on ${model}` : HARNESS[harness];
}

/**
 * The one line a gallery shows, ledger 374's "made with Hermes, only open
 * models", worded from the tier and the agent rather than written by hand.
 */
export function madeWith(card: ProvenanceCard) {
  const who =
    card.agent.harness === "person"
      ? "Made by hand"
      : `Made with ${HARNESS[card.agent.harness]}`;
  if (card.tier === "open") return `${who}, only open models`;
  if (card.tier === "premium") return `${who}, with premium models`;
  const closed = card.generations.find((g) => !g.open);
  return closed
    ? `${who}, open models and one premium step (${closed.label})`
    : `${who} on a premium agent model, open generation models`;
}

export const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

export function duration(seconds: number) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = s % 60;
  return [h && `${h} h`, (h || m) && `${m} min`, `${r} s`]
    .filter(Boolean)
    .join(" ");
}

/** Table cells: pipes escaped; the card's text has no line breaks. */
const cell = (text: string) => text.replace(/\|/g, "\\|");

export function provenanceMarkdown(card: ProvenanceCard) {
  const { agent, run, time, cost } = card;
  const openness = agent.model
    ? `${agent.open ? "open weights" : "closed"}${agent.openness === "declared" ? ", as declared by the runner" : ""}`
    : "";
  const ranOn = [...new Set(card.generations.map((g) => RUNS_ON[g.runsOn]))];
  const rows: [string, string][] = [
    [
      "Agent",
      `${agentLine(card)}${agent.model ? ` (${PROVIDER[agent.provider]}, ${openness})` : ""}`,
    ],
    ["Template", card.template ?? "none"],
    ["Skill", card.skill ? `\`${card.skill}\`` : "none"],
    [
      "Generations ran on",
      `${ranOn.join(", ")} (${WHERE[run.generations].toLowerCase()})`,
    ],
    ["Agent ran", WHERE[run.agent]],
    ["Hardware", run.hardware],
    [
      "Time taken",
      time
        ? `${duration(time.seconds)} (${time.startedAt} to ${time.finishedAt})`
        : "unavailable: a take's finish time could not be read",
    ],
    [
      "Cost",
      [
        `estimate ${usd(cost.estimateUsd)}`,
        cost.actualUsd === null
          ? "confirmed cost not reported for every take"
          : `confirmed ${usd(cost.actualUsd)}`,
        ...(cost.credits === null ? [] : [`${cost.credits} Comfy credits`]),
      ].join("; "),
    ],
    [
      "Workflow files",
      card.workflowFiles.map((f) => `\`${f}\``).join(", ") ||
        "none (hosted models only)",
    ],
  ];
  return [
    `## ${cell(card.title)}`,
    "",
    `**${madeWith(card)}.** Tier: ${TIER_LABEL[card.tier]}.`,
    "",
    "|     |     |",
    "| --- | --- |",
    ...rows.map(([k, v]) => `| ${k} | ${cell(v)} |`),
    "",
    "### Generations",
    "",
    "| Take | Model | Weights | Role | Ran on | Recipe | Estimate | Confirmed |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...card.generations
      .map((g) =>
        [
          g.operationId,
          `${g.label} (\`${g.entry}\`)`,
          g.open ? "open" : "closed",
          g.role,
          RUNS_ON[g.runsOn],
          `v${g.recipeVersion}`,
          usd(g.estimateUsd),
          g.actualUsd === null ? "not reported" : usd(g.actualUsd),
        ]
          .map(cell)
          .join(" | "),
      )
      .map((row) => `| ${row} |`),
    "",
    "### Outputs",
    "",
    "| Output | From take | Type | SHA-256 |",
    "| --- | --- | --- | --- |",
    ...card.outputs.map(
      (o) =>
        `| ${o.assetId} | ${o.operationId} | ${o.contentType} | ${o.sha256 ? `\`${o.sha256}\`` : "not read"} |`,
    ),
    "",
  ].join("\n");
}

/** What a gallery card shows: small, flat and free of hashes and ids. */
export interface ProvenanceBadge {
  version: 1;
  title: string;
  template: string | null;
  tier: ProvenanceCard["tier"];
  tierLabel: string;
  madeWith: string;
  agent: string;
  models: string[];
  where: string;
  hardware: string;
  /** Null when the card's timing is unavailable. */
  seconds: number | null;
  costUsd: number;
  outputs: number;
}

export function provenanceBadge(card: ProvenanceCard): ProvenanceBadge {
  return {
    version: 1,
    title: card.title,
    template: card.template,
    tier: card.tier,
    tierLabel: TIER_LABEL[card.tier],
    madeWith: madeWith(card),
    agent: agentLine(card),
    models: [...new Set(card.generations.map((g) => g.label))],
    where: WHERE[card.run.generations],
    hardware: card.run.hardware,
    seconds: card.time?.seconds ?? null,
    costUsd: card.cost.actualUsd ?? card.cost.estimateUsd,
    outputs: card.outputs.length,
  };
}
