/**
 * The Director's leave-page guard, and the ways past it.
 *
 * The Director listens for `beforeunload` while it holds undo history
 * (`Director.tsx`). On the local studio each edit also reaches the server's
 * copy of the project (`CopySync`, 600 ms after the edit), so undo history
 * alone is not unsaved work: the guard asks only when a registered copy is
 * not synced (a save waiting, out, failed or refused, or a conflict reload
 * that replaced the person's edits since their last saved revision), or
 * when no copy is registered (the hosted studio keeps no server copy).
 *
 * Leaving on purpose saves first. The wordmark (`leaveHome`), a stale-chunk
 * reload and a server restart (`reloadAfterSaving`), and a development full
 * reload from Vite (`saveBeforeFullReload`) ask every registered flusher to
 * save what is waiting and drop the guard only when each one confirms its
 * copy holds the current revision. Unconfirmed, the browser still asks.
 */
let leaving = false;
/**
 * Why the open project's copy does not hold the current revision, for
 * Regenerate (`saveOpenCopy`): the server refused it (with its reason), the
 * server never answered, a reload replaced the person's edits, the save
 * was still out when time ran out, or no copy is registered on this page.
 */
export type CopyProblem =
  | { kind: "refused"; message: string }
  | { kind: "unreachable" }
  | { kind: "replaced" }
  | { kind: "slow" }
  | { kind: "none" };
/** `flush(allProjects)`: see `saveCopies`. `why`: see `saveOpenCopy`. */
interface Flusher {
  flush: (allProjects: boolean) => Promise<boolean>;
  isSynced: () => boolean;
  why?: () => CopyProblem | undefined;
}
const flushers = new Set<Flusher>();

/**
 * A field that commits on blur (the notes, the Inspector's text fields)
 * holds typed text the store has not seen. Blurring it commits that text, so
 * the revision moves: the guard then asks, and a save pushes it.
 */
function commitFocusedField() {
  if (typeof document === "undefined") return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body) active.blur?.();
}

/**
 * Whether every registered copy holds the current revision now, without
 * saving. False with none registered: nothing on a server holds the work.
 */
export function copiesSynced() {
  const all = [...flushers];
  return all.length > 0 && all.every((f) => f.isSynced());
}

/**
 * The guard itself: silent once a deliberate leave confirmed the save, or
 * while every copy is synced; otherwise the browser asks.
 */
export function guardUnload(event: BeforeUnloadEvent) {
  commitFocusedField();
  if (leaving || copiesSynced()) return;
  event.preventDefault();
  event.returnValue = "";
}

/**
 * Registers a copy's save. `flush` finishes what is waiting and resolves
 * true when the copy holds the current revision; `isSynced` answers the same
 * at once (every project), for `beforeunload`, which cannot wait. Without
 * `isSynced` the copy never reads as synced. Returns its removal.
 */
export function flushBeforeLeaving(
  flush: (allProjects: boolean) => Promise<boolean>,
  isSynced: () => boolean = () => false,
  why?: () => CopyProblem | undefined,
) {
  const entry = { flush, isSynced, why };
  flushers.add(entry);
  return () => void flushers.delete(entry);
}

/** How long the saves may hold the click before the page goes anyway. */
const FLUSH_MS = 2000;

/**
 * Asks every registered copy to save what is waiting; true only when there
 * is at least one and each confirmed its copy holds the current revision
 * within `limit`. The gallery's Generate now and the Director's regenerate
 * (which link the open project's copy to an agent) need only the open
 * project saved; leaving the page (`allProjects`) also needs every other
 * project the person edited and switched away from.
 */
export async function saveCopies(
  limit = FLUSH_MS,
  { allProjects = false }: { allProjects?: boolean } = {},
) {
  commitFocusedField();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const saves = [...flushers].map((f) => f.flush);
  const synced = await Promise.race([
    Promise.all(
      saves.map((flush) => flush(allProjects).catch(() => false)),
    ).then((answers) => answers.every(Boolean)),
    new Promise<false>(
      (resolve) => (timer = setTimeout(resolve, limit, false)),
    ),
  ]);
  clearTimeout(timer);
  return saves.length > 0 && synced;
}

/**
 * `saveCopies` for the open project, answering why when it did not save,
 * so Regenerate tells a refusal (which waiting cannot fix) from a slow save.
 */
export async function saveOpenCopy(
  limit: number,
): Promise<{ saved: true } | { saved: false; problem: CopyProblem }> {
  if (flushers.size === 0) return { saved: false, problem: { kind: "none" } };
  if (await saveCopies(limit)) return { saved: true };
  for (const { why } of flushers) {
    const problem = why?.();
    if (problem) return { saved: false, problem };
  }
  return { saved: false, problem: { kind: "slow" } };
}

/** What a leave waits on: every project saved. */
const saveForLeaving = () => saveCopies(FLUSH_MS, { allProjects: true });

/**
 * Saves what is waiting, drops the guard only when every save confirmed,
 * then goes to `/`. Unconfirmed, the browser's own guard still asks.
 */
export async function leaveHome(
  navigate: (url: string) => void = (url) => window.location.assign(url),
) {
  leaving = await saveForLeaving();
  navigate("/");
}

/**
 * A reload the app asks for (a stale chunk, a restarted local server): save
 * what is waiting, drop the guard only when every save confirmed, then
 * reload. Unconfirmed, the browser's own guard still asks.
 */
export async function reloadAfterSaving(
  reload: () => void = () => location.reload(),
) {
  leaving = await saveForLeaving();
  reload();
}

/** The part of Vite's `import.meta.hot` this module listens on. */
export interface FullReloadChannel {
  on(event: "vite:beforeFullReload", listener: () => Promise<void>): void;
}

/**
 * Development only. Vite 6 awaits its `vite:beforeFullReload` listeners
 * before it reloads the page (`notifyListeners` in its client), so a full
 * reload caused by a changed file saves the copy first. It never drops the
 * guard itself: Vite also sends this for an HTML file that is not this page
 * and then does not reload, so the guard keeps reading `copiesSynced()` at
 * unload time, which a confirmed save makes true.
 */
export function saveBeforeFullReload(hot: FullReloadChannel | undefined) {
  hot?.on("vite:beforeFullReload", async () => {
    await saveForLeaving();
  });
}

/**
 * The wordmark's click: a plain click goes home through `leaveHome`. A
 * modified or middle click opens a new tab as a link does, and this page,
 * guard included, stays as it is.
 */
export function goHome(
  event: Pick<
    MouseEvent,
    | "button"
    | "metaKey"
    | "ctrlKey"
    | "shiftKey"
    | "altKey"
    | "defaultPrevented"
    | "preventDefault"
  >,
  navigate?: (url: string) => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  return leaveHome(navigate);
}
