import { ActivityHistory } from "../activity/ActivitySettings";
import { useActivity, refreshActivity } from "../activity/store";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type {
  AgentSession,
  AgentSessionStatus,
} from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { GenobiMark } from "../components/GenobiMark";
import { OPEN_SETUP } from "../setup/state";
import { BRIEF_MAX, startPrompt } from "./spawn";
import { spawnFromStudio } from "./spawn-store";
import { OPEN_BUBBLE } from "./useAgentSession";
import { TeachingNote } from "../teachings/TeachingNote";
import { useHostedStudio } from "../hosted-studio";
import { HostedVoiceNotice } from "../voice/HostedVoiceNotice";
import { AgentVoiceButton } from "../voice/AgentVoiceButton";
import {
  AgentConversation,
  conversationOf,
  replyCount,
} from "./AgentConversation";
import "./agent.css";
import "./agent-header.css";
import "./agent-conversation.css";

const LABEL: Record<AgentSessionStatus, string> = {
  starting: "Starting",
  running: "Working",
  waiting: "Waiting for you",
  done: "Session finished",
  failed: "Session failed",
  stopped: "Stopped",
  interrupted: "Interrupted · checkpoint retained",
};

/** A view of received text, never an inferred plan or completion claim. */
export function bubbleUpdate(session: AgentSession) {
  const summary = session.summary?.trim();
  const latest = session.lines.at(-1)?.trim();
  if (summary) return { source: "Agent summary", text: summary };
  if (latest) return { source: "Agent update", text: latest };
  return { source: "Session", text: LABEL[session.status] };
}

/** What the avatar and the footnote say: the server's state, or a step waiting. */
export function bubbleLabel(session?: AgentSession, attention = false) {
  if (attention) return "Approval waiting";
  if (!session) return "Ready when you are";
  // A live session whose turn is answered waits for the person (Box 1.8).
  if (session.idle && isAgentActive(session.status))
    return "Waiting for your next message";
  return LABEL[session.status];
}

/** SIDKIT tooltip treatment, in the studio's own tokens. No transcript input. */
export function AgentBubble({
  session,
  error,
  stopping = false,
  onStop,
  onAssets,
  approvals,
  attention = false,
  defaultOpen,
}: {
  /** Open on first render whatever the session; the bubble's tests use it. */
  defaultOpen?: boolean;
  session?: AgentSession;
  error?: string;
  stopping?: boolean;
  onStop?: () => void;
  onAssets?: () => void;
  /** Paid steps waiting for the person, shown above the latest update. */
  approvals?: ReactNode;
  /** A step waits for the person: the bubble opens if it was tucked away. */
  attention?: boolean;
}) {
  const hosted = useHostedStudio();
  const preferences = useActivity();
  const [open, setOpen] = useState(
    defaultOpen ?? (!!session && preferences.showBubble),
  );
  useEffect(() => {
    if (!open) return;
    void refreshActivity();
    const timer = setInterval(() => void refreshActivity(), 4000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    if (attention && preferences.showBubble) setOpen(true);
  }, [attention, preferences.showBubble]);
  // The deck's "Open bubble": the person asked, so it opens whatever the
  // bubble preference says.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_BUBBLE, show);
    return () => window.removeEventListener(OPEN_BUBBLE, show);
  }, []);
  const [expanded, setExpanded] = useState(false);
  /** An optional typed brief for Start Genobi, as voice gives a spoken one. */
  const [brief, setBrief] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const activity = useRef<HTMLButtonElement>(null);
  const id = useId();
  const active = !!session && isAgentActive(session.status);
  // A reply that arrives while the bubble is tucked away marks the avatar.
  const replies = replyCount(session?.exchange);
  const [seen, setSeen] = useState(replies);
  useEffect(() => {
    if (open) setSeen(replies);
  }, [open, replies]);
  const unread = !open && replies > seen;
  const conversation = conversationOf(session);
  const stateLabel = bubbleLabel(session, attention);
  const update = session
    ? bubbleUpdate(session)
    : {
        source: "Your studio companion",
        text: "Use typed prompts, voice or a linked local harness. Enable optional tool history in Settings to see its activity here.",
      };
  const hide = () => {
    setOpen(false);
    setExpanded(false);
    launcher.current?.focus({ preventScroll: true });
  };

  return (
    <aside
      className="agent-companion"
      aria-label="Genobi activity"
      data-status={session?.status ?? "idle"}
      data-error={!!error || undefined}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        if (expanded) {
          setExpanded(false);
          activity.current?.focus({ preventScroll: true });
        } else hide();
      }}
    >
      {/* Only state is live-announced; stream text is available on demand. */}
      <span className="agent-announcement" role="status" aria-atomic="true">
        Genobi:{" "}
        {error ? "Connection interrupted" : unread ? "New reply" : stateLabel}
      </span>
      {open && (
        <section className="agent-bubble" id={id} aria-label="Agent session">
          <header className="agent-bubble-head">
            <span className="agent-name">Genobi</span>
            <span className="agent-runner">
              {session
                ? session.runner === "claude"
                  ? "Claude Code"
                  : "Hermes"
                : "Studio activity"}
            </span>
            <button
              type="button"
              className="agent-close"
              aria-label="Tuck away Genobi bubble"
              title="Tuck away; the session keeps running"
              onClick={hide}
            >
              ×
            </button>
          </header>
          <div
            className="agent-bubble-body"
            tabIndex={0}
            role="region"
            aria-label="Agent update and activity"
          >
            {error && <p className="agent-error">{error}</p>}
            {approvals}
            {session?.localSessionUrl && (
              <a
                href={session.localSessionUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open local session · assets and paid approvals ↗
              </a>
            )}
            {conversation && session ? (
              <AgentConversation session={session} exchange={conversation} />
            ) : (
              <div className="agent-bubble-copy">
                <div className="agent-source">{update.source}</div>
                <p className="agent-latest">{update.text}</p>
              </div>
            )}
            {/* Idle only: a session's own text always takes the space. */}
            {!session && <TeachingNote className="agent-teaching" />}
            {!session && hosted && <HostedVoiceNotice />}
            {!session && (
              <label className="agent-brief">
                <span>Brief (optional)</span>
                <textarea
                  aria-label="Brief for Genobi"
                  rows={2}
                  maxLength={BRIEF_MAX}
                  placeholder="Type what to make, or start without words"
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                />
              </label>
            )}
            {expanded && <ActivityHistory />}
            {expanded && session && (
              <div className="agent-history" id={`${id}-history`}>
                <div className="agent-source">Your request</div>
                <p className="agent-request">{session.prompt}</p>
                <div className="agent-history-label">
                  <span>Recent activity</span>
                  <span>Oldest first</span>
                </div>
                {session.lines.length ? (
                  <ol aria-label="Recent session updates">
                    {session.lines.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="agent-empty">No updates received yet.</p>
                )}
                {session.summary && (
                  <>
                    <div className="agent-source">Agent summary</div>
                    <p className="agent-request">{session.summary}</p>
                  </>
                )}
                {onAssets && (
                  <button type="button" onClick={onAssets}>
                    Open project assets ↗
                  </button>
                )}
              </div>
            )}
          </div>
          <footer className="agent-bubble-foot">
            <AgentVoiceButton session={session} />
            {!session && (
              <button
                type="button"
                className="agent-spawn"
                title="Start your agent on the open project: pick it, sign in, go"
                onClick={() => {
                  hide();
                  void spawnFromStudio({
                    prompt: startPrompt(brief),
                    source: "typed",
                  }).then(
                    (started) => {
                      if (started) setBrief("");
                    },
                    () => {},
                  );
                }}
              >
                Start Genobi
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                hide();
                window.dispatchEvent(new Event(OPEN_SETUP));
              }}
            >
              Set up Genobi
            </button>
            {(session || preferences.enabled) && (
              <button
                type="button"
                ref={activity}
                aria-expanded={expanded}
                aria-controls={expanded ? `${id}-history` : undefined}
                onClick={() => setExpanded((value) => !value)}
              >
                <span aria-hidden="true">{expanded ? "−" : "+"}</span> Activity
                <span className="agent-count" title="Recent received updates">
                  {session?.lines.length ?? preferences.events.length}
                </span>
              </button>
            )}
            {active && (
              <button
                type="button"
                disabled={stopping}
                onClick={() => {
                  launcher.current?.focus({ preventScroll: true });
                  onStop?.();
                }}
              >
                {stopping ? "Stopping…" : "Stop session"}
              </button>
            )}
            {!active && <span className="agent-footnote">{stateLabel}</span>}
          </footer>
        </section>
      )}
      <button
        type="button"
        ref={launcher}
        className="agent-launcher"
        data-unread={unread || undefined}
        aria-label={
          open
            ? "Tuck away Genobi bubble"
            : unread
              ? "Open Genobi activity, new reply"
              : "Open Genobi activity"
        }
        title={`Genobi · ${error ? "Connection interrupted" : unread ? "New reply" : stateLabel}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? hide() : setOpen(true))}
      >
        <span className="agent-avatar">
          <GenobiMark />
          <i aria-hidden="true" />
        </span>
        <span className="agent-launcher-label">
          <strong>Genobi</strong>
          <span>
            {error
              ? "Connection interrupted"
              : unread
                ? "New reply"
                : stateLabel}
          </span>
        </span>
      </button>
    </aside>
  );
}
