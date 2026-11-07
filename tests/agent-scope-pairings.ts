// The explicit, ephemeral pairings (server/pairings.ts) in the agent read
// scope's route list (agent-scope-routes.test.ts): each has its own
// owner and pairing checks, so the read scope does not apply to it.

/** Scrolls' fill and World's live control routes, and why each is not scoped. */
export const PAIRING_ROUTES: Record<string, string> = {
  "GET /api/exports/scrolls/targets":
    "Only explicitly linked Scroll tabs; no implicit project grant.",
  "GET /api/exports/scrolls/tabs/:id":
    "This tab's owner or one-use linked session; bounded live snapshot only.",
  "POST /api/exports/scrolls/tabs/:id/poll":
    "Only the registered browser owner; marked agents refused.",
  "POST /api/exports/scrolls/commands":
    "Linked tab, exact document/revision/cell context and validated edits required.",
  "GET /api/exports/scrolls/commands/:id/media":
    "Only the dispatching browser owner; agent-marked clients refused; media was read with the requester's project/receipt grant.",
  "GET /api/exports/scrolls/commands/:id":
    "Only command requester or browser owner; bounded retained result.",
  "POST /api/exports/scrolls/commands/:id/result":
    "Only the dispatching browser owner; marked agents refused.",
  "POST /api/exports/tabs/:id/link":
    "Only this Scroll tab owner browser issues one-use links; marked agents refused.",
  "POST /api/exports/link":
    "One-use link code binds the caller to one ephemeral Scroll tab.",
  "GET /api/exports/targets": "Only tabs whose projects this caller can read.",
  "POST /api/exports/tabs":
    "Only the owner browser of a synced project; marked agents refused.",
  "POST /api/exports/tabs/:id/poll":
    "Only the registered tab owner browser; marked agents refused.",
  "DELETE /api/exports/tabs/:id":
    "Only the registered tab owner browser; marked agents refused.",
  "POST /api/exports":
    "Target project access, exact revision and per-tab export lock required.",
  "GET /api/exports/:id": "Only the export requester or project owner.",
  "POST /api/exports/:id/cancel": "Only the export requester or project owner.",
  "POST /api/exports/:id/progress":
    "Only the export owner browser; marked agents refused.",
  "POST /api/exports/:id/artifact":
    "Only the export owner browser; marked agents refused; validated bytes before receipt.",
  "GET /api/exports/:id/artifact":
    "Only the export requester or project owner; private completed bytes.",
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
  "GET /api/world/:id/status":
    "World owner or explicitly paired session; readiness read does not refresh browser heartbeat.",
  "POST /api/world/:id/commands":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/commands/:command":
    "World has explicit, ephemeral pairing and owner-only browser dispatch.",
  "GET /api/world/:id/commands/:command/media":
    "World tab owner only; command caller's project access and media hash checked before queueing.",
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
