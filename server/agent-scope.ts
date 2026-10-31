import { readsSourceClip } from "../shared/openjutsu";
// An agent's studio request, scoped to the session that started it (issue
// #23, "Picks and context"): the agent's MCP server (by its grant) and its
// browser (by its ticket session) may read, as the person's, exactly the ids
// in one readable set: the person's picked takes and the upscale source in
// "these settings". Every route that reads a job, take or source by id asks
// `readerOf` (listed in `SCOPED_READS`); nothing else of the person's is
// reachable. Read only: writes, cancels and submissions still run in the
// agent's own session, and the paid routes refuse it.
import type express from "express";
import { AGENT_RUN_HEADER } from "../shared/agent-session-events";
import type { AgentContext, AgentSettings } from "../shared/agent-context";
import type { AgentSessions, AgentSessionsOptions } from "./agent-sessions";
import type { Store } from "./store";
import { loadSamples } from "./media";
import type { JobService } from "./jobs";
import { requireKey } from "./errors";
import { validateInput } from "./validation";
import type { WorkflowSettings } from "./workflow-settings";
import { takeOutputs } from "../shared/take";

/**
 * What a session start needs from the studio: whether the person owns a
 * picked take, and their run location and templates for the agent's studio
 * sessions (written through `WorkflowSettings`, as the person's controls do).
 */
export function agentAccess(
  store: Store,
  settings: WorkflowSettings,
  publicDirectory: string,
): Pick<AgentSessionsOptions, "owns" | "sourceAccess" | "settings"> {
  return {
    owns: (jobId, owner) =>
      store.data.jobs.some((j) => j.id === jobId && j.sessionId === owner),
    // A private source of the person's is read through the scope; a
    // catalogue clip is public, so it is only kept in the context.
    sourceAccess: async (id, owner) =>
      store.data.sources.some((s) => s.id === id && s.sessionId === owner)
        ? "owned"
        : (await loadSamples(publicDirectory)).some((s) => s.id === id)
          ? "public"
          : undefined,
    settings: {
      snapshot: (owner) => settings.snapshot(owner),
      adopt: (id, snapshot) =>
        void settings.adopt(id, snapshot).catch(() => {}),
    },
  };
}

/**
 * Every route that reads a job, take or source by id, each resolving that id
 * through `readerOf`. `tests/agent-scope-routes.test.ts` checks each against
 * the scope, and that every route the server registers is either here or
 * named there with the reason it is not.
 */
export const SCOPED_READS = [
  "GET /api/jobs/:id",
  "GET /api/takes/:id",
  "GET /api/clips/:id",
  "GET /api/media/:id/probe",
  "POST /api/quotes",
  "POST /api/projects/:id/takes",
  "POST /api/audio/analyze",
] as const;

/**
 * How a settings source may be used: `owned` (a private source of the
 * person's, read through the scope) or `public` (a catalogue clip anyone may
 * name, kept without a grant). Anything else is left out.
 */
export type SourceAccess = "owned" | "public" | undefined;

/**
 * The context the agent is given, and the ids it may read:
 * - take picks the person owns (others dropped);
 * - asset picks of the linked project only (`linkedProject`, the session's
 *   `copyId` project): an earlier project's picks are left out, with a note,
 *   since the agent cannot open that project;
 * - the `direction` (global prompt, selected clip) of the linked project only;
 * - `world` only when World Builder sits beside the linked project (or
 *   beside none, for an unlinked session);
 * - the settings' upscale source when the person owns it (readable) or it is
 *   a catalogue clip (public, kept), otherwise left out of the settings.
 */
export function scopedContext(
  context: AgentContext | undefined,
  owner: string,
  ownsJob: (id: string, owner: string) => boolean,
  source: SourceAccess,
  linkedProject?: string,
) {
  if (!context) return { context, readable: new Set<string>() };
  const otherProject = (pick: AgentContext["picks"][number]) =>
    pick.kind === "asset" && pick.projectId !== linkedProject;
  const left = context.picks.filter(otherProject).length;
  // The direction of an unlinked project stays out, as its picks do.
  const direction =
    context.direction?.projectId === linkedProject
      ? context.direction
      : undefined;
  // World Builder beside another project: its hand-off would not reach it.
  const world =
    context.world?.projectId === linkedProject ? context.world : undefined;
  const picks = context.picks.filter(
    (pick) =>
      !otherProject(pick) && (pick.kind !== "take" || ownsJob(pick.id, owner)),
  );
  const { sourceId, ...rest } = context.settings ?? {};
  const keep = !!sourceId && !!source;
  const settings = context.settings && {
    ...rest,
    ...(keep ? { sourceId } : {}),
  };
  const readable = new Set(
    picks.filter((pick) => pick.kind === "take").map((pick) => pick.id),
  );
  if (keep && source === "owned") readable.add(sourceId!);
  return {
    context: {
      picks,
      ...(context.usage ? { usage: context.usage } : {}),
      ...(context.selection ? { selection: context.selection } : {}),
      ...(settings ? { settings: settings as AgentSettings } : {}),
      ...(direction ? { direction } : {}),
      ...(world ? { world } : {}),
      ...(left
        ? {
            note: `${left} ${left === 1 ? "pick" : "picks"} from another project ${left === 1 ? "was" : "were"} left out; open that project to use ${left === 1 ? "it" : "them"}.`,
          }
        : {}),
    },
    readable,
  };
}

/** Sets `locals.agentScope` for an agent's request; binds its settings once. */
export function scopeAgentRequest(
  agents: Pick<AgentSessions, "scope">,
  request: express.Request,
  locals: Record<string, unknown>,
  store?: Store,
) {
  if (!locals.agent) return;
  const grant = request.headers[AGENT_RUN_HEADER.toLowerCase()];
  const scope = agents.scope(
    locals.sessionId as string,
    typeof grant === "string" ? grant : undefined,
  );
  if (!scope || !store) {
    locals.agentScope = scope;
    return;
  }
  // A picked take grants its actual saved outputs, never a guessed id prefix.
  // Recomputed per request so outputs finishing after the pick become readable.
  const readable = new Set(scope.readable);
  for (const job of store.data.jobs) {
    if (
      job.sessionId !== scope.owner ||
      job.status !== "Ready" ||
      !scope.readable.has(job.id)
    )
      continue;
    for (const output of takeOutputs(job)) {
      if (
        output.available &&
        store.data.sources.some(
          (source) =>
            source.id === output.assetId && source.sessionId === scope.owner,
        )
      )
        readable.add(output.assetId);
    }
  }
  locals.agentScope = { ...scope, readable };
}

/**
 * The session a job, take or source read runs in: the person's for an id in
 * the scope; for a studio request, the session that made a take a terminal
 * or an agent shared (`server/shared-takes.ts`); otherwise the request's own
 * (so anything else is still a 404). The one helper every route in
 * `SCOPED_READS` uses.
 */
export function readerOf(locals: Record<string, unknown>, jobId: string) {
  const scope = locals.agentScope as
    { owner: string; readable: ReadonlySet<string> } | undefined;
  if (scope?.readable.has(jobId)) return scope.owner;
  const shared = locals.sharedOwner as
    ((id: string) => string | undefined) | undefined;
  return shared?.(jobId) ?? (locals.sessionId as string);
}

/**
 * `POST /api/quotes`: a quote in the request's own session. An upscale of a
 * take the person picked reads that take's clip as the person's (the
 * picked-take scope); the quote, its budget and run location stay the
 * agent's.
 */
export async function quoteFor(
  service: Pick<JobService, "quote">,
  request: express.Request,
  locals: Record<string, unknown>,
) {
  const byo = request.headers["x-byo-key"];
  const byoKey = byo === undefined ? undefined : requireKey(byo);
  const input = validateInput(request.body);
  const sessionId = locals.sessionId as string;
  const sourceSession =
    readsSourceClip(input) && input.sourceId
      ? readerOf(locals, input.sourceId)
      : sessionId;
  const quote = await service.quote(input, sessionId, byoKey, sourceSession);
  // The session that held the source goes with the quote, so an approval
  // reads it there again (`server/agent-approvals.ts`).
  return { input, quote, sourceSession };
}
