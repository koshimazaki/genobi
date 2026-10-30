import { useShell } from "../studio/ShellContext";
import { presets } from "../studio/presets";
import AgentSessionPanel from "../agent/AgentSessionPanel";
import SpawnAgentDialog from "../agent/SpawnAgentDialog";
import GenobiDeck from "../deck/GenobiDeck";
import { goHome } from "../director/leave-guard";
import Spinner from "./Spinner";
import { useBusy } from "../busy";

/**
 * The studio's name as its home link. Its click saves and goes home without
 * the browser's leave-page dialog when the work is saved (`leave-guard.ts`);
 * `navigate` is for tests.
 */
export function HomeLink({ navigate }: { navigate?: (url: string) => void }) {
  return (
    <a
      href="/"
      className="brand-home"
      aria-label="Genobi home"
      onClick={(event) => void goHome(event, navigate)}
    >
      Genobi
    </a>
  );
}

/**
 * The studio's own name, in the header.
 *
 * The wordmark says the same words as the document title:
 * `tests/wordmark.test.tsx` reads
 * both, and a rename that only reaches one of them fails there. The mode tag
 * beside it names the part of the studio in view, not a second brand. While
 * anything is working, a sand spinner runs beside the name. The spawn dialog
 * lives here, beside the Genobi bubble, and so does the footer deck: it reads
 * the session this bubble's panel publishes, so the two are mounted together
 * (fixed to the bottom of the window, it never moves the header).
 */
export default function Wordmark() {
  const shell = useShell();
  const busy = useBusy();
  const number = shell
    ? String(presets.findIndex((p) => p.id === shell.preset) + 1).padStart(
        2,
        "0",
      )
    : "";
  return (
    <div className="wordmark">
      <AgentSessionPanel />
      <SpawnAgentDialog />
      <GenobiDeck />
      <HomeLink />
      {busy && <Spinner name="sand" className="brand-busy" />}
      <span className="brand-beta">
        {shell ? `/ ${number}` : "Open-source video studio"}
      </span>
    </div>
  );
}
