/** A mounted World Builder identity and its edit counter, never a saved recipe field. */
export const WORLD_RECIPE_REVISION =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[0-9]{1,16}$/;

export const RECIPE_REVISION_REQUIRED =
  "Read the open World with genobi_world's recipe command and send its revision as expectedRevision. Update the Genobi plugin and refresh World Builder if no revision is returned.";
export const RECIPE_REVISION_CONFLICT =
  "The World Builder scene changed after it was read. Read its current recipe and revision, preserve the person's edits, then send a new handoff.";

export const validRecipeRevision = (value: unknown): value is string =>
  typeof value === "string" && WORLD_RECIPE_REVISION.test(value);

/** Another tab must leave a handoff for the mounted scene it addresses. */
export const sameRecipeScene = (a: string, b: string) =>
  a.slice(0, 36) === b.slice(0, 36);
