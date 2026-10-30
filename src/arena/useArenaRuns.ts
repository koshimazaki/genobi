import { useEffect, useRef, useState } from "react";
import { draftOf, type Arena } from "../../shared/arena";
import { takesReferences } from "../../shared/arena-run";
import type { Quote } from "../../shared/quote";
import { type GenerateInput, type Job } from "../../shared/types";
import { announceApprovedJob } from "../agent/approved-jobs";
import { expectedHeaders } from "../settings-store";
import { arenaPost, arenaRequest, saveArena } from "./client";
import type { useArena } from "./useArena";

import { runnable, runKey } from "./run-state";
import { referenceUrls } from "./run-references";
import { pollArenaRuns } from "./poll-runs";
import { submitArenaRuns } from "./submit-runs";
import { confirmText, planRuns, quoteRuns } from "./quote-runs";
export { runnable } from "./run-state";

type ArenaState = ReturnType<typeof useArena>;

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw Object.assign(
      new Error(data?.error ?? "The studio did not answer."),
      {
        status: response.status,
      },
    );
  return data;
}
const json = (input: GenerateInput, extra: Record<string, string> = {}) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...expectedHeaders(input),
    ...extra,
  },
  body: JSON.stringify(input),
});

/**
 * Runs approaches through the studio's own paid path: one quote each, one
 * confirmation for the total, the idempotency key saved in the comparison
 * before anything is sent, then `POST /api/jobs`. Each run joins the studio's
 * queue, and a finished video is copied into its approach. Nothing here
 * retries a submission on its own; a later press reuses the saved key, so a
 * request that did land is replayed rather than paid for twice.
 */
export function useArenaRuns(state: ArenaState, active: boolean) {
  const [known, setKnown] = useState<Record<string, Job>>({});
  const arenaId = state.arena?.id;
  const jobs: Record<string, Job> = {};
  for (const slot of state.arena?.slots ?? []) {
    const job = slot.run?.jobId && known[runKey(arenaId!, slot.run.jobId)];
    if (job) jobs[slot.id] = job;
  }
  const latest = useRef(state);
  latest.current = state;
  const seen = useRef(known);
  seen.current = known;
  function record(id: string, job: Job) {
    const key = runKey(id, job.id);
    seen.current = { ...seen.current, [key]: job };
    setKnown((all) => ({ ...all, [key]: job }));
  }

  async function run(slotIds: string[]) {
    let arena = await state.save();
    const draft = draftOf(arena);
    const wanted = draft.slots.filter(
      (s) => slotIds.includes(s.id) && runnable(s, jobs),
    );
    if (!wanted.length)
      throw new Error("Choose a model for a load before generating.");
    const references = wanted.some((s) => takesReferences(s.run!.entry))
      ? await referenceUrls(arena)
      : [];
    const plans = planRuns(draft, slotIds, jobs, references);
    const chosen = plans.map((p) => p.slot),
      inputs = plans.map((p) => p.input);
    const quotes = await quoteRuns(
      plans,
      async (input) =>
        (await send<{ quote: Quote }>("/api/quotes", json(input))).quote,
    );
    if (!window.confirm(confirmText(plans, quotes))) return;
    // The reservation is saved before submission. A key with no job came from
    // a submission whose answer was lost: it is reused, so it can only replay.
    const keys = new Map(
      chosen.map((s) => [
        s.id,
        s.run!.key && !s.run!.jobId ? s.run!.key : crypto.randomUUID(),
      ]),
    );
    arena = (
      await saveArena(arena, {
        ...draft,
        slots: draft.slots.map((s) =>
          keys.has(s.id)
            ? {
                ...s,
                status: "running" as const,
                run: { entry: s.run!.entry, key: keys.get(s.id) },
              }
            : s,
        ),
      })
    ).arena;
    state.adopt(arena);
    const { started, failures } = await submitArenaRuns(
      chosen,
      inputs,
      quotes,
      keys,
      async (input, headers) =>
        (await send<{ job: Job }>("/api/jobs", json(input, headers))).job,
      (_slotId, job) => {
        record(arena.id, job);
        announceApprovedJob({ id: job.id, job });
      },
    );
    if (Object.keys(started).length) {
      const saved = draftOf(arena);
      arena = (
        await saveArena(arena, {
          ...saved,
          slots: saved.slots.map((s) =>
            started[s.id]
              ? { ...s, run: { ...s.run!, jobId: started[s.id] } }
              : s,
          ),
        })
      ).arena;
      state.adopt(arena);
    }
    // The agent's request, if any, has been answered.
    if (arena.runRequest)
      state.adopt(
        (
          await arenaRequest<{ arena: Arena }>(`/${arena.id}/run-request`, {
            method: "DELETE",
          })
        ).arena,
      );
    if (failures.length)
      throw new Error(
        `${failures.join(" ")} Check the queue before running again; the same request is reused.`,
      );
  }

  // Stop the old comparison's poller before another one can adopt a result.
  useEffect(() => {
    if (!active || !arenaId) return;
    const poller = pollArenaRuns({
      current: () => latest.current,
      hidden: () => document.hidden,
      known: (id, jobId) => seen.current[runKey(id, jobId)],
      read: async (jobId) =>
        (
          await send<{ job: Job }>(`/api/jobs/${encodeURIComponent(jobId)}`, {
            method: "GET",
          })
        ).job,
      record,
      attach: async (id, slot, jobId) =>
        (
          await arenaPost<{ arena: Arena }>(`/${id}/slots/${slot}/result`, {
            jobId,
          })
        ).arena,
      adopt: (arena) => latest.current.adopt(arena),
    });
    void poller.tick();
    const timer = setInterval(() => void poller.tick(), 4000);
    return () => {
      poller.stop();
      clearInterval(timer);
    };
  }, [active, arenaId]);

  return { jobs, run };
}
