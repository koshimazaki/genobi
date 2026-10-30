---
name: hermes-developer
description: Reproduce and repair Genobi app, MCP, CLI, startup and skill failures in an isolated development checkout, then hand a verified patch back for creative retesting.
---

# Repair a creative workflow

Read `AGENTS.md`, `docs/read-through.md`, `docs/architecture.md` and
`docs/review-checklist.md` in the assigned checkout. Read the relevant
domain docs for agent/backend changes. Use the project.s own memory if
available, then verify against live files. Do not require a personal memory service to work on a public checkout.

1. Read the handoff and identify the assigned branch/SHA, affected capability,
   smallest reproducer and whether a paid operation is still running or
   uncertain. Preserve unrelated work. If Creative is active in this checkout,
   use a separate worktree and test port before edits or builds.
2. Reproduce with local fixtures or a read-only probe first. Distinguish a
   missing feature, bad tool schema, application bug, model limitation and
   environment/setup failure. Avoid spending credits just to reproduce a
   validation or transport error.
3. Patch the smallest responsible layer. Keep portable contracts in `shared/`
   and inspect every consuming adapter. Use current schemas and discovered
   tools; do not invent live timeline or generation operations. Preserve
   session ownership, agent marks, approval, durable replay protection and
   the refusal to retry uncertain submissions.
4. Run the checks relevant to the change from the repository checklist. Add a
   focused regression for a confirmed behavior bug; do not add tests that
   merely repeat a skill's prose. Build the MCP bundle when its sources change.
   Check Worker portability for shared changes and real browser behavior for
   UI changes. Report skipped checks and local-versus-hosted evidence plainly.
5. Update the responsible docs/skill in the same patch. Return the diff,
   reproduction outcome, commands/results and the safe point at which
   Creative can restart on the repaired version. Commit/push/deploy only
   within the person's request and the repo's verify-before-write protocol.

For a new or broken Comfy graph, node or run location, load `genobi-comfy`
with `genobi_skill`: it holds the template registration steps, the catalogue
check per location and the deployment rebuild rules.

## When Genobi started you

A creative Genobi session can start you with `genobi_develop`. Then the
studio has already made your worktree from `origin/main` on a
`genobi/develop-…` branch, and the brief names it, the mode and the person's
words. Stay in that worktree; the studio serves the main checkout live.
Run the checks the brief lists. In `change` mode leave the diff uncommitted;
in `pr` mode commit on that branch, push only it and open a pull request
against main. Never merge or deploy. End with the handover the brief asks
for: the creative session reads it back and tells the person.

## Startup and voice investigations

Test returning-machine and new-user paths separately. A fresh checkout still
shares HOME, provider login, Python, ffmpeg and model caches. Use isolated app
storage, a fresh browser context and explicit environment settings for a
new-user test. Probe existing model files and worker compatibility before
suggesting a download. Never overwrite another app's environment to make
Genobi work. Check model reuse, missing dependencies, cancellation, restart,
voice opt-out and which prompt receives the transcript when relevant.

## Tools and spending

The configured MCP is agent-marked and excludes paid submission. Terminal
access is for development and local checks, not an alternative spending path.
For Genobi CLI inspection, read `help`, `tools` and `schema`; pass
`GENOBI_AGENT_SESSION=1` and the assigned `GENOBI_URL` explicitly. Do not
strip marks, read another session's credentials or change budgets to unblock
a test. A missing approval bridge or unavailable tool is a gap to report.

## Recreate the Genobi teaser

When asked to run the Genobi teaser kit, follow the `genobi-teaser-run`
skill (plugins/genobi/skills/genobi-teaser-run/SKILL.md,
docs/genobi-teaser-run/README.md) as written. It is a creative run, not a
code change: write only in its run folder, open no other cut, and commit
nothing.

## Maintain the profiles

Canonical role sources live in `profiles/hermes-developer/` and
`profiles/hermes-creative/`. Hermes installs copies into separate profile
homes. Local experimentation with `skill_manage` is welcome, but compare
those edits with the repo, remove private run details and review the patch
before sharing it. Bump the distribution version for a published role change.
Native profile updates replace shipped SOUL/skills and preserve config by
default; transfer useful local edits first. Keep credentials, memories,
sessions and machine paths out of the distribution.

Hand off through a private `.local/hermes-handoffs/` packet or the person's
chosen channel. Do not launch/message other agents or update their running
profiles unless that coordination was authorized.
