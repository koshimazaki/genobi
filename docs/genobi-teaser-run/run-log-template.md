---
tags: [agents, verification]
summary: The proof page a teaser run fills in - model, commands, timings, approvals, decisions, verifier output, render and contact sheet - copied to docs/hermes-runs/ for each run.
---

# Teaser run log template

Part of [the teaser run kit](README.md). Copy this page to
`docs/hermes-runs/<YYYY-MM-DD>-teaser-run-<a|b>.md`, keep the frontmatter
(`tags: [agents, verification]`, a one-line `summary` saying pass or fail),
fill every section from the run's own files, and link it from the wiki home.
Leave a section's line as "not recorded" rather than guessing.

## Run

| Field              | Value                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Run                | A (from the brief) or B (from run A's memory)                      |
| Date               | YYYY-MM-DD                                                         |
| Agent              | Hermes vX.Y.Z, profile `hermes-creative` or `hermes-developer`     |
| Model              | `deepseek/deepseek-v4.1-flash` on `nous` (from the session banner) |
| Checkout           | worktree, base commit (`git rev-parse HEAD`)                       |
| Started from       | `docs/genobi-teaser-run/brief.json` or `from-a.memory.json`        |
| Started / finished | UTC times, and the total                                           |
| Spend              | No generation. Agent tokens on Nous only: amount if known          |
| Cut                | `cut.json` sha256 (the verifier's second line)                     |

## Commands

The commands the agent ran, in order, as it ran them (from the session
transcript): the analyser, the helper calls, the verifier runs, the render.

## Approvals

Every yes or no the person gave: terminal commands, new wording, the
contact-sheet review. Quote the person.

## Decisions

From `memory.json`: one line per decision (section, choice, because, source),
and the corrections it applied.

## Verifier output

The last verifier runs, verbatim, with their command lines: the agent's own
(no reference), then the person's: run A against v2 (`--min-similarity 0.7`),
run B against run A (`--min-similarity 0.95`). Each prints the cut's sha256;
it must match the Cut row above.

## Render

`render/render.mp4` (not committed: size in MB, frame count, SHA-256) and
`render/contact-sheet.png` (committed beside this page). What the review of
the twelve frames found.

## Where the instructions were unclear

Every point where the agent stopped, asked, retried or guessed, with the step
number of the skill. These are the next fixes to the kit.
