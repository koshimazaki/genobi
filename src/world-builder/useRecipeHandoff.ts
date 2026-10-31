import { useEffect, useRef } from "react";
import { studioStore } from "../studio/store";
import { recordWorldRecipe } from "../studio/world-record";
import { noteWorldPreset } from "../agent/world-context";
import { applyRecipe } from "./apply-take";
import { findNamedTake } from "./named-takes";
import { validateRecipe } from "./recipe";
import type { BuilderSession } from "./useBuilderSession";
import {
  RECIPE_REVISION_REQUIRED,
  sameRecipeScene,
  validRecipeRevision,
} from "../../shared/world-recipe-revision";

/** How often the open World Builder asks for an agent's recipe. */
export const HANDOFF_POLL_MS = 2000;

interface Handoff {
  sequence: number;
  expectedRevision: unknown;
  state: string;
  recipe: unknown;
  take: string | null;
}
interface Receipt {
  sequence: number;
  expectedRevision: unknown;
  ok: boolean;
  error?: string;
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
    const receipts = new Map<string, Receipt>();
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    let pending: AbortController | undefined;
    async function report(id: string, body: Receipt) {
      if (stopped) return;
      receipts.set(id, body);
      const response = await fetch(`${route(id)}/applied`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined);
      if (response?.ok && receipts.get(id) === body) receipts.delete(id);
    }
    async function apply(id: string, handoff: Handoff) {
      const s = session.current;
      const api = s.api.current;
      if (
        !api ||
        !s.ready ||
        s.busy ||
        s.playing ||
        s.capturing ||
        studioStore.getState().director.bundle?.project.id !== id
      )
        return;
      const expectedRevision = handoff.expectedRevision;
      // The owner's other tabs must not consume a handoff for this mounted scene.
      if (
        validRecipeRevision(expectedRevision) &&
        !sameRecipeScene(expectedRevision, api.getRecipeRevision())
      )
        return;
      handled.set(id, handoff.sequence);
      const controller = new AbortController();
      pending = controller;
      const unsubscribe = studioStore.subscribe((state) => {
        if (state.director.bundle?.project.id !== id)
          controller.abort(
            new Error(
              "The open project changed before the recipe could apply.",
            ),
          );
      });
      try {
        if (!validRecipeRevision(expectedRevision))
          throw new Error(RECIPE_REVISION_REQUIRED);
        const take = findNamedTake(handoff.take);
        const recipe = await applyRecipe(
          s,
          validateRecipe(handoff.recipe),
          take,
          { expectedRevision, signal: controller.signal },
        );
        // Navigation after commit must not save the old handoff in a new project.
        if (
          !stopped &&
          studioStore.getState().director.bundle?.project.id === id
        ) {
          recordWorldRecipe(recipe);
          noteWorldPreset(take?.name);
          s.setStatus(
            `${take ? take.name : "A recipe"} from your agent is applied. Capture a take when ready.`,
          );
        }
        await report(id, {
          sequence: handoff.sequence,
          expectedRevision,
          ok: true,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!stopped)
          s.setStatus(`Your agent's recipe was not applied: ${reason}`);
        await report(id, {
          sequence: handoff.sequence,
          expectedRevision,
          ok: false,
          error: reason,
        });
      } finally {
        unsubscribe();
        if (pending === controller) pending = undefined;
      }
    }
    async function tick() {
      const id = studioStore.getState().director.bundle?.project.id;
      const s = session.current;
      if (
        id &&
        s.ready &&
        (receipts.has(id) || (!s.busy && !s.playing && !s.capturing))
      ) {
        // The flag keeps old pollers from receiving a recipe they apply unguarded.
        const handoff = await fetch(`${route(id)}?guarded=1`)
          .then((r) => (r.ok ? (r.json() as Promise<Handoff>) : undefined))
          .catch(() => undefined);
        if (
          !stopped &&
          handoff &&
          studioStore.getState().director.bundle?.project.id === id
        ) {
          const receipt = receipts.get(id);
          if (
            receipt &&
            (handoff.state !== "waiting" ||
              handoff.sequence !== receipt.sequence ||
              handoff.expectedRevision !== receipt.expectedRevision)
          )
            receipts.delete(id);
          if (
            handoff.state === "waiting" &&
            typeof handoff.sequence === "number"
          ) {
            // A failed/lost acknowledgement must never replay the scene edit.
            const waiting = receipts.get(id);
            if (waiting) await report(id, waiting);
            else if (handled.get(id) !== handoff.sequence)
              await apply(id, handoff);
          }
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), HANDOFF_POLL_MS);
    }
    timer = setTimeout(() => void tick(), 0);
    return () => {
      stopped = true;
      pending?.abort(
        new Error("World Builder was closed before the recipe could apply."),
      );
      clearTimeout(timer);
    };
  }, [enabled]);
}
