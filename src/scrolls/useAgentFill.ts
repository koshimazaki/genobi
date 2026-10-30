import { useEffect, useRef, useState } from "react";
import { DESCRIPTION_MAX, descriptionCut } from "../../shared/scrolls/fill";
import {
  BUSY,
  FINISHED,
  LOCAL_ONLY,
  STARTING,
  askToFill,
  fillExamples,
  pollFill,
} from "./agent-fill";
import type { useScrolls } from "./useScrolls";

/** As long as the server keeps a fill request (FILL_TTL_MS). */
export const FILL_WAIT_MS = 20 * 60_000;
const POLL_MS = 2000;

/** Said after Send when the script stood in for a longer description. */
export const SCRIPT_CUT = `The first ${DESCRIPTION_MAX.toLocaleString("en-GB")} characters of the script were sent.`;

/**
 * Describe the video's Send and the wait for the agent's panels. It lives
 * with the Scrolls workspace, not the Script view, so switching to the
 * storyboard keeps waiting and the panels land where the person is looking.
 * The wait ends when the panels arrive, when the session the Send started
 * ends without them, or when the request expires.
 */
export function useAgentFill(s: ReturnType<typeof useScrolls>) {
  const scrolls = useRef(s);
  scrolls.current = s;
  const [waiting, setWaiting] = useState<{
    id: string;
    session: string;
    since: number;
  }>();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!waiting) return;
    let stopped = false,
      polling = false;
    const done = (said: string) => {
      setWaiting(undefined);
      setStatus(said);
      // Said on the storyboard too, where the panels land.
      scrolls.current.setMessage(said);
    };
    const timer = setInterval(async () => {
      if (polling || stopped) return;
      if (Date.now() - waiting.since > FILL_WAIT_MS)
        return done(
          "No panels arrived from Genobi. Send again to ask once more.",
        );
      polling = true;
      try {
        const step = await pollFill(waiting.id, waiting.session);
        if (stopped || step.kind === "waiting") return;
        done(
          step.kind === "panels"
            ? scrolls.current.fill(step.documentId, step.panels)
            : step.kind === "finished"
              ? FINISHED
              : "The fill request expired before Genobi sent panels.",
        );
      } catch {
        // A lost poll is read again on the next tick.
      } finally {
        polling = false;
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waiting]);
  /** `fromScript`: the description field was empty, so the script went. */
  async function send(description: string, fromScript = false) {
    if (sending) return;
    setSending(true);
    setStatus("");
    try {
      const { bundle, references } = scrolls.current;
      const outcome = await askToFill(
        description,
        bundle.document,
        fillExamples(bundle.document, references),
      );
      if (outcome.kind === "sent") {
        setWaiting({
          id: outcome.requestId,
          session: outcome.session.id,
          since: Date.now(),
        });
        setStatus(
          `Sent to Genobi. Its panels appear on the storyboard when it is done; follow it in the bubble.${
            fromScript && descriptionCut(description) ? ` ${SCRIPT_CUT}` : ""
          }`,
        );
      } else
        setStatus(
          outcome.kind === "busy"
            ? BUSY
            : outcome.kind === "starting"
              ? STARTING
              : outcome.kind === "local-only"
                ? LOCAL_ONLY
                : "Nothing was sent.",
        );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not ask Genobi.",
      );
    } finally {
      setSending(false);
    }
  }
  return { send, sending, waiting: !!waiting, status };
}
