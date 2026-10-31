---
tags: [3d, world-builder, agents]
summary: Revision-checked agent recipe handoffs, concurrent human edits, target tabs and ephemeral live scene guards.
---

# World Builder recipe handoffs

An agent uses the existing World pairing to read the target tab with
`genobi_world {"action":"command", …, "command":{"op":"recipe"}}`, then
reads that command's result. It returns the current recipe and an opaque
`revision`. Send that value as `expectedRevision` with `genobi_world_recipe`,
alongside the linked project's `copyId` and either a full `recipe` or
`take: "falling-room"`. Both the World pairing and project link are required.
The HTTP equivalent is `POST /api/projects/:id/world-recipe`:

```json
{
  "expectedRevision": "<revision from the target World tab>",
  "take": "falling-room"
}
```

The server validates the recipe with `validateRecipe` and keeps one waiting
handoff per project copy. The open World Builder polls every two seconds with
`GET …/world-recipe?guarded=1`. Only the addressed mounted scene handles it;
another owner tab leaves it waiting. The tab checks the revision before
starting and again at the synchronous commit after any asynchronous character
or sound preparation. A human recipe edit, camera/primitive edit, texture or
audio change advances the live guard. An active transform drag refuses the
handoff; new drags stay locked during its guarded update. Playback and
uncommitted navigation are not recipe revisions.

A stale handoff is acknowledged `refused` without changing the current scene,
loaded sound or saved recipe. Read the current recipe and revision, preserve the
person's changes, then send the revised handoff. A successful named take applies
its recipe and dry sound in the same guarded update. A later preview failure is
shown in the Builder without claiming that the committed edit was refused.
The result is recorded as `world/recipe.json` in the same still-open project;
navigation during preparation aborts the update, and navigation after commit
never writes that recipe into the newly opened project.

The revision is a mounted-scene identity plus an edit counter. It is **ephemeral**:
refreshing or remounting World Builder starts a new identity. It is separate from
Director's numeric `project.revision`, the handoff's delivery `sequence`, and the
saved Recipe format. Saving or loading a recipe does not save or restore its live
guard. After a tab reload, read its new recipe/revision before explicitly replacing
an obsolete waiting handoff. Never blindly resend a waiting handoff.

The owner reports `applied` or `refused` with `sequence` and `expectedRevision`
to `POST …/world-recipe/applied`. Agents read status with `genobi_world_recipe`
(or `GET …/world-recipe?guarded=1`). `from` names `person`, `cli` or `agent` as
before. A missing revision, an older poller without `guarded=1`, or an unguarded
acknowledgement receives HTTP 428 with instructions to refresh World Builder or
update the plugin. Older tabs never receive a waiting recipe they would apply
without its guard.

The handoff remains in memory only; a server restart forgets it. It never
captures or submits a generation. Capture uses `genobi_world` or the person's
Capture take button. This remains local only, like the linked project copy;
runner pairing does not create a hosted canonical scene or project.
