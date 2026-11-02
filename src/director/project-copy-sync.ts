import type { StudioState } from "../studio/store";
import type { Bundle } from "./bundle";
import type { CopyProblem } from "./leave-guard";
import {
  applyEvent,
  pushCopy,
  readCopy,
  readManifest,
  type CopyEvent,
  type CopyManifest,
} from "./project-copy";
import type { SyncOptions, Synced } from "./project-copy-sync-options";

/**
 * The rules that keep the server's copy in step with the store, which stays
 * the owner. Three facts per project keep answers that arrive out of order
 * from undoing newer work:
 *
 * - `known`: the newest server revision seen anywhere (a push answer, an
 *   event, a conflict, a read). It only grows. A reload whose copy is older
 *   is discarded and read again.
 * - `synced`: which server revision the store's content matches, and at
 *   which local revision. Pushes build on it; it changes only when a push is
 *   accepted, an event is applied or a reload commits.
 * - one reload at a time: a reload asked for while one runs replaces any
 *   waiting request, and a push waits until reloads are done. A push answer
 *   that arrives after a reload or event changed `synced` does not move it.
 */
export class CopySync {
  uploaded = new Set<string>();
  pushing = false;
  private known = new Map<string, number>();
  private synced = new Map<string, Synced>();
  /** Bumped whenever `synced` changes, so a late push answer can tell. */
  private generation = 0;
  private reloading: Promise<void> | undefined;
  private queued: { id: string; why: string } | undefined;
  /** A reload waiting for a render or file operation to end. */
  private staleId = "";
  /** A revision the server refused for another reason; not retried. */
  private failed = -1;
  /** Why `failed` was not saved: the server's refusal, or no answer. */
  private failure: CopyProblem = { kind: "unreachable" };
  /**
   * Reloads that replaced the person's own edits, and that count when one of
   * their revisions was last accepted: while they differ, the replaced
   * version is only in undo history, which leaving the page throws away.
   */
  private overwritten = 0;
  private keptAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Projects whose copy this page has asked about (`openCopy`). */
  private opened = new Set<string>();
  /** The local revision each project had when its copy was first asked for. */
  private openedAt = new Map<string, number>();
  /** A manifest `openCopy` just read, for the reload to use once. */
  private manifests = new Map<string, CopyManifest>();
  /** What the last reload's upgrade changed, for the opening notice. */
  private upgraded = "";
  /** The bundle an upgrade committed: the studio's edit, not the person's. */
  private automatic: Bundle | undefined;
  constructor(private options: SyncOptions) {}

  /** The server revision the store's content matches, if any. */
  serverRevision(id: string) {
    return this.synced.get(id)?.server;
  }

  private get state() {
    return this.options.store.getState();
  }
  private busy() {
    const { rendering, workingFile } = this.state.operations;
    return rendering || workingFile;
  }
  private current() {
    return this.state.director.bundle;
  }
  private see(id: string, revision: number | null | undefined) {
    if (revision && revision > (this.known.get(id) ?? 0))
      this.known.set(id, revision);
  }
  private settle(id: string, server: number) {
    const local = this.current()!.project.revision;
    this.synced.set(id, { server, local });
    this.generation++;
  }

  /**
   * Replace the store's project with the server's copy of it. Reloads run
   * one at a time; a newer request replaces a waiting one.
   */
  reload(id: string, why: string): Promise<void> {
    this.queued = { id, why: why || this.queued?.why || "" };
    this.reloading ??= this.drain().finally(() => {
      this.reloading = undefined;
      // Still behind after a full round of reads: keep the waiting request
      // and start another round, so a studio with no edits catches up.
      const waiting = this.queued;
      if (waiting) {
        this.queued = undefined;
        setTimeout(() => void this.reload(waiting.id, waiting.why), 0);
        return;
      }
      // A push skipped while this ran (even one for a project the person
      // opened meanwhile) goes now.
      this.followUp();
    });
    return this.reloading;
  }
  private async drain() {
    // Bounded: the server's revisions only grow, so a read catches up.
    let retried = false;
    for (let reads = 0; this.queued && reads < 8; reads++) {
      const { id, why } = this.queued;
      this.queued = undefined;
      try {
        await this.load(id, why);
      } catch (e) {
        // A read can fail part way (another window removed a file between
        // the manifest and its download). A newer queued reload still runs;
        // with none queued, read once more before saying so.
        if (this.queued) continue;
        if (!retried) {
          retried = true;
          this.queued = { id, why };
          continue;
        }
        this.options.notice(
          `Project copy not read: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }
  private async load(id: string, why: string) {
    // Used by this read only; a later one reads the manifest afresh.
    const manifest = this.manifests.get(id);
    this.manifests.delete(id);
    if (this.busy()) {
      this.staleId = id;
      return;
    }
    const copy = await readCopy(
      id,
      this.current(),
      this.options.fetcher,
      manifest,
    );
    const revision = copy.project.revision;
    // The person may have opened another project while the copy was read:
    // drop it; their next push of that project meets the conflict.
    if (this.current()?.project.id !== id) return;
    // A render or file operation may have started meanwhile; a new bundle
    // would stop it, so the reload waits for it to end.
    if (this.busy()) {
      this.staleId = id;
      return;
    }
    // Superseded while it was read: read again rather than go back.
    if (revision < (this.known.get(id) ?? 0)) {
      this.queued ??= { id, why };
      return;
    }
    this.see(id, revision);
    const synced = this.synced.get(id);
    if (!synced || revision > synced.server) {
      // Edits the server never got are replaced: say so even when the
      // reload came from another window's push rather than a conflict.
      // Before the first sync: an edit since the copy was first asked for.
      const since = synced?.local ?? this.openedAt.get(id);
      // An upgrade alone is not the person's; the reload upgrades again.
      const unpushed =
        since !== undefined &&
        this.current()!.project.revision !== since &&
        this.current() !== this.automatic;
      const reason =
        why ||
        (!unpushed
          ? ""
          : synced
            ? "Another window changed this project"
            : "This project already had a saved copy");
      // The person's version now lives only in undo history (flush).
      // For an explicitly chosen draft, offer a real recovery decision instead
      // of a dismiss-only error; never replace the saved copy without consent.
      const mine = this.current()!;
      const savedChoice =
        why === "This project already had a saved copy" &&
        !!this.options.conflict;
      if (unpushed || why) this.overwritten++;
      this.state.actions.commit(copy);
      this.settle(id, revision);
      this.openedAt.delete(id);
      if (savedChoice) this.offerMine(id, mine, "saved-copy");
      else if (reason)
        this.options.notice(
          `${reason}; reloaded revision ${revision} from the project copy. Undo brings back your version.`,
        );
      await this.upgrade();
    }
    this.options.live(id);
  }

  /** An older studio's copy, upgraded as an undoable edit the push saves. */
  private async upgrade() {
    const opened = this.current();
    const up = opened && (await this.options.upgrade?.(opened));
    if (!up || this.current() !== opened) return;
    this.state.actions.commit(up.bundle, opened);
    this.automatic = this.current();
    this.upgraded = up.note;
    this.options.notice(up.note);
  }

  schedule(delay = this.options.debounce ?? 600) {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () =>
        void this.push().catch((e) =>
          this.options.notice(
            `Project copy not updated: ${e instanceof Error ? e.message : e}`,
          ),
        ),
      delay,
    );
  }
  /** Schedule a push if the store holds changes the server has not. */
  private followUp() {
    const after = this.current();
    if (
      after &&
      after.project.revision !== this.failed &&
      this.synced.get(after.project.id)?.local !== after.project.revision
    )
      this.schedule();
  }
  stop() {
    clearTimeout(this.timer);
  }
  /**
   * Saves what is waiting now (leave-guard.ts): waits for a push or reload
   * already out, pushes again while the revision moved on, and answers
   * whether the server's copy holds the store's current revision. A revision
   * the server refused is not retried here, so it answers false, and so does
   * a copy that holds the current revision only because a reload replaced
   * the person's edits (a conflict, or another writer such as the linked
   * agent): their version is then in undo history alone. `allProjects`
   * (leaving the page) also needs every other project the person edited
   * and switched away from saved; linking the open copy to an agent does not.
   */
  async flush(allProjects = false): Promise<boolean> {
    this.stop();
    const kept = () => this.kept(allProjects);
    for (let round = 0; round < 4; round++) {
      while (this.pushing || this.reloading)
        await (this.reloading?.catch(() => {}) ??
          new Promise((resolve) => setTimeout(resolve, 20)));
      if (this.holdsCurrent()) return kept();
      if (this.current()?.project.revision === this.failed) return false;
      await this.push().catch(() => {});
    }
    return kept();
  }
  /**
   * What `flush` would answer, without saving, for `beforeunload` (which
   * cannot wait): nothing out or waiting, the copy holds the current
   * revision, and no reload replaced the person's edits since their last
   * saved revision. A push waiting on its 600 ms timer, a refused revision
   * and a reload held for a render all read as not synced.
   */
  isSynced() {
    return !this.pushing && !this.reloading && !this.staleId && this.kept(true);
  }
  /**
   * The copy holds the current revision and no reload replaced the person's
   * edits since; with `allProjects`, every other project they edited and
   * switched away from was saved at the revision they left it too (only the
   * open one is pushed).
   */
  private kept(allProjects: boolean) {
    const open = this.current()?.project.id;
    return (
      this.holdsCurrent() &&
      this.keptAt === this.overwritten &&
      (!allProjects ||
        Object.values(this.state.director.drafts).every(
          ({ bundle, history }) =>
            bundle.project.id === open ||
            !history.length ||
            this.synced.get(bundle.project.id)?.local ===
              bundle.project.revision,
        ))
    );
  }
  /**
   * Why `flush` would answer false for the open project, when that is
   * already settled: the current revision was refused or never answered,
   * or a reload replaced the person's edits. Undefined while a save may
   * still land (Regenerate then reports it as slow).
   */
  whyNotSaved(): CopyProblem | undefined {
    if (this.current()?.project.revision === this.failed) return this.failure;
    if (this.holdsCurrent() && this.keptAt !== this.overwritten)
      return { kind: "replaced" };
  }
  /** The server's copy holds the store's current revision (or none is open). */
  holdsCurrent() {
    const current = this.current();
    return (
      !current ||
      this.synced.get(current.project.id)?.local === current.project.revision
    );
  }

  async push() {
    const current = this.current();
    if (!current || this.pushing || this.reloading) return;
    const id = current.project.id;
    // A conflict reload waits for a render or file operation: a push now
    // would only meet the same stale base. storeChanged resumes both.
    if (id === this.staleId) return;
    const revision = current.project.revision;
    const synced = this.synced.get(id);
    if (synced?.local === revision || this.failed === revision) return;
    if (!synced && !this.opened.has(id) && (await this.openCopy(id))) return;
    this.pushing = true;
    const generation = this.generation;
    try {
      const result = await pushCopy(
        current,
        synced?.server ?? null,
        this.uploaded,
        this.options.fetcher,
      );
      this.see(id, result.revision);
      if (result.ok) {
        // Only if nothing else changed what the store matches meanwhile.
        if (generation === this.generation) {
          this.synced.set(id, { server: result.revision, local: revision });
          this.generation++;
          // The person's own revision is saved: nothing is lost to undo.
          this.keptAt = this.overwritten;
        }
        this.options.live(id);
      } else {
        this.pushing = false;
        const replaced = this.overwritten;
        // The person's latest version, edits made during the push included;
        // an upgrade alone is the studio's, so nothing of theirs is lost.
        const mine = this.current() ?? current;
        const theirs = mine !== this.automatic;
        await this.reload(id, theirs ? "The project copy moved on" : "");
        if (this.overwritten > replaced && mine.project.id === id)
          this.offerMine(id, mine);
      }
    } catch (e) {
      this.options.notice(
        `Project copy not updated: ${e instanceof Error ? e.message : e}`,
      );
      // Not retried until the next edit, which still builds on the last
      // revision the server accepted. A fetch that never got an answer
      // throws a TypeError; anything else is the server's (or the
      // bundle's) definite no, kept with its reason for Regenerate.
      this.failed = revision;
      this.failure =
        e instanceof TypeError
          ? { kind: "unreachable" }
          : {
              kind: "refused",
              message: e instanceof Error ? e.message : `${e}`,
            };
    } finally {
      this.pushing = false;
    }
    // Events that arrived while the push was out were skipped. If one named
    // a newer revision (another window of this project pushed on top of
    // ours), load it now rather than keep building on our own.
    const now = this.synced.get(id);
    if (now && (this.known.get(id) ?? 0) > now.server) {
      const unpushed = this.current()?.project.revision !== now.local;
      await this.reload(
        id,
        unpushed ? "Another window changed this project" : "",
      );
    }
    this.followUp();
  }

  /**
   * After a conflict reload: the person may put their refused version back,
   * replacing the agent's changes, but only once they say so. Their answer
   * builds on the revision they were shown; a newer one asks again.
   */
  private offerMine(
    id: string,
    mine: Bundle,
    kind: "agent" | "saved-copy" = "agent",
  ) {
    const revision = this.synced.get(id)?.server;
    if (!this.options.conflict || revision === undefined) return;
    const overwrittenAt = this.overwritten;
    this.options.conflict({
      kind,
      projectId: id,
      revision,
      keepTheirs: () => {
        // Only acknowledge the specific revision the person reviewed, and
        // only when no earlier unacknowledged replacement would be hidden.
        if (
          this.current()?.project.id !== id ||
          this.synced.get(id)?.server !== revision ||
          this.synced.get(id)?.local !== this.current()?.project.revision
        )
          return;
        if (
          this.overwritten === overwrittenAt &&
          this.keptAt === overwrittenAt - 1
        )
          this.keptAt = overwrittenAt;
      },
      keepMine: () => {
        if (this.current()?.project.id !== id) return;
        if (this.synced.get(id)?.server !== revision)
          return this.offerMine(id, mine, kind);
        // Put the earlier draft on top of the accepted server revision;
        // a concurrent agent write still receives the normal 409 guard.
        this.state.actions.commit(mine);
        this.schedule(0);
      },
    });
  }

  /**
   * A page's first push of a project asks whether the server already holds
   * a copy (a reload, another window, an earlier visit). If it does, the
   * page opens that copy rather than pushing over it, which the server
   * refuses with 409 `revision_conflict`. A page that only loaded the
   * project says it opened the saved copy; one with edits of its own says
   * the copy replaced them and Undo brings them back, as a conflict does.
   * Answers whether the copy was opened (no push needed).
   */
  private async openCopy(id: string) {
    this.opened.add(id);
    this.upgraded = "";
    const opening = this.current()!;
    // Recorded before the read: an edit made while the copy downloads
    // changes the revision, and load() then counts it as replaced.
    this.openedAt.set(id, opening.project.revision);
    this.pushing = true;
    let manifest: CopyManifest | null;
    try {
      manifest = await readManifest(id, this.options.fetcher);
    } catch {
      // Unknown: push as before; a conflict still reloads in place.
      this.openedAt.delete(id);
      return false;
    } finally {
      this.pushing = false;
    }
    if (!manifest) {
      this.openedAt.delete(id);
      return false;
    }
    // Only loaded: the bundle `initialize` set, untouched. A template the
    // gallery committed with nothing open is the person's choice, not this.
    const loadedOnly = opening === this.state.director.loaded;
    const replaced = this.overwritten;
    this.see(id, manifest.project.revision);
    this.manifests.set(id, manifest);
    await this.reload(
      id,
      loadedOnly ? "" : "This project already had a saved copy",
    );
    const server = this.synced.get(id)?.server;
    if (loadedOnly && server !== undefined && this.overwritten === replaced)
      this.options.notice(
        `Opened this project's saved copy (revision ${server}).${this.upgraded && ` ${this.upgraded}`}`,
      );
    return true;
  }

  /** One event from the stream of project `id`. */
  async event(id: string, event: CopyEvent) {
    if (event.projectId !== id) return;
    this.see(id, event.revision);
    const local = this.current();
    const synced = this.synced.get(id);
    if (event.source === "studio" || event.source === "snapshot") {
      // Our own push, or a revision the store already matches.
      if (this.pushing || (synced && event.revision <= synced.server)) return;
      return this.reload(id, "");
    }
    // Apply in place only when the store holds exactly the command's base.
    const ready =
      local &&
      synced &&
      !this.pushing &&
      !this.reloading &&
      !this.busy() &&
      synced.server === event.baseRevision &&
      synced.local === local.project.revision;
    const next = ready
      ? applyEvent(
          {
            ...local,
            project: { ...local.project, revision: synced.server },
          },
          event,
        )
      : undefined;
    if (!next) return this.reload(id, "An agent changed this project");
    this.state.actions.commit(next);
    this.settle(id, event.revision);
  }

  /** Run a reload that waited for a render or file operation to end. */
  storeChanged(now: StudioState, before: StudioState) {
    const idle = !now.operations.rendering && !now.operations.workingFile;
    const wasBusy =
      before.operations.rendering || before.operations.workingFile;
    const id = this.staleId;
    if (!id || !idle || !wasBusy) return;
    this.staleId = "";
    if (now.director.bundle?.project.id === id)
      return this.reload(id, "An agent changed this project while it was busy");
  }
}
