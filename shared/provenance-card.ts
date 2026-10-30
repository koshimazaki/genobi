import { entryLabel, registry, type ReadyEntry } from "./registry";
import type { Take } from "./take";
import { findHouseTemplate } from "./templates/catalogue";
import { requireTemplateFor, templateById } from "./comfy/workflows";
import {
  AGENT_PROVIDERS,
  HARNESSES,
  MAX_GENERATIONS,
  PROVENANCE_VERSION,
  RUNS_ON,
  knownAgentOpenness,
  provenanceTier,
  runsOnFor,
  totals,
  whereOf,
  type AgentProvider,
  type Harness,
  type ProvenanceAgent,
  type ProvenanceCard,
  type ProvenanceGeneration,
  type ProvenanceOutput,
} from "./provenance";

/**
 * Reading and building provenance cards (`shared/provenance.ts`). Everything a
 * card says that can be derived is derived again and must agree, so a card
 * cannot call itself open when its models are not.
 */
export class ProvenanceError extends Error {}
const fail = (message: string): never => {
  throw new ProvenanceError(message);
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const PATH = /^[A-Za-z0-9_][A-Za-z0-9._/-]{0,199}$/;
const CONTENT_TYPE = /^(video|image)\/[a-z0-9.+-]{1,40}$/;

/** Control characters become spaces, as every sanitiser here does. */
const clean = (text: string) =>
  text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function text(value: unknown, what: string, limit: number) {
  const cleaned = typeof value === "string" ? clean(value) : "";
  if (!cleaned || cleaned.length > limit)
    fail(`${what} must be 1 to ${limit} characters`);
  return cleaned;
}
const pick = <T extends string>(
  value: unknown,
  list: readonly T[],
  what: string,
) =>
  list.includes(value as T)
    ? (value as T)
    : fail(`${what} must be one of ${list.join(", ")}`);
function match(value: unknown, pattern: RegExp, what: string) {
  if (typeof value !== "string" || !pattern.test(value))
    fail(`${what} is malformed`);
  return value as string;
}
function money(value: unknown, what: string) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10_000
  )
    fail(`${what} must be a number of dollars`);
  return value as number;
}
function time(value: unknown, what: string) {
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) fail(`${what} must be an ISO time`);
  return new Date(ms).toISOString();
}
const record = (value: unknown, what: string) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(`${what} must be an object`);
const list = (value: unknown, what: string, max: number) =>
  Array.isArray(value) && value.length <= max
    ? (value as unknown[])
    : fail(`${what} must be a list of at most ${max}`);

export function readAgent(value: unknown): ProvenanceAgent {
  const v = record(value, "agent");
  const harness = pick(v.harness, HARNESSES, "agent.harness");
  const provider = pick(
    v.provider ?? (harness === "person" ? "local" : undefined),
    AGENT_PROVIDERS,
    "agent.provider",
  );
  if (harness === "person") {
    if (v.model != null) fail("A person's card names no agent model");
    return {
      harness,
      model: null,
      provider: "local",
      open: true,
      openness: "licences",
    };
  }
  const model = match(v.model, MODEL_ID, "agent.model");
  const known = knownAgentOpenness(model);
  if (known !== undefined && v.open !== undefined && v.open !== known)
    fail(`LICENCES.md records ${model} as ${known ? "open" : "closed"}`);
  if (known === undefined && typeof v.open !== "boolean")
    fail(`Say whether ${model} has open weights (agent.open)`);
  return {
    harness,
    model,
    provider,
    open: known ?? (v.open as boolean),
    openness: known === undefined ? "declared" : "licences",
  };
}

const readyEntryOf = (id: string) => {
  const entry = registry.find((e) => e.id === id);
  return entry?.status === "ready"
    ? entry
    : fail(`Unknown registry entry ${id}`);
};
const roleOf = (entry: ReadyEntry) =>
  entry.generator === "video" ? "shot" : "step";
/**
 * The template a workflow take ran: the one its take recorded, or the entry's
 * default for an older take. It must serve the entry's capability.
 */
function templateOf(entry: ReadyEntry, value: unknown, at: string) {
  const id =
    value == null
      ? requireTemplateFor(entry.id).choice.id
      : match(value, /^[a-z0-9][a-z0-9-]{0,63}$/, `${at}.workflow`);
  try {
    return requireTemplateFor(entry.id, id).choice.id;
  } catch {
    return fail(`${at}: ${id} cannot run behind ${entry.id}`);
  }
}
/** The graph files the generations ran, from each one's own template. */
const workflowFiles = (generations: ProvenanceGeneration[]) => [
  ...new Set(
    generations.flatMap((g) =>
      g.workflow ? [templateById(g.workflow)!.template.file] : [],
    ),
  ),
];
function readGeneration(value: unknown, at: string): ProvenanceGeneration {
  const v = record(value, at);
  const entry = readyEntryOf(
    match(v.entry, /^[a-z0-9-]{1,64}$/, `${at}.entry`),
  );
  const route = pick(
    v.route,
    ["router", "workflow", "bfl"] as const,
    `${at}.route`,
  );
  // A take runs on its entry's route, with one exception the studio makes:
  // a BFL model on Router (FLUX 3, FLUX Video Upscale) runs on BFL direct
  // when the key is BFL's (`startTake`). LTX on Router refuses a BFL key, so
  // it has none.
  if (
    route !== entry.route &&
    !(
      entry.route === "router" &&
      route === "bfl" &&
      entry.model.startsWith("bfl/")
    )
  )
    fail(`${at}: ${entry.id} runs on ${entry.route}, not ${route}`);
  const runsOn = pick(v.runsOn, RUNS_ON, `${at}.runsOn`);
  if (
    runsOn !== runsOnFor(route, runsOn === "local-comfyui" ? "local" : "cloud")
  )
    fail(`${at} ran on ${route}, not ${runsOn}`);
  const optional = (key: string) =>
    v[key] == null ? null : money(v[key], `${at}.${key}`);
  const generation: ProvenanceGeneration = {
    operationId: match(v.operationId, ID, `${at}.operationId`),
    entry: entry.id,
    label: entryLabel(entry),
    model: entry.model,
    open: entry.open,
    role: roleOf(entry),
    route,
    runsOn,
    workflow:
      route === "workflow"
        ? templateOf(entry, v.workflow, at)
        : v.workflow == null
          ? null
          : fail(`${at}.workflow names a template, but ${route} runs none`),
    recipeVersion:
      typeof v.recipeVersion === "number" &&
      Number.isInteger(v.recipeVersion) &&
      v.recipeVersion > 0
        ? v.recipeVersion
        : fail(`${at}.recipeVersion is malformed`),
    settingsSha256: match(v.settingsSha256, SHA256, `${at}.settingsSha256`),
    estimateUsd: money(v.estimateUsd, `${at}.estimateUsd`),
    actualUsd: optional("actualUsd"),
    credits: v.credits == null ? null : money(v.credits, `${at}.credits`),
    outputs: list(v.outputs, `${at}.outputs`, 8).map((o, i) =>
      match(o, ID, `${at}.outputs[${i}]`),
    ),
  };
  for (const key of ["label", "model", "open", "role"] as const)
    if (v[key] !== undefined && v[key] !== generation[key])
      fail(`${at}.${key} disagrees with the registry entry ${entry.id}`);
  return generation;
}

function readOutput(value: unknown, at: string): ProvenanceOutput {
  const v = record(value, at);
  return {
    assetId: match(v.assetId, ID, `${at}.assetId`),
    operationId: match(v.operationId, ID, `${at}.operationId`),
    mediaType: pick(
      v.mediaType,
      ["video", "image"] as const,
      `${at}.mediaType`,
    ),
    contentType: match(v.contentType, CONTENT_TYPE, `${at}.contentType`),
    sha256: v.sha256 == null ? null : match(v.sha256, SHA256, `${at}.sha256`),
  };
}

function readTime(value: unknown): NonNullable<ProvenanceCard["time"]> {
  const t = record(value, "time");
  const startedAt = time(t.startedAt, "time.startedAt");
  const finishedAt = time(t.finishedAt, "time.finishedAt");
  const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
  if (seconds < 0) fail("time.finishedAt is before time.startedAt");
  if (t.seconds !== seconds) fail(`time.seconds must be ${seconds}`);
  return { startedAt, finishedAt, seconds };
}

/**
 * A card from untrusted data. Types, lengths and formats are checked; the
 * generations' labels, open flags and roles, the workflow files, the totals,
 * the duration and the tier are recomputed and must agree with what it says.
 */
export function readProvenance(value: unknown): ProvenanceCard {
  const v = record(value, "card");
  if (v.version !== PROVENANCE_VERSION)
    fail(`Card version must be ${PROVENANCE_VERSION}`);
  const template =
    v.template == null
      ? null
      : match(v.template, /^[a-z][a-z0-9-]{0,63}$/, "template");
  if (template && !findHouseTemplate(template))
    fail(`Unknown template ${template}`);
  const skill = v.skill == null ? null : match(v.skill, PATH, "skill");
  if (skill?.split("/").includes(".."))
    fail("skill must be a path inside the repository");
  const agent = readAgent(v.agent);
  const raw = list(v.generations, "generations", MAX_GENERATIONS);
  if (!raw.length) fail("A card needs at least one generation");
  const generations = raw.map((g, i) => readGeneration(g, `generations[${i}]`));
  if (
    new Set(generations.map((g) => g.operationId)).size !== generations.length
  )
    fail("A take appears twice");
  const outputs = list(v.outputs, "outputs", MAX_GENERATIONS * 8).map((o, i) =>
    readOutput(o, `outputs[${i}]`),
  );
  const owner = new Map(
    generations.flatMap((g) => g.outputs.map((id) => [id, g.operationId])),
  );
  if (
    outputs.length !== owner.size ||
    new Set(outputs.map((o) => o.assetId)).size !== outputs.length ||
    outputs.some((o) => owner.get(o.assetId) !== o.operationId)
  )
    fail("outputs must list each generation's outputs once, under its take");
  const run = record(v.run, "run");
  const where = whereOf(generations.map((g) => g.runsOn));
  if (run.generations !== where)
    fail(`The generations ran ${where}, not ${String(run.generations)}`);
  const agentWhere = agent.provider === "local" ? "local" : "cloud";
  if (run.agent !== agentWhere)
    fail(`The agent ran ${agentWhere}, not ${String(run.agent)}`);
  const timing = v.time === null ? null : readTime(v.time);
  const card: ProvenanceCard = {
    version: PROVENANCE_VERSION,
    title: text(v.title, "title", 80),
    template,
    skill,
    agent,
    generations,
    workflowFiles: workflowFiles(generations),
    run: {
      generations: where,
      agent: agentWhere,
      hardware: text(run.hardware, "run.hardware", 120),
    },
    time: timing,
    cost: totals(generations),
    outputs,
    tier: provenanceTier({ agent, generations }),
  };
  if (JSON.stringify(v.workflowFiles) !== JSON.stringify(card.workflowFiles))
    fail(`workflowFiles must be ${JSON.stringify(card.workflowFiles)}`);
  const cost = record(v.cost, "cost");
  for (const key of ["estimateUsd", "actualUsd", "credits"] as const)
    if (cost[key] !== card.cost[key])
      fail(`cost.${key} must be ${card.cost[key]}`);
  if (v.tier !== card.tier)
    fail(`The models make this ${card.tier}, not ${String(v.tier)}`);
  return card;
}

export interface ProvenanceInput {
  title: string;
  template?: string | null;
  skill?: string | null;
  agent: {
    harness: Harness;
    model?: string | null;
    provider?: AgentProvider;
    open?: boolean;
  };
  /**
   * Where a workflow take ran when its take does not record it (a take from
   * before the run location existed). Each take's own `recipe.location` wins.
   */
  workflows: "cloud" | "local";
  hardware: string;
  /** Each take, with when its job finished (`updatedAt` of the Ready job). */
  takes: { take: Take; finishedAt?: string }[];
  /** Output SHA-256 by asset id, where the bytes were read. */
  hashes?: Record<string, string>;
  /** The session's own start and end, when the agent kept them. */
  startedAt?: string;
  finishedAt?: string;
}

/** A card from finished takes. Throws `ProvenanceError` on anything it cannot vouch for. */
export function buildProvenance(input: ProvenanceInput): ProvenanceCard {
  if (!input.takes.length) fail("A card needs at least one take");
  const agent = readAgent(input.agent);
  const generations = input.takes.map(({ take }, i) => {
    const settings = take.inputs.find((item) => item.role === "settings");
    return readGeneration(
      {
        operationId: take.operationId,
        entry: take.recipe.id,
        route: take.recipe.route,
        runsOn: runsOnFor(
          take.recipe.route,
          take.recipe.location === "local"
            ? "local"
            : take.recipe.location
              ? "cloud"
              : input.workflows,
        ),
        workflow: take.recipe.workflow,
        recipeVersion: take.recipe.version,
        settingsSha256: settings && "sha256" in settings ? settings.sha256 : "",
        estimateUsd: take.receipt.estimateUsd,
        actualUsd: take.receipt.actualUsd,
        credits: take.receipt.credits,
        outputs: take.outputs.map((o) => o.assetId),
      },
      `takes[${i}]`,
    );
  });
  return readProvenance({
    version: PROVENANCE_VERSION,
    title: input.title,
    template: input.template ?? null,
    skill: input.skill ?? null,
    agent: input.agent,
    generations,
    workflowFiles: workflowFiles(generations),
    run: {
      generations: whereOf(generations.map((g) => g.runsOn)),
      agent: agent.provider === "local" ? "local" : "cloud",
      hardware: input.hardware,
    },
    time: timing(input),
    cost: totals(generations),
    outputs: input.takes.flatMap(({ take }) =>
      take.outputs.map((o) => ({
        assetId: o.assetId,
        operationId: take.operationId,
        mediaType: o.mediaType,
        contentType: o.contentType,
        sha256: input.hashes?.[o.assetId] ?? null,
      })),
    ),
    tier: provenanceTier({ agent, generations }),
  });
}

/**
 * From the first take's creation (or the session's start) to the last take's
 * finish (or the session's end). Null when a take's finish is unknown and the
 * session's end was not given: a creation time is never a finish time.
 */
function timing(input: ProvenanceInput): ProvenanceCard["time"] {
  if (
    input.finishedAt === undefined &&
    input.takes.some((t) => t.finishedAt === undefined)
  )
    return null;
  const ms = [
    ...input.takes.flatMap(({ take, finishedAt }) => [
      take.createdAt,
      finishedAt,
    ]),
    input.startedAt,
    input.finishedAt,
  ].flatMap((t) => (t === undefined ? [] : [Date.parse(t)]));
  if (ms.some((n) => !Number.isFinite(n))) fail("A time is not an ISO time");
  const startedAt = new Date(
    input.startedAt ? Date.parse(input.startedAt) : Math.min(...ms),
  );
  const finishedAt = new Date(
    input.finishedAt ? Date.parse(input.finishedAt) : Math.max(...ms),
  );
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    seconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
  };
}
