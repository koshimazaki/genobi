// The explicit, ephemeral pairings (server/pairings.ts) in the agent read
// scope's route list (agent-scope-routes.test.ts): each has its own
// owner and pairing checks, so the read scope does not apply to it.

/** Scrolls' fill and World's live control routes, and why each is not scoped. */
export const PAIRING_ROUTES: Record<string, string> = {
  "POST /api/scrolls/fill":
    "Scrolls fill: the person's tab asks for its own one-use code; marked agents refused.",
  "POST /api/scrolls/fill/panels":
    "Scrolls fill: text panels by a one-use code from the person's Send; reads nothing of theirs.",
  "GET /api/scrolls/fill/:id":
    "Scrolls fill: only the tab that asked collects its panels; marked agents refused.",
  "POST /api/world/connect":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/link":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/grant":
    "World grant: only the tab's owner browser, for one of their running sessions; marked agents refused.",
  "DELETE /api/world/:id/grant/:run":
    "World grant: only the tab's owner browser takes a grant back; marked agents refused.",
  "GET /api/world/granted":
    "World grant: the run is read from its server-set scope; it reads only the tab id that granted it.",
  "DELETE /api/world/:id":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/next":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/commands":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/commands/:command":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/commands/:command":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "POST /api/world/:id/files/:file":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/files/:file":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/files":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "DELETE /api/world/:id/files":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
};
