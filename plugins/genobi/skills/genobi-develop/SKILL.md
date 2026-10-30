---
name: genobi-develop
description: When the person asks for a change to the Genobi studio itself (its UI, a tool, a skill, a workflow, a node), start a Developer session with genobi_develop instead of telling them to open the repository - it works in a fresh worktree from origin/main, runs the checks, and leaves a diff or opens a pull request. Never spends.
license: MIT
compatibility: Needs the local Genobi studio (`npm run dev` in camera-director), a studio-started Genobi session, and a runner the person saved in setup (Hermes needs its hermes-developer profile).
metadata:
  version: "0.1.0"
  phase: "develop the studio from a creative session"
  tags: "agents, mcp, studio"
  docs: "docs/agent-sessions.md, docs/supervisor.md"
---

# Hand a studio change to a Developer

You are the creative side. When the person asks to change the studio itself,
you do not edit code and you do not answer "open the repo and do it". You
start a Developer with `genobi_develop`, tell the person where it is, and
read its result back when they ask.

## When to use it

Use it when the request is a change to the studio: its interface ("move the
mic icon from the recording side to the other side"), a Genobi tool, a skill,
a workflow template, a ComfyUI node, a bug the person hit in the app. Do not
use it for creative work: a shot, a cut, a sound, a template run. Those stay
with you and the other skills.
For a Comfy graph or node, say so in the task: the Developer loads
`genobi-comfy` for those.

## What to send

- `task`: the person's words verbatim, then on new lines the surface if you
  know it (the tab, panel or tool) and the acceptance check ("the mic icon sits
  on the left of the record bar at desktop and phone widths").
- `files`: repository-relative hints when you know them, such as
  `src/voice/VoiceOverlay.tsx`. They are hints, not limits; leave them out
  rather than guess.
- `mode`:
  - `change` (the default to choose): make the change, run the checks, leave
    an uncommitted diff on the Developer's branch for the person to review.
  - `pr`: also commit on that branch and open a pull request against main.
    Only when the person asked for a commit or a pull request in this
    conversation.

You never choose the runner: it is the one the person saved in setup. You
never choose the folder or branch either: the studio makes a worktree from
origin/main on a `genobi/develop-…` branch. The checkout the studio serves is
never touched, so the app the person is using keeps running.

## What to tell the person

Right after the start, one or two lines from the answer:

> A Developer (Hermes) is on it in branch `genobi/develop-move-the-mic-…`.
> Follow it in Project Tools → Development; it will leave a diff for you to
> review (or: open a pull request).

When they ask how it went, call `genobi_develop` with the `id` and report its
`status`, `prUrl` and `summary` in your own short words. A `done` status with
no pull request in `change` mode means the diff is waiting in the worktree
named in the answer. A `failed` or `interrupted` status: say so, quote the last
line of `recent`, and offer to start another Developer with what was learned.

## What you must not do

- Do not tell the person to open the repository themselves while this tool is
  there. If the start is refused, say why in their words (no runner saved in
  setup, Hermes' developer profile missing, a Developer already running) and
  what fixes it.
- Do not start a second Developer while one runs; the studio refuses it
  (`development_busy`). Read the running one instead.
- Do not ask for `pr` mode on your own initiative, and never ask the Developer
  to merge, deploy or push to main; it will refuse.
- Nothing here spends. The Developer has no paid tools: its Genobi tools carry
  the agent mark like yours. Do not route a generation through it.

This is the thin version: you and the Developer do not talk to each other
live. You hand it the task; it hands back a branch, a pull request and a
summary that you read with the `id`.
