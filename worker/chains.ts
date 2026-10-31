// Chained jobs on the hosted adapter: one D1 row per chain, changed only by
// compare-and-set on `revision`, and its stages as ordinary job rows found by
// key. The contract is shared/chain.ts; server/chains.ts is the local mirror.
import { AppError } from "../server/errors";
import { validateChain } from "../server/validate-chain";
import { validateQuoteId } from "../server/validation";
import {
  approvalStage,
  approvedWith,
  CHAIN_ID,
  chainStageKey,
  chainStatus,
  chainView,
  stageInput,
  stageStatuses,
  type ChainRecord,
} from "../shared/chain";
import { publicQuote } from "../shared/quote";
import { readyEntry } from "../shared/registry";
import type { GenerateInput, Job } from "../shared/types";
import { workflowPlan } from "./deployments";
import { submit } from "./jobs";
import { findQuote, quote } from "./quotes";
import { rateLimit } from "./storage";

interface Loaded {
  record: ChainRecord;
  revision: number;
  session: string;
}
/** Three attempts, then the caller reads the chain again. */
const ATTEMPTS = 3;
const busy = () =>
  new AppError(
    409,
    "This chain changed while it was being updated. Read it and try again.",
    "chain_busy",
  );

async function load(env: Env, id: string, session: string): Promise<Loaded> {
  const row = CHAIN_ID.test(id)
    ? await env.DB.prepare(
        "SELECT data, revision FROM chains WHERE id=? AND session=?",
      )
        .bind(id, session)
        .first<{ data: string; revision: number }>()
    : null;
  if (!row) throw new AppError(404, "Chain not found.");
  return {
    record: JSON.parse(row.data) as ChainRecord,
    revision: row.revision,
    session,
  };
}

/** False when another request changed the chain first. */
async function save(env: Env, loaded: Loaded) {
  loaded.record.updatedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    "UPDATE chains SET data=?, revision=revision+1 WHERE id=? AND session=? AND revision=?",
  )
    .bind(
      JSON.stringify(loaded.record),
      loaded.record.id,
      loaded.session,
      loaded.revision,
    )
    .run();
  return Boolean(result.meta.changes);
}

const jobsQuery = (env: Env, session: string, record: ChainRecord) => {
  const keys = record.stages.map((_, index) => chainStageKey(record.id, index));
  return env.DB.prepare(
    `SELECT idempotency, data FROM jobs WHERE session=? AND idempotency IN (${keys.map(() => "?").join(",")})`,
  ).bind(session, ...keys);
};
const byStage = (
  record: ChainRecord,
  rows: { idempotency: string; data: string }[],
) =>
  record.stages.map((_, index) => {
    const row = rows.find(
      (item) => item.idempotency === chainStageKey(record.id, index),
    );
    return row ? (JSON.parse(row.data) as Job) : undefined;
  });

/** Each stage's job, by its key, within the owner's session. */
async function stageJobs(env: Env, session: string, record: ChainRecord) {
  const rows = await jobsQuery(env, session, record).all<{
    idempotency: string;
    data: string;
  }>();
  return byStage(record, rows.results);
}

async function liveQuote(env: Env, session: string, id: string | undefined) {
  const found = id ? await findQuote(env, id, session) : undefined;
  if (!found || found.jobId || Date.parse(found.expiresAt) <= Date.now())
    return undefined;
  const entry = readyEntry(found.recipe.id);
  if (entry?.route === "workflow") {
    let plan;
    try {
      plan = await workflowPlan(env, session, entry);
    } catch (error) {
      if (error instanceof AppError) return undefined;
      throw error;
    }
    // A changed endpoint, preset or location needs a new approval, just as on
    // the local adapter. A read can quote it again without submitting a run.
    if (
      found.recipe.location !== plan.location ||
      found.recipe.workflow !== plan.workflow ||
      found.recipe.deployment?.url !== plan.deployment?.url
    )
      return undefined;
  }
  return found;
}

async function view(env: Env, loaded: Loaded, jobs?: (Job | undefined)[]) {
  jobs ??= await stageJobs(env, loaded.session, loaded.record);
  const at = approvalStage(stageStatuses(loaded.record, jobs));
  const offer =
    at < 0
      ? undefined
      : await liveQuote(env, loaded.session, loaded.record.stages[at].quoteId);
  return chainView(loaded.record, jobs, offer && publicQuote(offer));
}

export async function createChain(
  env: Env,
  body: unknown,
  session: string,
  key: string,
) {
  const { stages, target } = validateChain(body);
  // Quoted before anything is stored, as the local adapter does.
  const offer = await quote(env, stages[0].input, session, key);
  const now = new Date();
  const record: ChainRecord = {
    id: crypto.randomUUID(),
    ...(target ? { target } : {}),
    stages: stages.map((stage, index) =>
      index === 0 ? { ...stage, quoteId: offer.id } : stage,
    ),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await env.DB.prepare(
    "INSERT INTO chains (id,session,data,revision,created_at) VALUES (?,?,?,0,?)",
  )
    .bind(record.id, session, JSON.stringify(record), now.getTime())
    .run();
  return { chain: await view(env, { record, revision: 0, session }) };
}

/** The newest fifty, with stage statuses; read one for its pause's quote. */
export async function listChains(env: Env, session: string) {
  const rows = await env.DB.prepare(
    "SELECT data FROM chains WHERE session=? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(session)
    .all<{ data: string }>();
  const records = rows.results.map(
    (row) => JSON.parse(row.data) as ChainRecord,
  );
  if (!records.length) return { chains: [] };
  const jobs = await env.DB.batch<{ idempotency: string; data: string }>(
    records.map((record) => jobsQuery(env, session, record)),
  );
  return {
    chains: records.map((record, index) =>
      chainView(record, byStage(record, jobs[index].results)),
    ),
  };
}

/** As `ChainService.read`: a pause with no live quote is quoted with this key. */
export async function readChain(
  env: Env,
  id: string,
  session: string,
  key?: string,
) {
  const loaded = await load(env, id, session);
  const { record } = loaded;
  const jobs = await stageJobs(env, session, record);
  const statuses = stageStatuses(record, jobs);
  const at = statuses.indexOf("paused");
  if (
    chainStatus(record, statuses) !== "paused" ||
    at < 0 ||
    (await liveQuote(env, session, record.stages[at].quoteId))
  )
    return { chain: await view(env, loaded, jobs) };
  if (!key) return { chain: await view(env, loaded, jobs), needsKey: true };
  let quoteId: string;
  try {
    quoteId = (await quote(env, stageInput(record, at, jobs), session, key)).id;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return {
      chain: await view(env, loaded, jobs),
      pauseError: { error: error.message, code: error.code },
    };
  }
  record.stages[at].quoteId = quoteId;
  // A lapsed approval goes with the quote it was for.
  delete record.stages[at].approval;
  // Whoever changed the chain first (a read, an approval, a cancel) wins.
  if (await save(env, loaded)) return { chain: await view(env, loaded, jobs) };
  return { chain: await view(env, await load(env, id, session)) };
}

/**
 * Clears this approval's own claim after its submission was refused before
 * any reservation. Another request's claim is never touched.
 */
async function release(
  env: Env,
  id: string,
  session: string,
  at: number,
  claimId: string,
) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const loaded = await load(env, id, session);
    const stage = loaded.record.stages[at];
    if (stage.approval?.claimId !== claimId) return;
    if ((await stageJobs(env, session, loaded.record))[at]) return;
    delete stage.approval;
    if (await save(env, loaded)) return;
  }
}

/** What submits a stage; the job service unless a test stands in for it. */
export type StageSubmit = (
  env: Env,
  input: GenerateInput,
  session: string,
  idempotency: string,
  key: string,
  origin: string,
  quoteId: string,
) => Promise<unknown>;

/**
 * As `ChainService.approve`: the claim is this request's own, stored by
 * compare-and-set, and checked again before the stage is submitted.
 */
export async function approveChain(
  env: Env,
  id: string,
  session: string,
  quoteId: string,
  key: string,
  origin: string,
  run: StageSubmit = submit,
) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const loaded = await load(env, id, session);
    const { record } = loaded;
    if (record.cancelledAt)
      throw new AppError(409, "This chain was cancelled.", "chain_cancelled");
    const jobs = await stageJobs(env, session, record);
    const statuses = stageStatuses(record, jobs);
    const at = approvalStage(statuses);
    if (at < 0) {
      if (approvedWith(record, quoteId))
        return { chain: await view(env, loaded, jobs) };
      throw new AppError(
        409,
        "This chain is not waiting for an approval.",
        "chain_not_paused",
      );
    }
    const stage = record.stages[at];
    if (statuses[at] === "submitting") {
      // Another request holds this approval; its run is the answer.
      if (stage.approval!.quoteId === quoteId)
        return { chain: await view(env, loaded, jobs) };
      throw new AppError(
        409,
        "This stage was approved with another quote.",
        "chain_approved",
      );
    }
    if (stage.quoteId !== quoteId)
      throw new AppError(
        409,
        "This quote is not the one the chain is waiting on. Read the chain for its quote.",
        "quote_mismatch",
      );
    const claim = {
      quoteId,
      claimId: crypto.randomUUID(),
      at: new Date().toISOString(),
    };
    stage.approval = claim;
    if (!(await save(env, loaded))) continue;
    // Checked again once the claim is stored, before anything is sent.
    const stored = (await load(env, id, session)).record;
    if (stored.cancelledAt)
      throw new AppError(409, "This chain was cancelled.", "chain_cancelled");
    if (stored.stages[at].approval?.claimId !== claim.claimId)
      throw new AppError(
        409,
        "This stage was approved by another request.",
        "chain_approved",
      );
    try {
      await run(
        env,
        stageInput(record, at, jobs),
        session,
        chainStageKey(record.id, at),
        key,
        origin,
        quoteId,
      );
    } catch (error) {
      await release(env, id, session, at, claim.claimId);
      throw error;
    }
    return { chain: await view(env, await load(env, id, session)) };
  }
  throw busy();
}

export async function cancelChain(env: Env, id: string, session: string) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const loaded = await load(env, id, session);
    const { record } = loaded;
    const jobs = await stageJobs(env, session, record);
    if (record.cancelledAt) return { chain: await view(env, loaded, jobs) };
    const status = chainStatus(record, stageStatuses(record, jobs));
    if (status !== "paused")
      throw new AppError(
        409,
        status === "running"
          ? "A stage is running. A chain can be cancelled only at a pause."
          : "This chain has already finished.",
        "chain_not_paused",
      );
    record.cancelledAt = new Date().toISOString();
    if (await save(env, loaded))
      return { chain: await view(env, loaded, jobs) };
  }
  throw busy();
}

/**
 * The `/api/chains` routes, or null for a path they do not own. The session
 * middleware in `worker/index.ts` has already counted every POST and required
 * its key; reads count their own buckets here.
 */
export async function chainRoute(
  env: Env,
  request: Request,
  url: URL,
  session: string,
  key: string | undefined,
  readBody: () => Promise<unknown>,
): Promise<{ body: unknown; status: number } | null> {
  const get = request.method === "GET";
  const post = request.method === "POST";
  if (url.pathname === "/api/chains") {
    if (get) {
      await rateLimit(env, "history", session);
      return { body: await listChains(env, session), status: 200 };
    }
    if (!post) return null;
    if (Number(request.headers.get("content-length")) > 64 * 1024)
      throw new AppError(413, "The request is too large.");
    return {
      body: await createChain(env, await readBody(), session, key!),
      status: 201,
    };
  }
  const match = /^\/api\/chains\/([^/]+)(?:\/(approve|cancel))?$/.exec(
    url.pathname,
  );
  if (!match) return null;
  const [, id, action] = match;
  if (get && !action) {
    // A read can price the next stage, one upstream balance call, like a poll.
    await rateLimit(env, "poll", session);
    return { body: await readChain(env, id, session, key), status: 200 };
  }
  if (post && action === "approve") {
    const quoteId = validateQuoteId(
      request.headers.get("quote-id") ?? undefined,
    );
    if (!quoteId)
      throw new AppError(
        400,
        "Approve with the quote the chain is waiting on, as Quote-Id.",
        "quote_missing",
      );
    return {
      body: await approveChain(env, id, session, quoteId, key!, url.origin),
      status: 202,
    };
  }
  if (post && action === "cancel")
    return { body: await cancelChain(env, id, session), status: 200 };
  return null;
}
