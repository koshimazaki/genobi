import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  EXPORT_RETENTION_MS,
  EXPORT_TAB_TTL_MS,
  sameExportSource,
  exportFormats,
  type ExportRequest,
  type ExportSource,
  type ExportStatus,
} from "../shared/browser-export";
import { ExportArtifacts, exportIdentity } from "./export-artifacts";
import type { ProjectCopies } from "./projects";
import { AppError } from "./errors";
import { bounded } from "./project-bundle";
import { LinkCodes } from "./project-links";

interface Tab {
  id: string;
  owner: string;
  copyId?: string;
  grants: Set<string>;
  source: ExportSource;
  seen: number;
  job?: string;
}
interface Job extends ExportStatus {
  owner: string;
  caller: string;
  digest: string;
  created: number;
}
const terminal = (job: Job) =>
  ["done", "error", "cancelled"].includes(job.state);
const notFound = () =>
  new AppError(
    404,
    "Export or browser connection not found.",
    "export_missing",
  );

/** The mounted browser owns rendering; the server owns dispatch and completed bytes. */
export class BrowserExports {
  private tabs = new Map<string, Tab>();
  private jobs = new Map<string, Job>();
  private links = new LinkCodes();
  readonly artifacts: ExportArtifacts;
  constructor(
    private projects: ProjectCopies,
    private now = Date.now,
  ) {
    this.artifacts = new ExportArtifacts(projects.directory, now);
  }
  async load() {
    await this.artifacts.load();
    for (const saved of this.artifacts.records.values())
      this.jobs.set(saved.id, {
        ...saved,
        state: "done",
        progress: 1,
        created: Date.parse(saved.receipt.createdAt),
      });
  }
  private sweep() {
    for (const [id, tab] of this.tabs)
      if (this.now() - tab.seen > EXPORT_TAB_TTL_MS)
        this.disconnect(
          id,
          tab.owner,
          "The browser stopped responding. Reopen the project and request a new export.",
        );
    for (const [id, job] of this.jobs)
      if (this.now() - job.created > EXPORT_RETENTION_MS) this.jobs.delete(id);
    void this.artifacts.sweep().catch(() => {});
  }
  private ownTab(id: string, owner: string) {
    const tab = this.tabs.get(id);
    if (!tab || tab.owner !== owner) throw notFound();
    return tab;
  }
  private readJob(id: string, caller: string) {
    const job = this.jobs.get(id),
      key = exportIdentity(caller);
    if (!job || (job.owner !== key && job.caller !== key)) throw notFound();
    return job;
  }
  private public(job: Job): ExportStatus {
    return {
      id: job.id,
      request: job.request,
      state: job.state,
      progress: job.progress,
      ...(job.error ? { error: job.error } : {}),
      ...(job.receipt ? { receipt: job.receipt } : {}),
    };
  }
  private fail(job: Job, message: string) {
    if (job.state === "queued" || job.state === "running") {
      job.state = "error";
      job.error = message;
    }
  }
  connect(owner: string, source: ExportSource) {
    this.sweep();
    const project = this.projects
      .list(owner)
      .find((p) => p.id === source.id && p.access === "owner");
    if (source.kind === "director" && !project)
      throw new AppError(
        409,
        "Wait for this project to sync to the local server before connecting export.",
        "export_project_unsynced",
      );
    if (
      this.tabs.size >= 64 ||
      [...this.tabs.values()].filter((t) => t.owner === owner).length >= 8
    )
      throw new AppError(429, "Too many browser export connections.");
    const tab = {
      id: randomUUID(),
      owner,
      copyId: source.kind === "director" ? project?.copyId : undefined,
      grants: new Set<string>(),
      source,
      seen: this.now(),
    };
    this.tabs.set(tab.id, tab);
    return { tabId: tab.id };
  }
  private access(tab: Tab, caller: string) {
    if (tab.owner === caller) return;
    if (tab.copyId) {
      this.projects.read(tab.copyId, caller);
      return;
    }
    if (!tab.grants.has(caller)) throw notFound();
  }
  /** The live Scroll bridge shares this exact tab grant; reads never renew it. */
  scrollTab(tabId: string, caller: string, ownerOnly = false) {
    this.sweep();
    const tab = this.tabs.get(tabId);
    if (!tab || tab.source.kind !== "scrolls") throw notFound();
    if (ownerOnly) this.ownTab(tabId, caller);
    else this.access(tab, caller);
    return tab.source;
  }
  createLink(tabId: string, owner: string, source: ExportSource) {
    this.sweep();
    const tab = this.ownTab(tabId, owner);
    if (tab.source.kind !== "scrolls")
      throw new AppError(
        400,
        "Link the Director project through its project tools.",
      );
    if (!sameExportSource(tab.source, source))
      throw new AppError(
        409,
        "Wait for this Scroll revision to connect before linking.",
      );
    return this.links.create(tab.id);
  }
  link(caller: string, code: string) {
    this.sweep();
    const id = this.links.spend({ code });
    const tab = this.tabs.get(id);
    if (!tab || tab.source.kind !== "scrolls") throw notFound();
    if (tab.grants.size >= 4 && !tab.grants.has(caller))
      throw new AppError(
        429,
        "This Scroll tab already has four linked agents.",
      );
    tab.grants.add(caller);
    return {
      tabId: id,
      source: tab.source,
      formats: exportFormats(tab.source.kind),
    };
  }
  targets(caller: string) {
    this.sweep();
    return [...this.tabs.values()].flatMap((tab) => {
      try {
        this.access(tab, caller);
      } catch {
        return [];
      }
      const active = tab.job && this.jobs.get(tab.job);
      return [
        {
          tabId: tab.id,
          source: tab.source,
          copyId: tab.copyId,
          busy: !!active && !terminal(active),
          formats: exportFormats(tab.source.kind),
        },
      ];
    });
  }
  request(caller: string, request: ExportRequest) {
    this.sweep();
    const identity = exportIdentity(caller),
      digest = exportIdentity(JSON.stringify(request));
    const prior = [...this.jobs.values()].find(
      (j) => j.caller === identity && j.request.requestId === request.requestId,
    );
    if (prior) {
      if (prior.digest !== digest)
        throw new AppError(
          409,
          "That requestId names a different export.",
          "export_request_conflict",
        );
      return this.public(prior);
    }
    const tab = this.tabs.get(request.tabId);
    if (!tab)
      throw new AppError(
        409,
        "The export browser is unavailable. Open the source workspace locally and read targets again.",
        "export_browser_missing",
      );
    this.access(tab, caller);
    if (!sameExportSource(tab.source, request.source))
      throw new AppError(
        409,
        "The open project changed. Read targets and preserve the new revision.",
        "export_revision_conflict",
      );
    const active = tab.job && this.jobs.get(tab.job);
    if (active && !terminal(active))
      throw new AppError(
        409,
        "This browser already has an export in progress.",
        "export_busy",
      );
    if (this.jobs.size >= 256)
      throw new AppError(
        429,
        "Export request history is full. Wait for its one-hour expiry.",
      );
    const job: Job = {
      id: randomUUID(),
      owner: exportIdentity(tab.owner),
      caller: identity,
      digest,
      request,
      state: "queued",
      progress: 0,
      created: this.now(),
    };
    this.jobs.set(job.id, job);
    tab.job = job.id;
    return this.public(job);
  }
  poll(tabId: string, owner: string, source: ExportSource) {
    this.sweep();
    const tab = this.ownTab(tabId, owner);
    if (source.id !== tab.source.id || source.kind !== tab.source.kind)
      throw new AppError(
        409,
        "Reconnect export for the newly opened project.",
        "export_source_changed",
      );
    tab.seen = this.now();
    const job = tab.job ? this.jobs.get(tab.job) : undefined;
    if (job && !sameExportSource(source, job.request.source))
      this.fail(
        job,
        "The source changed while preparing the export. Read the new revision before requesting another.",
      );
    tab.source = source;
    if (job?.state === "queued") job.state = "running";
    return { job: job ? this.public(job) : null };
  }
  update(
    id: string,
    owner: string,
    update:
      | { state: "running"; progress: number }
      | { state: "error"; error: string }
      | { state: "cancelled" },
  ) {
    this.sweep();
    const job = this.readJob(id, owner);
    if (job.owner !== exportIdentity(owner)) throw notFound();
    if (terminal(job) || job.state === "storing") return this.public(job);
    if (update.state === "running")
      job.progress = Math.max(job.progress, Math.min(0.99, update.progress));
    else {
      job.state = update.state;
      if (update.state === "error") job.error = update.error;
    }
    return this.public(job);
  }
  status(id: string, caller: string) {
    this.sweep();
    return this.public(this.readJob(id, caller));
  }
  cancel(id: string, caller: string) {
    this.sweep();
    const job = this.readJob(id, caller);
    // Packaging/rendering is cancellable. Once storage starts, its atomic
    // commit finishes and the caller reads the final receipt or storage error.
    if (job.state === "queued" || job.state === "running")
      job.state = "cancelled";
    return this.public(job);
  }
  disconnect(
    id: string,
    owner: string,
    message = "The browser disconnected before export finished.",
  ) {
    const tab = this.ownTab(id, owner);
    this.tabs.delete(id);
    const job = tab.job ? this.jobs.get(tab.job) : undefined;
    if (job) this.fail(job, message);
    return { disconnected: true };
  }
  async finish(id: string, owner: string, bytes: Buffer) {
    this.sweep();
    const job = this.readJob(id, owner);
    if (job.owner !== exportIdentity(owner)) throw notFound();
    if (job.state === "done") {
      if (
        job.receipt?.sha256 !== createHash("sha256").update(bytes).digest("hex")
      )
        throw new AppError(
          409,
          "Artifact bytes differ from the completed export.",
        );
      return this.public(job);
    }
    if (job.state !== "running")
      throw new AppError(
        409,
        "This export is no longer accepting an artifact.",
        "export_not_running",
      );
    job.state = "storing";
    try {
      const saved = await this.artifacts.save(
        id,
        job.owner,
        job.caller,
        job.request,
        bytes,
      );
      job.receipt = saved.receipt;
      job.created = Date.parse(saved.receipt.createdAt);
      job.progress = 1;
      job.state = "done";
    } catch (error) {
      job.state = "error";
      job.error = bounded(error);
      throw new AppError(422, job.error, "export_artifact_refused");
    }
    return this.public(job);
  }
  async artifact(id: string, caller: string) {
    this.sweep();
    const job = this.readJob(id, caller);
    if (job.state !== "done" || !job.receipt)
      throw new AppError(
        409,
        "Export has no completed artifact.",
        "export_not_complete",
      );
    const bytes = await readFile(this.artifacts.file(id)).catch(() => {
      throw new AppError(
        410,
        "Export artifact is no longer available.",
        "export_expired",
      );
    });
    if (createHash("sha256").update(bytes).digest("hex") !== job.receipt.sha256)
      throw new AppError(
        409,
        "Export artifact changed on disk.",
        "export_artifact_changed",
      );
    return { bytes, receipt: job.receipt };
  }
}
