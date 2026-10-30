import { useCallback, useEffect, useRef, useState } from "react";
import { hash } from "./export-take";
import {
  audioLabel,
  type AudioSource,
  type RecentAudio,
} from "./audio-history";
import { createRecentAudio, indexedDbAudioBackend } from "./audio-recent-store";

/** Recent tracks, restored from this browser on load (`audio-recent-store.ts`). */
export function useAudioHistory() {
  const store = useRef(createRecentAudio(indexedDbAudioBackend()));
  const [recent, setRecent] = useState<RecentAudio[]>([]);
  const [persisted, setPersisted] = useState(true);
  const publish = useCallback((list: RecentAudio[]) => {
    setRecent([...list]);
    setPersisted(store.current.persisted());
  }, []);
  useEffect(() => {
    let alive = true;
    void store.current.load().then((list) => {
      if (alive) publish(list);
    });
    return () => {
      alive = false;
    };
  }, [publish]);
  const add = useCallback(
    async (blob: Blob, source: AudioSource, label?: string) => {
      const entry: RecentAudio = {
        id: await hash(blob),
        label:
          label ?? audioLabel(blob instanceof File ? blob.name : "", source),
        source,
        bytes: blob.size,
        open: () => blob,
      };
      publish(await store.current.add(entry));
      return entry;
    },
    [publish],
  );
  const forget = useCallback(
    async (id: string) => publish(await store.current.forget(id)),
    [publish],
  );
  return { recent, add, forget, persisted };
}
export type AudioHistory = ReturnType<typeof useAudioHistory>;
