// Takes made from a terminal or an agent appear in the studio (29 Oct 2026).
// The Genobi CLI and an MCP client each hold their own studio session, so a
// take one of them made used to stay out of the person's gallery. The local
// server has one owner and answers loopback only, so the studio may now list
// and read those takes: another session's Ready job that a terminal or an
// agent submitted, and the file it produced. Nothing else is opened. Studio
// sessions stay apart from each other, an agent-marked request reads only its
// scope (`server/agent-scope.ts`), and every write, quote, budget and spend
// still runs in the request's own session. The hosted Worker has none of this.
import type express from "express";
import { GENOBI_CLIENT_HEADER } from "../shared/agent-session-events";
import { readsSourceClip } from "../shared/openjutsu";
import type { GenerateInput, JobOrigin } from "../shared/types";
import { readerOf } from "./agent-scope";
import type { Made } from "./jobs";
import { loadSamples } from "./media";
import { publicJob, publicSource, type Store, type StoredJob } from "./store";

/**
 * Who sent a request, from its own marks: an agent-marked one or an MCP
 * client is `agent`, the CLI is `terminal`, anything else is the studio
 * (undefined). Like the marks themselves, it grants nothing.
 */
export function requestOrigin(
  request: express.Request,
  agent: boolean,
): JobOrigin | undefined {
  const client = request.get(GENOBI_CLIENT_HEADER);
  if (agent || client === "mcp") return "agent";
  return client === "cli" ? "terminal" : undefined;
}

/** A take the studio may list and read although another session made it. */
const shareable = (job: StoredJob, sessionId: string) =>
  job.sessionId !== sessionId &&
  job.origin !== undefined &&
  job.status === "Ready" &&
  job.mediaAvailable !== false;

/** Mark shared results consistently in history and direct job reads. */
export function jobForReader(job: StoredJob, sessionId: string) {
  return shareable(job, sessionId)
    ? { ...publicJob(job), shared: true as const }
    : publicJob(job);
}

/**
 * The session that holds a shared take or its file, for a studio request;
 * undefined for anything else, so the request's own session still answers
 * (and another session's id is still a 404).
 */
export function sharedOwner(store: Store, id: string, sessionId: string) {
  const job = store.data.jobs.find((item) => item.id === id);
  return job && shareable(job, sessionId) ? job.sessionId : undefined;
}

/**
 * Sets `locals.sharedOwner`, which `readerOf` asks, on a studio request only:
 * an agent-marked request, the CLI and an MCP client read their own session
 * and their scope, never another session's takes.
 */
export function shareTakes(
  store: Store,
  request: express.Request,
  locals: Record<string, unknown>,
) {
  if (requestOrigin(request, Boolean(locals.agent))) return;
  const sessionId = locals.sessionId as string;
  locals.sharedOwner = (id: string) => sharedOwner(store, id, sessionId);
}

/**
 * `GET /api/history`: the session's own runs and sources, the library, and
 * for the studio (`shared`) the takes terminals and agents made, each marked
 * `shared: true` with its origin. Only Ready takes: the studio polls nothing
 * it did not start, since a run's poll may need a key it does not hold.
 */
export async function historyOf(
  store: Store,
  publicDirectory: string,
  sessionId: string,
  shared: boolean,
) {
  const jobs = store.data.jobs.filter(
    (job) =>
      job.sessionId === sessionId || (shared && shareable(job, sessionId)),
  );
  const sharedIds = new Set(
    jobs.filter((job) => job.sessionId !== sessionId).map((job) => job.id),
  );
  // Terminal activity must not evict the studio's own history or stop its
  // poller from collecting an unfinished run. Bound each list independently.
  const visibleIds = new Set([
    ...jobs
      .filter((job) => job.sessionId === sessionId)
      .slice(-50)
      .map((job) => job.id),
    ...jobs
      .filter((job) => sharedIds.has(job.id))
      .slice(-50)
      .map((job) => job.id),
  ]);
  return {
    jobs: jobs
      .filter((job) => visibleIds.has(job.id))
      .reverse()
      .map((job) => jobForReader(job, sessionId)),
    sources: [
      ...(await loadSamples(publicDirectory)),
      ...store.data.sources
        .filter(
          (source) =>
            source.sessionId === sessionId || sharedIds.has(source.id),
        )
        .map(publicSource),
    ],
  };
}

/**
 * What `POST /api/jobs` records: the request's origin, and for an upscale the
 * session that holds its source, so the studio can upscale a shared take.
 */
export function madeBy(
  request: express.Request,
  locals: Record<string, unknown>,
  input: GenerateInput,
): Made {
  const origin = requestOrigin(request, Boolean(locals.agent));
  return {
    ...(origin ? { origin } : {}),
    ...(readsSourceClip(input) && input.sourceId
      ? { sourceSession: readerOf(locals, input.sourceId) }
      : {}),
  };
}
