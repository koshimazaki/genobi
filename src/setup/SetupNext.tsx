import { licenceStance } from "../../shared/agent-setup";
import { LocalRunInstructions } from "../voice/LocalRunInstructions";
import type { VoiceStatus } from "../voice/api";
import { SetupVoice } from "./SetupVoice";
import { setupRoute, type SetupDraft } from "./state";
import { useHostedStudio } from "../hosted-studio";
import { HostedVoiceNotice } from "../voice/HostedVoiceNotice";

/**
 * The summary step's choices, the run location in a line, and voice. The
 * agent section (`SetupAgent.tsx`) follows it. Local setup happens inline;
 * hosted voice links to the local studio instead of offering installation.
 */
export default function SetupNext({
  draft,
  onChange,
  voiceStatus: status,
}: {
  draft: SetupDraft;
  onChange: (draft: SetupDraft) => void;
  /** Read by the dialog, which also decides the footer's "Save & set up". */
  voiceStatus?: VoiceStatus;
}) {
  const hosted = useHostedStudio();
  const voice = draft.voice ?? false;
  const route = setupRoute(draft.selection);
  const localServer = status && status.maxSeconds > 0;
  const agent = draft.selection.agent;
  const stance = licenceStance(draft.usage);
  return (
    <>
      <div className="setup-summary">
        <span>
          {draft.selection.weights === "open-weights"
            ? "Open creative models"
            : draft.selection.weights === "commercial"
              ? "Commercial models"
              : "Open + commercial models"}
        </span>
        <span>
          {agent === "hermes"
            ? "Hermes · open agent route"
            : agent === "claude"
              ? "Claude Code"
              : agent === "codex"
                ? "Codex"
                : "Agent later"}
        </span>
        <span>
          {route === "local"
            ? "Local generation"
            : route === "cloud"
              ? "Web-based generation"
              : "Local + web generation"}
        </span>
        <span>
          {stance === "commercial"
            ? "Commercial use"
            : stance === "research"
              ? "Research only"
              : "Use not chosen"}
        </span>
      </div>
      <p>
        {route === "local"
          ? "Generation runs on this machine’s ComfyUI; nothing falls back to the cloud."
          : route === "cloud"
            ? "Generation runs with your Comfy key on Comfy Cloud and provider APIs; there is no local model download."
            : "Generation uses whichever route fits the task, local or web."}{" "}
        Paid generation always waits for your approval.
      </p>
      {route !== "cloud" && !localServer && (
        <>
          <h3>Start your local studio</h3>
          <p>
            Local generation, voice and agents run from the local studio. This
            website does not install or connect a desktop runner.
          </p>
          <LocalRunInstructions expanded />
        </>
      )}
      {hosted ? (
        <HostedVoiceNotice />
      ) : (
        <>
          <label className="setup-voice-choice">
            <input
              type="checkbox"
              checked={voice}
              onChange={(event) =>
                onChange({ ...draft, voice: event.target.checked })
              }
            />
            Add local voice, too
            <small>
              Optional. Nothing installs until you choose Save &amp; set up.
            </small>
          </label>
          {!voice && (
            <p role="status">
              Continue with typed prompts or your local agent harness. Voice is
              optional and can be added later.
            </p>
          )}
          {voice && (
            <SetupVoice
              status={status}
              // The local section above already shows them on other routes.
              instructions={route === "cloud"}
              folder={draft.voiceFolder ?? ""}
              onFolder={(voiceFolder) => onChange({ ...draft, voiceFolder })}
              model={draft.voiceModel}
              onModel={(voiceModel) => onChange({ ...draft, voiceModel })}
            />
          )}
        </>
      )}
    </>
  );
}
