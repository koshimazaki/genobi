---
tags: [vision, agents, director, plan]
summary: One shared creative workspace, two ways to drive it (the built-in voice agent or the person's own harness), with Genobi speech bubbles instead of a chat panel and project memory kept apart from any transcript.
---

# Agent workspace

The studio is where you see and direct the work. Your agent can live inside it
or somewhere else. This page is the product statement for that idea (22 October 2026) and maps each part to what is built, what is specced and what is open.

## The shape

- **One shared workspace**: the canvas, assets, project memory and tools.
- **Two ways in**:
  - **Built-in agent**: speak or type one global prompt; the agent plans,
    picks the skill and tools, switches to the section it needs, does the work
    and shows the output.
  - **External harness**: Claude Code, Codex or Hermes, in the person's own
    environment, through the same tools.
- **The Editor is the collab layer.** A take that comes back from the agent is
  edited in layers and goes back with the instruction for the next pass
  ([Regenerate](director-agent-tools.md)), so a correction is never a one-way
  handoff. The owner's shape (27 October): whatever the agent makes is JSON
  in layers, so you can pick one layer (a typeface animation, a clip) and say
  what changes: move it in time, change the colour and font, finish by this
  second. Then either apply it by hand and render the MP4, or hand it back
  and the agent redoes the video with that change, or regenerates only that
  clip from the frames you dropped. Feedback steers it; it is never a random
  retake. Layer-scoped instructions and per-layer attribution follow from
  this and are not built yet.
- **Genobi speaks, it does not chat.** Short speech bubbles for planning,
  progress, requests and completion, with an expandable activity history. No
  permanent chat panel.
- **Project knowledge is not the transcript.** Creative intent, decisions,
  preferences and asset relationships live with the project, so a session can
  end without losing them, and a new agent can read what happened.

## What exists, what is specced, what is open

| Part                                       | State                                                                                                                                                                             | Where                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Common interface for any harness           | Built: the Genobi MCP server and plugin, link codes, project addressing by `copyId`                                                                                               | [Director agent tools](director-agent-tools.md), `plugins/genobi/` |
| Shared project and assets                  | Built: the project copy on disk with revisions and an event stream; agent takes handed into the project as assets                                                                 | [Director bundle](director-bundle/README.md)                       |
| Skills an agent follows                    | Built: one per template plus the open route                                                                                                                                       | [Hermes runs](hermes-runs.md)                                      |
| Spending stays with the person             | Built: quotes, chain approvals, the budget check                                                                                                                                  | [Architecture](architecture.md)                                    |
| Voice and global prompt                    | Built: voice overlay and transcript                                                                                                                                               | [Voice mode](voice-mode.md)                                        |
| Built-in agent runs the studio             | Specced on #23: studio commands over a session stream, and the local agent runner                                                                                                 | issue #23                                                          |
| Genobi speech bubbles and activity history | Built (#67): the session's lines and summary in a bubble below the header mark, with expandable activity and Stop; structured plan and tool counts are open on #23                | [Genobi bubble](agent-bubble.md)                                   |
| Portable project memory                    | Open, box on #14: `memory.json` in the project (intent, decisions, preferences, asset relationships, actions), and session logs as `sessions/*.jsonl`, both carried in the bundle | issue #14                                                          |
| Bring your own memory                      | Open: the memory file is plain JSON, so an external system (Open-Brain, a wiki) can read and write it through the same tools                                                      | issue #14                                                          |

## Rules worth keeping

- The memory file is the source of truth for the project's creative decisions;
  a transcript is a log, never the record.
- Memory is inspectable and portable: plain JSON in the project bundle, no
  hidden database.
- An agent, built-in or external, can navigate and edit freely, but every paid
  step still waits for the person's approval.
- Bubbles report real tool progress, never invented status.

## Requirements for the open boxes

Agreed on 22 October 2026, for the rest of the bubbles work (#23) and the
memory box (#14).

**Bubbles and activity history (#23)**

- The bubble and its activity history are built (#67, [Genobi bubble](agent-bubble.md));
  they show the session's received lines and summary as the agent's text.
- Counts and states in a bubble ("3 tools planned, 8 assets selected", "Preview
  ready") come from structured plan and tool events on the agent session
  stream, not from text the agent writes. New event kinds are additive in
  `shared/agent-session-events.ts`.
- Do the structured events before memory: they are what a viewer of the demo
  sees.

**Project memory (#14)**

- **Append-only entries.** Each entry is dated and names who wrote it: the
  person or which agent. Nobody overwrites the file as one object, so a second
  session cannot undo the first session's decisions. A later entry can
  supersede an earlier one by referring to it.
- **Assets by reference.** Entries name assets by path or ID and never embed
  media, so the file stays small.
- **Private by default.** `memory.json` and `sessions/*.jsonl` stay out of
  anything shared or published: gallery links, watch and embed pages, and any
  public bundle. They are private lineage under the repository rules.
- **One project format.** The memory file and session logs live in the existing
  project copy and Director bundle; there is no second `.director/` layout
  beside them.
- **Thin first version.** The file in the bundle plus MCP tools to read it and
  append to it. Bring-your-own memory stays a documented promise until then.

**Open decision.** The product name: "NINJA DIRECTOR" with Genobi as the agent
persona, or the 20 October decision (Genobi Studio as the app, Ninja as the
layout mode, Director to be renamed). Settle it before the demo video.
