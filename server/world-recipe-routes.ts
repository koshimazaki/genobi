// The World Builder recipe hand-off, mounted at `/api/projects` beside the
// copy routes: an agent linked to a project (or its owner) leaves one recipe
// for the person's open World Builder, which polls, applies it with
// `configure` and says so. Held in memory per project copy, latest only; a
// restart forgets it. Local only; the hosted Worker has no project copy.
import express from "express";
import type { RateBucket } from "../shared/limits";
import { validateRecipe, type Recipe } from "../src/world-builder/recipe";
import { namedTakeRecipe } from "../src/world-builder/named-takes";
import { AppError } from "./errors";
import { GENOBI_CLIENT_HEADER } from "../shared/agent-session-events";
import type { ProjectCopies } from "./projects";
import {
  RECIPE_REVISION_REQUIRED,
  validRecipeRevision,
} from "../shared/world-recipe-revision";

export interface RecipeHandoff {
  /** Counts up per copy; 0 before anything was sent. */
  sequence: number;
  /** Live mounted-scene token; independent of the durable project revision. */
  expectedRevision: string | null;
  state: "none" | "waiting" | "applied" | "refused";
  recipe: Recipe | null;
  /** The named take it came from (`named-takes.ts`), or null. */
  take: string | null;
  /**
   * Who sent it: `agent` for an agent session, or a session linked to the
   * project that is not its owner (an MCP client), `cli` for the Genobi
   * CLI, `person` for the owner's own studio.
   */
  from: "agent" | "cli" | "person" | null;
  sentAt: string | null;
  appliedAt: string | null;
  /** Why the World Builder refused it, in its own words. */
  error: string | null;
}

const none: RecipeHandoff = {
  sequence: 0,
  expectedRevision: null,
  state: "none",
  recipe: null,
  take: null,
  from: null,
  sentAt: null,
  appliedAt: null,
  error: null,
};
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const clean = (text: string) =>
  text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, 300);

export function worldRecipeRouter(
  copies: ProjectCopies,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  const handoffs = new Map<string, RecipeHandoff>();
  const session = (response: express.Response) =>
    response.locals.sessionId as string;
  /** The copy's handle, if this session owns it or is linked to it. */
  const copyOf = (request: express.Request, response: express.Response) =>
    copies.read(String(request.params.id), session(response)).copyId;
  const owns = (copy: string, response: express.Response) =>
    copies
      .list(session(response))
      .some((c) => c.copyId === copy && c.access === "owner");
  /** The sender, from the request's own marks; a linked session is never the person. */
  const sender = (
    request: express.Request,
    response: express.Response,
    copy: string,
  ): RecipeHandoff["from"] =>
    response.locals.agent
      ? "agent"
      : request.get(GENOBI_CLIENT_HEADER) === "cli"
        ? "cli"
        : owns(copy, response)
          ? "person"
          : "agent";

  router.get("/:id/world-recipe", (request, response) => {
    limit("history", session(response));
    const handoff = handoffs.get(copyOf(request, response)) ?? none;
    // Older tabs apply every waiting payload without a precondition. Do not
    // deliver one until the poller explicitly supports the revision guard.
    if (handoff.state === "waiting" && request.query.guarded !== "1")
      throw new AppError(
        428,
        "Refresh World Builder and update the Genobi plugin. Read guarded handoffs with ?guarded=1 and enforce expectedRevision before applying.",
        "recipe_client_update_required",
      );
    response.json(handoff);
  });
  router.post(
    "/:id/world-recipe",
    express.json({ limit: "80kb" }),
    (request, response) => {
      limit("edit", session(response));
      const copy = copyOf(request, response);
      const body: unknown = request.body;
      if (
        !plain(body) ||
        Object.keys(body).some(
          (k) => !["recipe", "take", "expectedRevision"].includes(k),
        ) ||
        (body.recipe === undefined) === (body.take === undefined)
      )
        throw new AppError(
          400,
          "Send a recipe, or a take by its id, not both.",
          "invalid_recipe",
        );
      if (!validRecipeRevision(body.expectedRevision))
        throw new AppError(
          428,
          RECIPE_REVISION_REQUIRED,
          "recipe_revision_required",
        );
      let recipe: Recipe;
      try {
        recipe =
          body.take !== undefined
            ? namedTakeRecipe(body.take)
            : validateRecipe(body.recipe);
      } catch (error) {
        throw new AppError(400, (error as Error).message, "invalid_recipe");
      }
      const next: RecipeHandoff = {
        sequence: (handoffs.get(copy)?.sequence ?? 0) + 1,
        expectedRevision: body.expectedRevision,
        state: "waiting",
        recipe,
        take: typeof body.take === "string" ? body.take : null,
        from: sender(request, response, copy),
        sentAt: new Date().toISOString(),
        appliedAt: null,
        error: null,
      };
      handoffs.set(copy, next);
      response.status(202).json({
        ...next,
        recipe: undefined,
        next: "The addressed World Builder tab checks expectedRevision before applying. Read with ?guarded=1 until applied or refused. Another tab leaves it waiting. If the addressed tab was reloaded, read its new recipe/revision and explicitly replace the handoff. Never blindly resend a waiting recipe.",
      });
    },
  );
  // The person's World Builder reports what happened to one recipe.
  router.post(
    "/:id/world-recipe/applied",
    express.json({ limit: "2kb" }),
    (request, response) => {
      limit("edit", session(response));
      const copy = copyOf(request, response);
      if (response.locals.agent || !owns(copy, response))
        throw new AppError(
          403,
          "Only the person's World Builder reports a recipe applied.",
          "not_owner",
        );
      const current = handoffs.get(copy);
      const body: unknown = request.body;
      if (
        !plain(body) ||
        typeof body.sequence !== "number" ||
        typeof body.ok !== "boolean" ||
        (body.error !== undefined && typeof body.error !== "string")
      )
        throw new AppError(400, "Send the sequence and ok.", "invalid_report");
      if (
        !current ||
        current.sequence !== body.sequence ||
        current.state !== "waiting"
      )
        throw new AppError(
          409,
          "That recipe is no longer waiting.",
          "recipe_stale",
        );
      if (body.expectedRevision !== current.expectedRevision)
        throw new AppError(
          428,
          "Report the guarded handoff's expectedRevision. Refresh World Builder if it cannot enforce the revision guard.",
          "recipe_client_update_required",
        );
      const next: RecipeHandoff = {
        ...current,
        state: body.ok ? "applied" : "refused",
        appliedAt: new Date().toISOString(),
        error: body.ok ? null : clean(String(body.error ?? "Refused.")),
      };
      handoffs.set(copy, next);
      response.json({ ...next, recipe: undefined });
    },
  );
  return router;
}
