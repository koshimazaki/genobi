---
tags: [agents, studio]
summary: The Genobi bubble is a static guide — contextual pointers, Did you know tips and setup help. Agent sessions show in the footer deck; the agent API, MCP server and CLI drive Genobi from a terminal.
---

# Genobi bubble

**A guide, not an agent runtime (2 November 2026, #57).** The Genobi mark in
the header, opposite the mic, opens its bubble downward with the same look and
place as before: the SIDKIT `PixelTooltip` treatment (clear outline, offset
shadow, short pointer, small accent label) in the studio's own type, dark
surfaces and theme tokens. Its content is now static, curated and local
(`src/agent/GenobiGuide.tsx`, text in `src/agent/guide-content.ts`):

- **Voice first.** Genobi is driven by voice: the first pointer in every mode
  is "Press the mic and say what you want", and while a voice (or terminal)
  session runs, a compact status sits on top (`GuideSessionStatus.tsx`):
  **Agent working**, the agent's newest reply or line, "Results appear in
  Camera, the Gallery or World", **Speak to agent** (the same shared voice
  recorder and `AgentVoiceButton` as before) and **Open log** (the deck). The
  launcher reads **Agent working** meanwhile. The voice path itself is
  unchanged: the mic, Send to agent (`agent-destination.ts`, which now opens
  the deck rather than the old bubble view), World Builder's send
  (`world-send.ts`) and voice intents.
- **Here**: two or three pointers for the mode in view, for example "Swap a
  clip: drag a video from Assets onto a template slot", "Drop a track on the
  soundtrack slot", "Need new footage? Create it in Camera". A pointer's button
  only moves the person: **Open Camera**, **Open Assets** or **Set up Genobi**.
- **Did you know**: one [teaching](teachings.md) with Next, the same curated
  tips the deck cycles when idle.
- **Setup**: connect a key, start local ComfyUI, download models; **Set up
  Genobi** opens the existing setup dialog. On the hosted studio the hosted
  voice notice explains the local requirement.

The bubble makes no network call of its own, starts nothing and has no
text field. It replaced the session view: the conversation, Activity history,
**Start Genobi** with a typed brief, **Speak to agent**, the approvals, Stop,
and the new-reply mark on the avatar.

## Where agents went

Nothing on the agent side was removed:

- The agent API, the [MCP server](genobi-cli.md) and the `genobi` CLI still
  drive a project from a terminal (Hermes, Claude Code, Codex).
- `AgentSessionPanel` is now a headless follower: it restores the shown
  session after a reload, polls it while active and publishes each read.
- The footer [deck](genobi-deck.md) shows that session: its log, the
  conversation (**YOU ›** / **GENOBI ›** lines), the paid steps waiting for
  approval with plan, price and payer, and **Stop session**
  (`src/deck/DeckSession.tsx`). It opens by itself when a step waits for
  approval, and when voice sends a message to the session (`OPEN_DECK`).
- The Spawn agent dialog (**Start Genobi**) stays mounted in the wordmark and
  is still reached from the Director's agent panel, template actions, Scrolls
  and voice.
- Settings' former **Open the Genobi bubble for session updates** checkbox is
  gone; the stored `showBubble` preference is ignored.

## Timing and accessibility

The bubble enters over 180 ms; reduced motion removes it. It is a nonmodal
region, so it never traps focus or dims the workspace. Escape closes it and
returns focus to the mark. Controls have accessible names, expanded state and
visible focus indicators; the body scrolls between a fixed header and action
row and is keyboard-focusable. It opens below the header mark, up to 340 px
wide, in every preset; phones get 44 px targets. Closing it restores the
covered space.

## Local visual fixture

`/scripts/preview-agent-bubble.html?workspace=director&fixture=1` still drives
illustrative sessions through the real owner, opt-in and dev only. Since #57
those sessions show in the deck (open it from the footer), not in the bubble.
It starts no agent and makes no generation call.
