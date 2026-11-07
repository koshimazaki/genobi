import { randomUUID } from "node:crypto";
import {
  liveScrollEdit,
  sameScrollContext,
  type LiveScrollRequest,
  type LiveScrollStatus,
  type ScrollSnapshot,
} from "../shared/scrolls/live";
import type { BrowserExports } from "./browser-exports";
import { exportIdentity } from "./export-artifacts";
import { AppError } from "./errors";

const RETENTION = 60 * 60 * 1000;
interface Mounted {
  snapshot: ScrollSnapshot;
  owner: string;
  seen: number;
}
interface Job extends LiveScrollStatus {
  owner: string;
  caller: string;
  created: number;
  digest: string;
}
const missing = () =>
  new AppError(404, "Live Scroll connection or command not found.");
/** Ephemeral commands reuse the export tab's explicit one-use grant and identity. */
export class LiveScrolls {
  private mounted = new Map<string, Mounted>();
  private jobs = new Map<string, Job>();
  constructor(
    private browsers: BrowserExports,
    private now = Date.now,
  ) {}
  private sweep() {
    for (const [id, mounted] of this.mounted) {
      try {
        this.browsers.scrollTab(id, mounted.owner, true);
        if (this.now() - mounted.seen > 15_000) throw missing();
      } catch {
        this.mounted.delete(id);
      }
    }
    for (const [id, job] of this.jobs) {
      if (this.now() - job.created > RETENTION) this.jobs.delete(id);
      else if (
        !this.mounted.has(job.request.tabId) &&
        ["queued", "running"].includes(job.state)
      ) {
        job.error =
          job.state === "running"
            ? "The Scroll disconnected before acknowledgement. The edit may have applied; inspect before another request."
            : "The Scroll disconnected before the command was dispatched.";
        job.state = "error";
      }
    }
  }
  private public(job: Job): LiveScrollStatus {
    const { id, request, state, result, error } = job;
    return {
      id,
      request,
      state,
      ...(result ? { result } : {}),
      ...(error ? { error } : {}),
    };
  }
  private job(id: string, caller: string) {
    const job = this.jobs.get(id),
      key = exportIdentity(caller);
    if (!job || (job.caller !== key && job.owner !== key)) throw missing();
    return job;
  }
  inspect(tabId: string, caller: string) {
    this.sweep();
    this.browsers.scrollTab(tabId, caller);
    const mounted = this.mounted.get(tabId);
    if (!mounted)
      throw new AppError(
        409,
        "Wait for the mounted Scroll to respond, then inspect again.",
      );
    return { tabId, ...mounted.snapshot };
  }
  targets(caller: string) {
    this.sweep();
    return this.browsers
      .targets(caller)
      .filter((t) => t.source.kind === "scrolls")
      .map((t) => ({
        tabId: t.tabId,
        source: t.source,
        responding: this.mounted.has(t.tabId),
      }));
  }
  request(caller: string, request: LiveScrollRequest) {
    this.sweep();
    const key = exportIdentity(caller),
      digest = exportIdentity(JSON.stringify(request));
    const prior = [...this.jobs.values()].find(
      (j) => j.caller === key && j.request.requestId === request.requestId,
    );
    if (prior) {
      if (prior.digest !== digest)
        throw new AppError(
          409,
          "This requestId already names a different Scroll command.",
        );
      return this.public(prior);
    }
    const snapshot = this.inspect(request.tabId, caller);
    try {
      liveScrollEdit(snapshot, request);
    } catch (error) {
      throw new AppError(409, (error as Error).message);
    }
    if (
      [...this.jobs.values()].some(
        (j) =>
          j.request.tabId === request.tabId &&
          ["queued", "running"].includes(j.state),
      )
    )
      throw new AppError(
        409,
        "A Scroll command is already pending. Read its result first.",
      );
    if (this.jobs.size >= 256)
      throw new AppError(
        429,
        "Scroll command history is full; wait for its one-hour expiry.",
      );
    const job: Job = {
      id: randomUUID(),
      request,
      state: "queued",
      owner: exportIdentity(this.mounted.get(request.tabId)!.owner),
      caller: key,
      digest,
      created: this.now(),
    };
    this.jobs.set(job.id, job);
    return this.public(job);
  }
  poll(tabId: string, owner: string, snapshot: ScrollSnapshot) {
    this.sweep();
    const source = this.browsers.scrollTab(tabId, owner, true);
    if (source.id !== snapshot.document.id)
      throw new AppError(409, "Reconnect for this different Scroll document.");
    this.mounted.set(tabId, { owner, snapshot, seen: this.now() });
    const job = [...this.jobs.values()].find(
      (j) =>
        j.request.tabId === tabId && ["queued", "running"].includes(j.state),
    );
    if (job?.state === "queued") {
      if (!sameScrollContext(job.request.context, snapshot.context)) {
        job.state = "error";
        job.error =
          "The Scroll document, revision or selected cell changed before dispatch. Inspect again.";
      } else job.state = "running";
    }
    return { job: job ? this.public(job) : null };
  }
  status(id: string, caller: string) {
    this.sweep();
    return this.public(this.job(id, caller));
  }
  finish(
    id: string,
    owner: string,
    result: { snapshot: ScrollSnapshot } | { error: string },
  ) {
    this.sweep();
    const job = this.job(id, owner);
    if (job.owner !== exportIdentity(owner)) throw missing();
    if (job.state === "done" || job.state === "error") return this.public(job);
    if (job.state !== "running")
      throw new AppError(409, "This Scroll command has not been dispatched.");
    if ("snapshot" in result) {
      if (
        result.snapshot.document.id !== job.request.context.documentId ||
        result.snapshot.document.revision !== job.request.context.revision + 1
      )
        throw new AppError(
          409,
          "The result does not identify the applied Scroll revision.",
        );
      job.result = result.snapshot;
      job.state = "done";
      const mounted = this.mounted.get(job.request.tabId);
      if (
        mounted &&
        sameScrollContext(mounted.snapshot.context, job.request.context)
      )
        mounted.snapshot = result.snapshot;
    } else {
      job.error = result.error;
      job.state = "error";
    }
    return this.public(job);
  }
}
