import { useEffect, useRef, useSyncExternalStore } from "react";
import type { GenerateInput, Job } from "../../shared/types";
import type { ComposerState } from "../useComposer";
export interface ScrollsBridge {
  key: string;
  jobs: Job[];
  generate: (
    input: GenerateInput,
    approval?: { quoteId: string; idempotency: string },
  ) => Promise<Job>;
  update: (patch: Partial<ComposerState>) => void;
}
let current: ScrollsBridge | undefined;
const listeners = new Set<() => void>();
export function useScrollsBridge(
  key: string,
  generate: ScrollsBridge["generate"],
  jobs: Job[],
  update: ScrollsBridge["update"],
) {
  const latest = useRef({ key, generate, jobs, update });
  latest.current = { key, generate, jobs, update };
  useEffect(() => {
    current = {
      key,
      jobs,
      generate: (...args) => latest.current.generate(...args),
      update: (patch) => latest.current.update(patch),
    };
    listeners.forEach((fn) => fn());
  }, [key, jobs]);
  useEffect(
    () => () => {
      current = undefined;
      listeners.forEach((fn) => fn());
    },
    [],
  );
}
export function useGenerationBridge() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => undefined,
  );
}
