import { useId, useRef, useState } from "react";
import { GenobiMark } from "../components/GenobiMark";
import { OPEN_SETUP } from "../setup/state";
import { useShell } from "../studio/ShellContext";
import { TeachingNote } from "../teachings/TeachingNote";
import { useHostedStudio } from "../hosted-studio";
import { HostedVoiceNotice } from "../voice/HostedVoiceNotice";
import {
  ACTION_LABEL,
  SETUP_STEPS,
  guidePointers,
  type GuideAction,
} from "./guide-content";
import { useLatestAgentSession } from "./useAgentSession";
import { GuideSessionStatus } from "./GuideSessionStatus";
import { isAgentActive } from "../../shared/agent-session-events";
import "./agent.css";
import "./agent-header.css";

/**
 * The Genobi bubble as a guide (#57): the same mark beside the mic, opening
 * the same SIDKIT-style bubble, with static local help — pointers for the
 * mode in view, "Did you know" tips and setup help. It starts no agent and
 * makes no network call. Genobi is voice-first: while a voice (or terminal)
 * session runs, a compact status on top says the agent is working, shows its
 * newest words and where results land, and offers Speak to agent. The full
 * log, approvals and Stop are in the footer deck.
 */
export function GenobiGuide({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const shell = useShell();
  const hosted = useHostedStudio();
  const [open, setOpen] = useState(defaultOpen);
  const launcher = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pointers = guidePointers(shell?.preset);
  const session = useLatestAgentSession();
  const working = !!session && isAgentActive(session.status);
  const hide = () => {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  };
  const act = (action: GuideAction) => {
    hide();
    if (action === "setup") window.dispatchEvent(new Event(OPEN_SETUP));
    else if (action === "camera") shell?.select("camera");
    else shell?.setAssetsOpen(true);
  };
  const usable = (action?: GuideAction): action is GuideAction =>
    !!action && (action === "setup" || !!shell);

  return (
    <aside
      className="agent-companion"
      aria-label="Genobi guide"
      data-status={session?.status ?? "idle"}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        hide();
      }}
    >
      {open && (
        <section className="agent-bubble" id={id} aria-label="Genobi guide">
          <header className="agent-bubble-head">
            <span className="agent-name">Genobi</span>
            <span className="agent-runner">Guide</span>
            <button
              type="button"
              className="agent-close"
              aria-label="Close Genobi guide"
              onClick={hide}
            >
              ×
            </button>
          </header>
          <div
            className="agent-bubble-body"
            tabIndex={0}
            role="region"
            aria-label="Genobi tips"
          >
            {session && <GuideSessionStatus session={session} onDeck={hide} />}
            <div className="agent-bubble-copy">
              <div className="agent-source">Here</div>
              <ul className="agent-guide-list" aria-label="Pointers">
                {pointers.map((pointer) => (
                  <li key={pointer.text}>
                    <p>{pointer.text}</p>
                    {usable(pointer.action) && (
                      <button
                        type="button"
                        onClick={() => act(pointer.action as GuideAction)}
                      >
                        {ACTION_LABEL[pointer.action as GuideAction]}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <TeachingNote className="agent-teaching" label="Did you know" />
            <div className="agent-bubble-copy">
              <div className="agent-source">Setup</div>
              <ul className="agent-guide-list" aria-label="Setup help">
                {SETUP_STEPS.map((step) => (
                  <li key={step}>
                    <p>{step}</p>
                  </li>
                ))}
              </ul>
              {hosted && <HostedVoiceNotice />}
            </div>
          </div>
          <footer className="agent-bubble-foot">
            <button type="button" onClick={() => act("setup")}>
              {ACTION_LABEL.setup}
            </button>
            <span className="agent-footnote">Tips only · nothing runs</span>
          </footer>
        </section>
      )}
      <button
        type="button"
        ref={launcher}
        className="agent-launcher"
        aria-label={open ? "Close Genobi guide" : "Open Genobi guide"}
        title={`Genobi · ${working ? "Agent working" : "Guide"}`}
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
          <span>{working ? "Agent working" : "Guide"}</span>
        </span>
      </button>
    </aside>
  );
}
