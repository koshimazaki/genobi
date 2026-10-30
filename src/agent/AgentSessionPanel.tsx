import { recordBrowserActivity } from "../activity/store";
import { useEffect, useState } from "react";
import type { AgentSession } from "../../shared/agent-session";
import { isAgentActive } from "../../shared/agent-session-events";
import { readAgentSession, stopAgentSession } from "./api";
import { retryPendingHandoffs } from "./approved-jobs";
import {
  publishAgentSession,
  useShownAgentSession,
  showAgentSession,
  shownAgentSession,
} from "./useAgentSession";
import {
  AGENT_REQUEST_HEADER,
  AGENT_SESSION_ID,
} from "../../shared/agent-session-events";
import { AgentBubble } from "./AgentBubble";
import { AgentApprovals } from "./AgentApprovals";
import { approvable } from "../../shared/agent-approval";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";
import { followDirectorPicks } from "./studio-context";

const POLL_MS = 1500;

/** The session stays mounted and polling when its bubble is tucked away. */
export default function AgentSessionPanel() {
  const shown = useShownAgentSession();
  useEffect(() => {
    const controller = new AbortController();
    const id = new URL(window.location.href).searchParams.get("agentSession");
    if (id && AGENT_SESSION_ID.test(id)) {
      void readAgentSession(id, controller.signal).then(
        showAgentSession,
        () => {},
      );
    } else {
      // Hosted relay can restore the latest owned session after a reload. Local has no list route.
      void fetch("/api/agent/sessions", {
        headers: { [AGENT_REQUEST_HEADER]: "1" },
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : undefined))
        .then(
          (v) => {
            if (
              v?.session?.id &&
              !controller.signal.aborted &&
              !shownAgentSession()
            )
              showAgentSession(v.session);
          },
          () => {},
        );
    }
    return () => controller.abort();
  }, []);
  // Assets selected in the Director become picks a session can name (#23).
  useEffect(() => followDirectorPicks(studioStore), []);
  useEffect(
    () =>
      studioStore.subscribe((now, before) => {
        if (
          now.director.bundle &&
          now.director.bundle !== before.director.bundle
        )
          void recordBrowserActivity("project-revision", "succeeded");
      }),
    [],
  );
  if (!shown) return <AgentBubble />;
  return <Panel key={shown.id} initial={shown} />;
}

function Panel({ initial }: { initial: AgentSession }) {
  const shell = useShell();
  const [session, setSession] = useState(initial);
  const [error, setError] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const [failures, setFailures] = useState(0);
  const active = isAgentActive(session.status);
  // A message sent from elsewhere (voice, Box 1.8) answers with the session
  // as it now stands; the next poll builds on that.
  useEffect(() => setSession(initial), [initial]);
  useEffect(() => publishAgentSession(session), [session]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      readAgentSession(session.id, controller.signal).then(
        (next) => {
          setSession(next);
          setError(undefined);
          // The studio answers again: hand over any approved run waiting.
          retryPendingHandoffs();
        },
        (failure: Error) => {
          if (failure.name === "AbortError") return;
          setError(failure.message);
          setFailures((n) => n + 1);
        },
      );
    }, POLL_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, session, failures]);

  const stop = async () => {
    setStopping(true);
    try {
      setSession(await stopAgentSession(session.id));
      setError(undefined);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setStopping(false);
    }
  };

  return (
    <AgentBubble
      session={session}
      error={error}
      stopping={stopping}
      onStop={() => void stop()}
      attention={!!session.approvals?.some((a) => approvable(a))}
      approvals={<AgentApprovals session={session} onChange={setSession} />}
      onAssets={
        shell
          ? () => {
              shell.select("director");
              studioStore.getState().actions.workspace({ drawerOpen: true });
            }
          : undefined
      }
    />
  );
}
