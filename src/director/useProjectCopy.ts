import { useEffect, useRef, useState } from "react";
import type { Bundle } from "./bundle";
import { studioStore } from "../studio/store";
import { copyAvailable, eventsUrl, type CopyEvent } from "./project-copy";
import { CopySync } from "./project-copy-sync";
import { flushBeforeLeaving } from "./leave-guard";
import { askCopyConflict } from "./copy-conflict";
import { upgradeBundle } from "./upgrade-bundle";

/**
 * Keep the local server's copy of the open project in step with the store
 * (`CopySync` holds the rules) and listen to the copy's stream once it
 * exists, so an agent's Director command shows up live. The hosted studio
 * has no copy, so this does nothing there.
 */
export function useProjectCopy(
  bundle: Bundle | undefined,
  notice: (text: string) => void,
) {
  const [available, setAvailable] = useState(false);
  const [live, setLive] = useState("");
  const say = useRef(notice);
  say.current = notice;
  const sync = useRef<CopySync | null>(null);
  sync.current ??= new CopySync({
    store: studioStore,
    notice: (text) => say.current(text),
    live: setLive,
    conflict: askCopyConflict,
    upgrade: (b) => upgradeBundle(b),
  });
  const report = (e: unknown) =>
    say.current(e instanceof Error ? e.message : String(e));

  useEffect(() => {
    let cancelled = false;
    void copyAvailable().then((ok) => !cancelled && setAvailable(ok));
    return () => {
      cancelled = true;
      sync.current?.stop();
    };
  }, []);
  // A deliberate leave sends the last edit before it drops the guard, and the
  // guard stays silent while the copy is synced (leave-guard.ts).
  useEffect(() => {
    if (!available) return;
    return flushBeforeLeaving(
      async (allProjects) => (await sync.current?.flush(allProjects)) ?? false,
      () => sync.current?.isSynced() ?? false,
      () => sync.current?.whyNotSaved(),
    );
  }, [available]);
  useEffect(() => {
    if (available && bundle) sync.current?.schedule();
  }, [available, bundle]);
  useEffect(
    () =>
      studioStore.subscribe(
        (now, before) =>
          void sync.current?.storeChanged(now, before)?.catch(report),
      ),
    [],
  );

  const id = bundle?.project.id;
  useEffect(() => {
    if (!available || !id || live !== id) return;
    const source = new EventSource(eventsUrl(id));
    const onEvent = (message: MessageEvent<string>) =>
      void sync.current
        ?.event(id, JSON.parse(message.data) as CopyEvent)
        .catch(report);
    source.addEventListener("revision", onEvent as EventListener);
    return () => source.close();
  }, [available, id, live]);
}
