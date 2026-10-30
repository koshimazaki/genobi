import type { HarnessSignIn } from "../../shared/agent-runner-setting";
import type { VoiceStatus } from "../voice/api";
import type { VoiceInstallSnapshot } from "../voice/install-store";
import type { AgentReadiness } from "./handoff";
import {
  saveAndStart,
  startAnyway,
  type SetupStartSnapshot,
} from "./start-store";
import type { SetupDraft } from "./state";
import { SUMMARY_STEP } from "./SetupChoices";

/**
 * Voice is ticked, it is not set up yet, and the installer's own check
 * (`GET /api/voice/setup`: Python 3.11 and ffmpeg) says it can install here.
 */
export function offersVoiceInstall(
  draft: SetupDraft,
  status: VoiceStatus | undefined,
  install: VoiceInstallSnapshot,
) {
  return (
    !!draft.voice &&
    !!status &&
    status.maxSeconds > 0 &&
    !status.available &&
    install.info?.supported === true &&
    install.state?.phase !== "ready"
  );
}

/** The summary's one primary action, as it reads now. */
function primaryLabel(
  voice: boolean,
  start: SetupStartSnapshot,
  install: VoiceInstallSnapshot,
) {
  if (start.phase === "starting") return "Starting Genobi…";
  if (start.phase === "voice" || install.pending || install.state?.busy)
    return "Setting up voice…";
  return voice ? "Save & set up" : "Save & start Genobi";
}

/**
 * The setup dialog's buttons. On the summary the single primary is
 * "Save & set up" (voice ticked on a server that can install it) or
 * "Save & start Genobi": it saves the choices, installs voice when ticked
 * (that click is the explicit confirmation), then starts the configured
 * harness as one Genobi session (`start-store.ts`). When the harness cannot
 * start, the summary shows why and the primary only installs voice, if that.
 */
export function SetupFooter({
  step,
  draft,
  voiceStatus,
  install,
  agent,
  signIn,
  start,
  onBack,
  onClose,
  onFinish,
}: {
  step: number;
  draft: SetupDraft;
  voiceStatus?: VoiceStatus;
  install: VoiceInstallSnapshot;
  agent: AgentReadiness;
  /** The sign-in rows the summary read, passed to the start's check. */
  signIn?: readonly HarnessSignIn[] | null;
  start: SetupStartSnapshot;
  onBack: () => void;
  onClose: () => void;
  onFinish: (connect?: boolean) => void;
}) {
  const voice = offersVoiceInstall(draft, voiceStatus, install);
  const primary = voice || agent.ready;
  const label = primaryLabel(voice, start, install);
  const working =
    start.phase === "starting" ||
    start.phase === "voice" ||
    install.pending ||
    !!install.state?.busy;
  const onStarted = () => onFinish();
  return (
    <footer className="setup-footer">
      {step > 0 && <button onClick={onBack}>← Back</button>}
      {step === SUMMARY_STEP ? (
        <>
          <button onClick={() => onFinish()}>Save & explore</button>
          {!primary && draft.selection.execution !== "local" && (
            <button className="setup-primary" onClick={() => onFinish(true)}>
              Save & connect provider
            </button>
          )}
          {start.phase === "voice-failed" && agent.ready ? (
            <button
              className="setup-primary"
              onClick={() => startAnyway(draft, { signIn, onStarted })}
            >
              Start Genobi anyway
            </button>
          ) : (
            primary && (
              <button
                className="setup-primary"
                disabled={working}
                onClick={() =>
                  saveAndStart(draft, {
                    installVoice: voice,
                    startAgent: agent.ready,
                    voiceConnected: !!voiceStatus?.available,
                    signIn,
                    onStarted,
                  })
                }
              >
                {label}
              </button>
            )
          )}
        </>
      ) : (
        <button onClick={onClose}>Explore first</button>
      )}
    </footer>
  );
}
