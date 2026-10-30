---
tags: [architecture, agents, director]
summary: Local project evidence, durable agent checkpoints, scoped taste and annotated references shared by every harness.
---

# Shared project memory and taste

The local studio owns creative memory. Director's **Project memory & taste**
records explicit keep/reject/preference decisions and known reasons. Every
successful project revision also records an operational event. Routine edits,
Undo and technical reruns do not establish a creative preference. The existing
Director feedback baseline and open notes continue to work.

Memory belongs to the project copy, across sessions. A session records its
runner, goal, progress and checkpoint. Built-in Claude Code and Hermes runners
load bounded context before launch, persist received progress and finalize their
received summary. A server restart marks an unfinished session **interrupted**,
retains its checkpoint, and exposes it to the next linked harness. It does not
restart a process or submit a generation. External Codex, Claude and Hermes
harnesses use the same MCP/API contract; Genobi does not add a built-in Codex
launcher.

The [terminal CLI](genobi-cli.md) uses these same memory tools. After real
usage, accepted examples and explicit corrections can guide suggestions for the
next task; this is evidence-based memory, not model retraining. CLI connection
profiles select a studio identity and defaults, not a separate Taste database.

## Evidence and concurrency

`shared/memory/` owns portable schemas, precedence and bounds. Each event has a
schema, stable ID, copy handle, server cursor/time, actor, optional session,
project revision, affected IDs and a reason whose source is explicit. Unknown
reasons remain unknown. Agents write interpretations; they cannot impersonate
user-authored decisions. A superseding interpretation cannot cancel an owner's
preference. Applied preference IDs can be retained on an event as provenance.

Writes include project and memory revisions. Identical decision, reference and
checkpoint retries return the existing record; conflicting ID reuse and stale
writes fail. `MemoryProjects` serializes clients and atomically writes evidence
with the project copy. This is one local server's storage, not a cross-process
or paired-machine synchronization protocol. Do not share its data directory
between simultaneously running servers.

A project retains at most 4,000 events, 100 references and 20 recent completed
sessions plus up to four active sessions. At the event ceiling, export and clear
private history before further project revisions. Checkpoints cite existing
event IDs and a monotonically covered cursor. Context returns a checkpoint,
newer events with `nextCursor`/`hasMore`, current project guidance, scoped taste,
open feedback and selected references. The memory portion is bounded to about
48 KiB; large guidance is explicitly marked `guidanceOverflow`, so an agent must
narrow its scope rather than apply a partial preference set. The full private
history remains available to the owner through a separate export.

## Curated Taste selection

`/taste` starts with every curated library and named, linked inspiration included,
including Teknium’s Uncommon Web. Uncheck references, clear the selection, or add
up to 12 custom HTTPS links with a name and observation. Links can be pasted or
dropped into the custom-reference form. Export selection saves this shelf as JSON.
This is a starting collection for agents, not learned taste or a used inventory.
The current request and project guidance take priority.

The local studio saves the shelf privately with the owner’s Taste profile via
revision-checked `POST /api/memory/taste/shelf`. Only the owner can change it;
linked agents read `tasteShelf` through project context. Built-in sessions receive
the same selection even without an open project. Old profiles default to the full
collection without rewriting learned preferences. An explicitly empty selection
stays empty. Hosted visitors can browse previews; saving requires the local studio.

The page introduces the Taste layer as Genobi’s code-based mood board, linking
visual examples, creator credits and intended-use checks. The UI supports review
and aesthetic judgement alongside voice/text guidance through supported API, CLI
and MCP workflows. Personal links and exports customize a selection; forks can
extend the curated catalogue and its creator credits. motion2code is featured
with the libraries and projects, while Andrew Zellinger remains in the creator
section. IBM Plex Mono is presented specifically as a typography building block.

Uncommon Web has compact attribution for presentation in the lower lineage
section, rather than credit for the Taste concept. The cards show individual examples,
not embedded library homepages. Curated direct demos include Paper Shaders, Pixi
filters, Alien.js fluid distortion with RGB shifts, Space.js Graph Markers and ASCII tools.
Anime.js, p5.js and typography have local
interactive samples; Transitions.dev uses the existing Genobi construction reel.
Remote examples retain their creator and demo-host credits. Andrew Zellinger
(`a2z2k26` on GitHub) is included as a creator reference, not a bundled dependency.

Examples open as their cards enter the viewport and unload when off screen or
when the tab is hidden. Stop/Play controls are available; reduced-motion visitors
start with examples stopped. Only fixed curated demo URLs enter sandboxed frames.
Every library and creator card has a direct demo, local sample, upstream image
or explicitly labelled workflow illustration. The plotter, Claude Animation Base,
Hermes, Claudia and motion2code use credited upstream media; Kōda and Andrew
Zellinger have explorable workflow illustrations that never record or generate.
Media failures retain a source link. Custom links
remain untrusted reference data and are never embedded or fetched by the server.
Model defaults and licence planning are collapsed; voice setup stays in studio
setup and the mic controls.

## Reusable taste

A project preference stays in its project. **Propose as reusable taste** creates
a proposal with a medium, use case and supporting events. In **My reusable
taste**, the owner can edit, explicitly activate, disable, export or delete it.
`*` means any medium or use case. The owner's explicit action is the promotion;
there is no second confirmation step. Agent proposals are never auto-promoted
by repetition. Owner promotion is deliberately outside the restricted agent MCP
tools; external owner automation can use the same authenticated owner API when
acting on an explicit instruction.

Precedence is current explicit request, current owner-authored project decisions,
applicable active preferences, template defaults. More specific scopes outrank
wildcards; equally applicable conflicting values are reported without choosing
a winner. Current request overrides belong in the agent's live brief; the pure
resolver also accepts them explicitly. Agents report the preferences they used
and cite their IDs in decision provenance.

Personal profiles are keyed to the existing studio owner session. A linked
agent receives applicable active preferences through that project's context,
not the owner's full profile or other project history. Clearing the browser's
owner cookie loses access; export private memory before doing so. Account-based
ownership and migration are future work.

## Tools and local routes

Load `genobi-taste` with `genobi_skill`. The registry is generated from these
same definitions, and both built-in runner allowlists share them.

| MCP tool                    | Local API under `/api/memory`                                         |
| --------------------------- | --------------------------------------------------------------------- |
| `genobi_context`            | `GET /projects/:copyId/context?medium=video&useCase=tutorial&after=0` |
| `genobi_decision`           | `POST /projects/:copyId/decisions`                                    |
| `genobi_session_checkpoint` | `POST /projects/:copyId/sessions` or `/checkpoint`                    |
| `genobi_taste`              | Context read or `POST /projects/:copyId/taste` proposal               |
| `genobi_reference`          | `POST /projects/:copyId/references`                                   |

Owner controls additionally use `GET/POST /taste`,
`GET /projects/:copyId/memory-export`, and `POST /projects/:copyId/forget`.
Owner mutations require `X-Genobi-Owner-Action: 1` and reject agent-marked or
cross-site requests. The existing cookie and project linking grant determine
ownership. Context reads add no project access and grant no spending.

Profiles are private files under the local data directory with owner-only file
permissions. Checkpoint access markers use one-way digests rather than browser
credentials. Memory lives alongside the private project manifest; it is not a
field of the exported Director project. Ordinary project ZIPs include neither
history nor personal profiles. Explicit history export includes decisions;
profile export is a separate owner action. Forgetting evidence clears derived
session summaries and removes preferences supported by it. Deletion is local;
previously downloaded exports remain the owner's copies.

## Reference import boundary

Annotate an existing uploaded project image/video asset or an HTTP(S) URL with
its purpose, observation, source author, known licence and optional revision.
References preserve stable catalogue/asset IDs; media is not copied into a
prompt. Saving a URL performs no fetch, inspection or execution. Unknown rights
remain unknown, and an observation is untrusted reference data.

**Not implemented:** hosted D1 history, paired-machine sync, external URL/media
fetching, GitHub inspection, runnable HTML/Three.js adapters, isolated scene
execution and deterministic scene/audio mapping. Those remain future work, not capabilities implied by saving a
reference. Uploaded references must already exist in the Director project.

## Verification

`tests/taste-memory.test.ts`, memory route/MCP tests and runner lifecycle tests
use temporary private storage and simulated runners. They cover restart and
handoff, duplicate writes, revision conflicts, owner isolation, interruption,
preference precedence/promotion/deletion, bounded context and reference refusal.
No live model or paid generation is needed for these checks.
