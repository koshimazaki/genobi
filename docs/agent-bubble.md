---
tags: [agents, studio]
summary: Genobi's contextual bubble, the session as one growing conversation, the new-reply mark on its avatar, its evidence boundary, activity history and responsive behavior.
---

# Genobi bubble

Part of #23. The existing Genobi mark in the header opens its reply bubble
downward. It is the studio’s one activity control, opposite the mic; the name
beside it remains the home link. It uses the existing mark and theme tokens.
The visual reference is SIDKIT's `PixelTooltip` and guide bubbles in
`components/help-mode.tsx`: a clear outline, offset shadow, short pointer and
small accent label. The studio keeps its existing type and dark surfaces.

## Interaction

- Without a session, the mark opens a short hint about starting a project prompt
  through the mic. A newly shown session opens compactly: one received update, the activity
  toggle and Stop while the session is active. Text is limited to three lines;
  expand Activity for the complete received lines and summary.
- Activity shows the original request, recent updates oldest first, and the
  agent's summary when supplied. Its count is the number of **retained updates**
  (up to 40), not completed tools or a percentage. Reading position is preserved
  when new lines arrive; the list does not force-scroll.
- **One conversation** (Box 1.8). Once the session holds a reply and a
  further message, the bubble shows the exchange, oldest first: each message
  the person sent (**You**) and each reply the runner gave at the end of a
  turn (**Genobi**), from the view's `exchange`. While a turn runs, the latest
  received line follows as **Agent update**; once every turn is answered the
  state reads **Waiting for your next message**. Messages arrive through
  voice's **Send to agent** ([a second message](agent-sessions.md#a-second-message));
  the bubble itself still has no text field.
- The close button tucks the bubble into its avatar/status button. The same
  session keeps polling and can be reopened, including after completion.
  Hiding is not Stop. A reply that arrives while the bubble is tucked away
  marks the avatar (a lit dot, "New reply" in its label and title, and
  "Open Genobi activity, new reply" as its name) until the bubble is opened;
  the bubble does not open by itself for it. A new session, started when
  none was running, replaces the previous session's bubble.
  With it tucked away, the footer [deck](genobi-deck.md)'s bar still shows the
  session's newest line, its open log holds the whole session, and its
  **Open bubble** reopens this bubble: the bubble for the conversation, the
  deck for the detail.
- Escape inside Activity collapses it and returns focus to its toggle. A second
  Escape tucks the bubble away and returns focus to the avatar. Opening a
  session never moves focus or rearranges the studio.
- No timed dismissal: requests, errors and results remain inspectable. A waiting
  or failed session stays visible in the avatar even when the bubble is tucked
  away. Connection failures take priority over the last known state.
- The Activity shortcut opens the **current** project's existing asset drawer.
  It does not infer which asset was requested. A further message goes to the
  running session; once it has finished, the next one starts a new session.

## Timing and accessibility

The bubble enters over 180 ms; the active indicator breathes three times over
six seconds, then rests. Reduced motion removes both animations. Only state
changes are announced politely; rapidly arriving narration is not a live region.
Controls have accessible names, expanded state and visible focus indicators.
The activity scroller is keyboard-focusable. The bubble is a nonmodal region,
so it never traps focus or dims the workspace. Native dialogs remain above it.

The bubble opens below the header mark, up to 340 px wide, in every preset.
Its height is bounded by the viewport, with the content scrolling between a
fixed header and action row. Phones provide 44 px action targets. Tucking it
away restores the covered space. There is no second avatar in a canvas corner.

## Evidence boundary

The current local session response supplies `status`, `lines`, `summary` and
the conversation (`exchange`, `idle`). Those are displayed directly: **Agent
update**, **Agent summary**, **Your request**, **You** and **Genobi**, and the
actual server state. A reply is the runner's own `result` text for a turn. An agent's interpretation is its received
text, not an extra UI-generated account. `done` means **Session finished**;
it does not establish that an export or preview is ready.

The current response flattens tool and narrative updates into strings. This
pass deliberately adds no numerical plan, tool-completion or asset-selection
metrics. Those need structured plan/tool events on #23's stream before the view
can display them. Likewise a targeted asset request or result action needs a
validated asset/project reference; do not parse free text to create that action.
Further messages reach a running headless Claude Code session on its own
stdin; no memory file or project format is introduced.

## Local visual fixture

With the development server running, open
`/scripts/preview-agent-bubble.html?workspace=director&fixture=1`. Fixture data is explicitly opt-in. Without `fixture=1`, it opens the normal
studio with no fixture controls, banner or simulated session. It mounts the actual
studio and bubble with visibly labelled illustrative session data. Its controls
exercise all six states, a connection failure, Stop, long activity, hide/reopen,
a conversation with **Fixture reply** (tuck the bubble away first to see the
avatar's new-reply mark), and the real asset drawer. It starts no agent and makes no generation call.
The fixture is not an entry in the production build. It drives the actual
header owner through fixture-only read/Stop responses; unrelated requests remain
unchanged. The real project-prompt flow supplies actual sessions in normal use.
This pass shows text replies and does not add synthesized speech.
