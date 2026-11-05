import { prepareScrollMedia } from "./scrolls-live-media";
import type { ProjectCopies } from "./projects";
import type { ScrollLiveResult } from "../shared/scrolls/live";
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
  bytes?: Buffer;
}
const missing = () =>
  new AppError(404, "Live Scroll connection or command not found.");
/** Ephemeral commands reuse the export tab's explicit one-use grant and identity. */
export class LiveScrolls {
  private mounted = new Map<string, Mounted>();
  private jobs = new Map<string, Job>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private browsers: BrowserExports,
    private copies: ProjectCopies,
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
        job.bytes = undefined;
      }
    }
  }
  private public(job: Job): LiveScrollStatus {
    const { id, request, state, result, error, media } = job;
    return {
      id,
      request,
      state,
      ...(result ? { result } : {}),
      ...(error ? { error } : {}),
      ...(media ? { media } : {}),
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
    const run = this.queue
      .catch(() => {})
      .then(() => this.prepare(caller, request));
    this.queue = run;
    return run;
  }
  private async prepare(caller: string, request: LiveScrollRequest) {
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
    const media =
      request.command.op === "attach-media"
        ? await prepareScrollMedia(this.copies, caller, request.command)
        : undefined;
    // Ownership, document and selection may change while bytes are read.
    const latest = this.inspect(request.tabId, caller);
    try {
      liveScrollEdit(latest, request);
    } catch (error) {
      throw new AppError(409, (error as Error).message);
    }
    if (
      media &&
      [...this.jobs.values()].reduce(
        (n, j) => n + (j.bytes?.length ?? 0),
        media.bytes.length,
      ) > 150_000_000
    )
      throw new AppError(
        413,
        "Live Scroll media queue is full. Finish existing attachments first.",
      );
    const job: Job = {
      id: randomUUID(),
      request,
      state: "queued",
      owner: exportIdentity(this.mounted.get(request.tabId)!.owner),
      caller: key,
      digest,
      created: this.now(),
      ...(media ? { media: media.input, bytes: media.bytes } : {}),
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
        job.bytes = undefined;
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
    result: { snapshot: ScrollLiveResult } | { error: string },
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
        result.snapshot.document.revision !==
          job.request.context.revision +
            (job.request.command.op === "handoff-director" ? 0 : 1)
      )
        throw new AppError(
          409,
          "The result does not identify the applied Scroll revision.",
        );
      const attachment = result.snapshot.attachment,
        handoff = result.snapshot.handoff;
      if (
        (attachment && job.request.command.op !== "attach-media") ||
        (handoff && job.request.command.op !== "handoff-director")
      )
        throw new AppError(
          409,
          "This result belongs to a different Scroll operation.",
        );
      if (
        job.request.command.op === "attach-media" &&
        (!attachment ||
          attachment.sha256 !== job.media?.sha256 ||
          !result.snapshot.document.assets.some(
            (a) =>
              a.id === attachment.assetId &&
              a.file.sha256 === attachment.sha256,
          ))
      )
        throw new AppError(
          409,
          "The attachment result must identify its checked media asset.",
        );
      if (
        job.request.command.op === "handoff-director" &&
        (!handoff ||
          result.snapshot.director?.id !== handoff.destinationProjectId ||
          result.snapshot.director.revision !== handoff.destinationRevision)
      )
        throw new AppError(
          409,
          "The handoff result must read back the actual Director project.",
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
    job.bytes = undefined;
    return this.public(job);
  }
  media(id: string, owner: string) {
    this.sweep();
    const job = this.job(id, owner);
    if (
      job.owner !== exportIdentity(owner) ||
      job.state !== "running" ||
      !job.bytes ||
      !job.media
    )
      throw missing();
    return { bytes: job.bytes, ...job.media };
  }
}
