import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { isTerminal, type Job } from "../shared/types";
import { jobProgressLine } from "../shared/progress-line";

/**
 * What in the studio is working right now, each with the line it would show.
 * An entry belongs to whoever polls the work, not to whatever draws it: a job
 * stays listed while any owner still holds it running, so hiding a card, or
 * two views drawing the same job, cannot clear a generation that is running.
 * The wordmark reads whether anything is; the Genobi deck reads the lines.
 */
export interface Activity {
  id: string;
  /** The terminal line: `GENERATING KLEIN IMAGE  73% ⣿⣿⣀⣀`. */
  line: string;
}

/** By entry id, each owner's latest line; insertion order is display order. */
const owned = new Map<string, Map<string, string>>();
let working: Activity[] = [];
const listeners = new Set<() => void>();

function changed() {
  const next = [...owned].map(([id, owners]) => ({
    id,
    line: [...owners.values()].at(-1)!,
  }));
  const same =
    next.length === working.length &&
    next.every((a, i) => a.id === working[i].id && a.line === working[i].line);
  if (same) return;
  working = next;
  listeners.forEach((listener) => listener());
}

/**
 * Sets everything `owner` holds: one line per entry id. Entries the owner no
 * longer names lose it, and an entry with no owner left is gone.
 */
export function publishActivity(owner: string, lines: Map<string, string>) {
  for (const [id, owners] of owned)
    if (!lines.has(id) && owners.delete(owner) && !owners.size)
      owned.delete(id);
  for (const [id, line] of lines) {
    const owners = owned.get(id) ?? new Map<string, string>();
    owners.set(owner, line);
    owned.set(id, owners);
  }
  changed();
}

/** One entry owned by itself, or cleared when `line` is undefined. */
export const setActivity = (id: string, line: string | undefined) =>
  publishActivity(
    `self:${id}`,
    line === undefined ? new Map() : new Map([[id, line]]),
  );

/** `setActivity` with a plain on or off, for workers with no line of their own. */
export const setBusy = (id: string, on: boolean, line = "WORKING") =>
  setActivity(id, on ? line : undefined);

/** Holds `id` working with `line` while `on`, released on unmount. */
export function useMarkBusy(
  id: string | undefined,
  on: boolean,
  line = "WORKING",
) {
  const owner = useId();
  useEffect(() => {
    publishActivity(owner, id && on ? new Map([[id, line]]) : new Map());
  }, [owner, id, on, line]);
  useEffect(() => () => publishActivity(owner, new Map()), [owner]);
}

/** A poller's running jobs as entry lines at `now`. */
export function jobActivity(jobs: Job[], now: number): Map<string, string> {
  return new Map(
    jobs
      .filter((job) => !isTerminal(job.status))
      .map((job) => [`job-${job.id}`, jobProgressLine(job, now)]),
  );
}

/**
 * Holds every running job of a poller, each with its progress line, the
 * elapsed seconds kept current. Call it where the jobs are polled (the
 * studio's own poller lives for the whole session), not where they are drawn.
 */
export function useJobActivity(jobs: Job[]) {
  const owner = useId();
  const [now, setNow] = useState(() => Date.now());
  const running = jobs.some((job) => !isTerminal(job.status));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    publishActivity(owner, jobActivity(jobs, now));
  }, [owner, jobs, now]);
  useEffect(() => () => publishActivity(owner, new Map()), [owner]);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Everything working now, oldest first. */
export const activityNow = () => working;

/** Whether anything is marked busy right now. */
export const busyNow = () => working.length > 0;

/** `activityNow`, kept current; the server render is idle, so hydration matches. */
export function useActivity(): Activity[] {
  return useSyncExternalStore(subscribe, activityNow, () => EMPTY);
}
const EMPTY: Activity[] = [];

/** `busyNow`, kept current; the server render is never busy. */
export function useBusy(): boolean {
  return useSyncExternalStore(subscribe, busyNow, () => false);
}
