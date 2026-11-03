import { useEffect, useState } from "react";
import type { TesterStatus } from "../shared/tester";

let offered: Promise<boolean> | undefined;

/**
 * Whether the hosted Worker offers tester access: `/api/health` answers
 * `testerAccess: true` only once the operator has set its secrets. Read once
 * per page; a failed read offers nothing.
 */
export function readTesterAccess(): Promise<boolean> {
  offered ??= fetch("/api/health", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return false;
      const health = (await response.json()) as Record<string, unknown>;
      return health?.testerAccess === true;
    })
    .catch(() => false);
  return offered;
}

export function useTesterAccess() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let live = true;
    void readTesterAccess().then((value) => live && setAvailable(value));
    return () => {
      live = false;
    };
  }, []);
  return available;
}

async function answer<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
  };
  if (!response.ok)
    throw new Error(
      typeof body.error === "string" ? body.error : "Access code not accepted.",
    );
  return body as T;
}

/**
 * Sends the code once and forgets it: the caller keeps only the returned
 * token, in page memory, as it keeps a visitor key.
 */
export async function unlockTester(code: string) {
  return answer<TesterStatus & { token: string }>(
    await fetch("/api/tester/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

export async function readTesterStatus(token: string, signal?: AbortSignal) {
  return answer<TesterStatus>(
    await fetch("/api/tester/status", {
      headers: { "x-byo-key": token },
      cache: "no-store",
      signal,
    }),
  );
}
