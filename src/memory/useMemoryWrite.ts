import { useRef } from "react";
import { canonical } from "../../shared/memory/state";
import { memoryRequest } from "./client";

/** A second click after an uncertain response reuses the same event and revisions. */
export function useMemoryWrite() {
  const pending = useRef(
    new Map<string, { signature: string; input: Record<string, unknown> }>(),
  );
  return async (
    route: string,
    body: Record<string, unknown>,
    nestedId?: "preference",
  ) => {
    const {
      baseRevision: _base,
      memoryRevision: _memory,
      revision: _profile,
      ...intent
    } = body;
    const signature = canonical(intent);
    let held = pending.current.get(route);
    if (!held || held.signature !== signature) {
      held = {
        signature,
        input: nestedId
          ? {
              ...body,
              [nestedId]: {
                ...(body[nestedId] as object),
                id: crypto.randomUUID(),
              },
            }
          : { id: crypto.randomUUID(), ...body },
      };
      pending.current.set(route, held);
    }
    try {
      const result = await memoryRequest(route, held.input);
      pending.current.delete(route);
      return result;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500)
        pending.current.delete(route);
      throw error;
    }
  };
}
