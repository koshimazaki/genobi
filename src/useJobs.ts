import { recordJobActivity } from "./activity/jobs";
import { librarySources } from "./library";
import { isTerminal } from "../shared/types";
import { selectedJob, cleanJobUrl, jobHistoryState } from "./job-links";
import { trackJob } from "./track-job";
import { useHostedStudio } from "./hosted-studio";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Job, Source, GenerateInput } from "../shared/types";
import type { ComposerState } from "./useComposer";
import { captureRunInputs, runInputStore } from "./run-inputs";
// Recreate restores a run's template and run location with its settings.
export { restoreRun } from "./useRecreate";
import { expectedHeaders } from "./settings-store";
import {
  handOffApprovedJob,
  onApprovedJob,
  retryPendingHandoffs,
} from "./agent/approved-jobs";
export function preserveStoppedJobs(current: Job[], incoming: Job[]): Job[] {
  const stopped = new Map(
    current
      .filter((job) => job.status === "stopped")
      .map((job) => [job.id, job]),
  );
  const merged = incoming.map((job) => stopped.get(job.id) ?? job);
  for (const job of stopped.values())
    if (!merged.some((candidate) => candidate.id === job.id)) merged.push(job);
  return merged;
}

function preserveStoppedUpdate(current: Job, incoming: Job): Job {
  return current.status === "stopped" ? current : incoming;
}
/** Changes when a run settles or its charge arrives: the balance re-reads. */
export const settledRevision = (jobs: Job[]) =>
  jobs
    .filter((job) => isTerminal(job.status))
    .map((job) => `${job.id}:${job.costActualUsd ?? ""}`)
    .join("|");

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, { ...options, cache: "no-store" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || data.message || "The request could not be completed.",
    );
  return data;
}
export function useJobs(key: string) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [sources, setSources] = useState<Source[]>(librarySources),
    [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(() =>
    selectedJob(location.href, history.state),
  );
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const keyRef = useRef(key);
  keyRef.current = key;
  const needsKey =
    !key &&
    jobs.some((job) => job.keyMode === "byo" && !isTerminal(job.status));
  const observed = useRef(new Map<string, string>());
  useEffect(() => {
    for (const job of jobs) {
      if (observed.current.get(job.id) === job.status) continue;
      observed.current.set(job.id, job.status);
      void recordJobActivity(job);
    }
  }, [jobs]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const pollError = useRef("");
  const refresh = useCallback(async () => {
    const data = await request<{ jobs: Job[]; sources: Source[] }>(
      "/api/history",
    );
    // The studio is reachable again: hand over any approved run still waiting.
    retryPendingHandoffs();
    const linkedId = selectedRef.current;
    if (linkedId && !data.jobs.some((job) => job.id === linkedId)) {
      try {
        const linked = await request<{ job: Job }>(
          `/api/jobs/${encodeURIComponent(linkedId)}`,
          { headers: keyRef.current ? { "x-byo-key": keyRef.current } : {} },
        );
        data.jobs.push(linked.job);
      } catch {
        setError(
          "That job is unavailable in this browser session. Showing your latest clip.",
        );
        setSelectedId(null);
        history.replaceState(
          jobHistoryState(history.state, null),
          "",
          cleanJobUrl(location.href),
        );
      }
    }
    setJobs((current) => preserveStoppedJobs(current, data.jobs));
    setSources(data.sources);
  }, []);
  useEffect(() => {
    let cancelled = false,
      inFlight = false,
      timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      if (inFlight || cancelled) return;
      inFlight = true;
      if (!document.hidden) {
        for (const job of jobsRef.current.filter(
          (j) => !isTerminal(j.status),
        )) {
          try {
            const result = await request<{ job: Job; needsKey?: boolean }>(
              `/api/jobs/${job.id}`,
              {
                headers: key ? { "x-byo-key": key } : {},
                signal: controller.signal,
              },
            );
            if (cancelled) return;
            setJobs((current) =>
              current.map((j) =>
                j.id === result.job.id
                  ? preserveStoppedUpdate(j, result.job)
                  : j,
              ),
            );
            // A poll that recovers retracts its own banner. Errors raised
            // elsewhere stay until their own owner clears them.
            if (pollError.current) {
              const recovered = pollError.current;
              pollError.current = "";
              setError((current) => (current === recovered ? "" : current));
            }
            if (result.job.status === "Ready") await refresh();
          } catch (e) {
            if (!cancelled) {
              const message =
                e instanceof Error ? e.message : "Could not refresh the job.";
              pollError.current = message;
              setError(message);
            }
          }
        }
      }
      inFlight = false;
      if (!cancelled) timer = setTimeout(poll, 4000);
    }
    const visibility = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        void poll();
      }
    };
    timer = setTimeout(poll, 700);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, refresh]);
  useEffect(() => {
    const navigate = () => {
      setSelectedId(selectedJob(location.href, history.state));
    };
    // Migrate old ?job links without losing the selected clip on reload.
    history.replaceState(
      jobHistoryState(history.state, selectedRef.current),
      "",
      cleanJobUrl(location.href),
    );
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [selectedId, refresh]);
  // Local only: a take a terminal or an agent made arrives without a reload
  // (`server/shared-takes.ts`). History lists only Ready shared takes, so
  // nothing here polls a run this page did not start, whose key it may lack.
  const hosted = useHostedStudio();
  useEffect(() => {
    if (hosted) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {});
    }, 20_000);
    return () => clearInterval(timer);
  }, [hosted, refresh]);
  function selectJob(id: string) {
    setSelectedId(id);
    history.replaceState(
      jobHistoryState(history.state, id),
      "",
      cleanJobUrl(location.href),
    );
    document.getElementById("main-video")?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  /** One chain stage into the poller's list; see `trackJob`. */
  const track = (id: string) =>
    trackJob({
      id,
      jobs: jobsRef.current,
      sources: sourcesRef.current,
      readJob: async (jobId) =>
        (
          await request<{ job: Job }>(
            `/api/jobs/${encodeURIComponent(jobId)}`,
            { headers: keyRef.current ? { "x-byo-key": keyRef.current } : {} },
          )
        ).job,
      add: (job) =>
        setJobs((current) =>
          current.some((j) => j.id === job.id) ? current : [job, ...current],
        ),
      refresh,
    });
  // A run approved in the agent panel joins the list and its polling (#23).
  const trackRef = useRef(track);
  trackRef.current = track;
  useEffect(
    () =>
      onApprovedJob(
        (approved) =>
          void handOffApprovedJob(approved, {
            add: (job) =>
              setJobs((current) =>
                current.some((j) => j.id === job.id)
                  ? current
                  : [job, ...current],
              ),
            track: (id) => trackRef.current(id),
          }),
      ),
    [],
  );
  async function generate(
    input: GenerateInput,
    approval?: { quoteId: string; idempotency: string },
    composer?: ComposerState,
  ) {
    setError("");
    const { job } = await request<{ job: Job }>("/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": approval?.idempotency ?? crypto.randomUUID(),
        ...(approval ? { "Quote-Id": approval.quoteId } : {}),
        ...(key ? { "x-byo-key": key } : {}),
        // What the studio shows: the server refuses a run whose settings changed.
        ...expectedHeaders(input),
      },
      body: JSON.stringify(input),
    });
    // Tracking a paid run must never depend on browser storage succeeding.
    setJobs((current) => [job, ...current.filter((j) => j.id !== job.id)]);
    selectJob(job.id);
    // Fire and forget: a hung IndexedDB open (Safari) must not hold the paid
    // submit's return. The server has already accepted this run; never resubmit.
    const tabOnly = () =>
      setError(
        "The run started, but its input files could only be kept in this tab. Keep it open to recreate this setup.",
      );
    try {
      void runInputStore
        .save(captureRunInputs(job, input, composer))
        .then((saved) => saved || tabOnly(), tabOnly);
    } catch {
      tabOnly();
    }
    return job;
  }
  return {
    jobs,
    sources,
    error,
    setError,
    needsKey,
    refresh,
    generate,
    track,
    stop,
    selectJob,
    selectedId,
    featuredJob: jobs.find((job) => job.id === selectedId) ?? jobs[0],
  };
}
