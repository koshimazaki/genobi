import { useState } from "react";

export const HIDDEN_JOBS_KEY = "flux-studio-lite-hidden-jobs";

export function parseHiddenJobIds(value: string | null): Set<string> {
  if (!value) return new Set();
  try {
    const ids: unknown = JSON.parse(value);
    return new Set(
      Array.isArray(ids)
        ? ids.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          )
        : [],
    );
  } catch {
    return new Set();
  }
}

export function useHiddenJobs() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    if (typeof localStorage === "undefined") return new Set();
    try {
      return parseHiddenJobIds(localStorage.getItem(HIDDEN_JOBS_KEY));
    } catch {
      return new Set();
    }
  });
  function update(change: (current: Set<string>) => Set<string>) {
    setHiddenIds((current) => {
      const next = change(current);
      try {
        localStorage.setItem(HIDDEN_JOBS_KEY, JSON.stringify([...next]));
      } catch {
        // Hiding remains useful for this page when storage is unavailable.
      }
      return next;
    });
  }
  return {
    hiddenIds,
    hide: (id: string) => update((current) => new Set([...current, id])),
    restoreAll: () => update(() => new Set()),
  };
}
