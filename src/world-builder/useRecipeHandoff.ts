import { useEffect, useRef } from "react";
import { studioStore } from "../studio/store";
import { recordWorldRecipe } from "../studio/world-record";
import { noteWorldPreset } from "../agent/world-context";
import { applyRecipe } from "./apply-take";
import { findNamedTake } from "./named-takes";
import { validateRecipe } from "./recipe";
import type { BuilderSession } from "./useBuilderSession";

/** How often the open World Builder asks for an agent's recipe. */
export const HANDOFF_POLL_MS = 2000;

interface Handoff {
  sequence: number;
  state: string;
  recipe: unknown;
  take: string | null;
}
const route = (id: string) =>
  `/api/projects/${encodeURIComponent(id)}/world-recipe`;

/**
 * In the studio, an agent's recipe for the open project
 * (`genobi_world_recipe`, `server/world-recipe-routes.ts`) reaches this tab
 * the way Director commands do: the tab asks, applies it with `configure`
 * (a named take loads its dry sound too), records it as the project's
 * recipe and reports applied, or refused with the reason. A recipe waits
 * while the scene is busy (a capture, playback); one is handled once.
 */
export function useRecipeHandoff(s: BuilderSession, enabled: boolean) {
  const session = useRef(s);
  session.current = s;
  useEffect(() => {
    if (!enabled) return;
    const handled = new Map<string, number>();
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const report = (id: string, body: unknown) =>
      fetch(`${route(id)}/applied`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined);
    async function tick() {
      const id = studioStore.getState().director.bundle?.project.id;
      const s = session.current;
      if (id && s.ready && !s.busy && !s.playing && !s.capturing) {
        // A bare preview or the hosted studio answers with no hand-off.
        const handoff = await fetch(route(id))
          .then((r) => (r.ok ? (r.json() as Promise<Handoff>) : undefined))
          .catch(() => undefined);
        if (
          !stopped &&
          handoff?.state === "waiting" &&
          typeof handoff.sequence === "number" &&
          handled.get(id) !== handoff.sequence
        ) {
          handled.set(id, handoff.sequence);
          try {
            const take = findNamedTake(handoff.take);
            const recipe = await applyRecipe(
              s,
              validateRecipe(handoff.recipe),
              take,
            );
            recordWorldRecipe(recipe);
            noteWorldPreset(take?.name);
            s.setStatus(
              `${take ? take.name : "A recipe"} from your agent is applied. Capture a take when ready.`,
            );
            await report(id, { sequence: handoff.sequence, ok: true });
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : String(error);
            s.setStatus(`Your agent's recipe was not applied: ${reason}`);
            await report(id, {
              sequence: handoff.sequence,
              ok: false,
              error: reason,
            });
          }
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), HANDOFF_POLL_MS);
    }
    timer = setTimeout(() => void tick(), 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled]);
}
