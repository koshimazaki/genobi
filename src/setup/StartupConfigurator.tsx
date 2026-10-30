import { useEffect, useRef, useState } from "react";
import { GenobiMark } from "../components/GenobiMark";
import { TeachingNote } from "../teachings/TeachingNote";
import SetupChoices, {
  CONNECT_STEP,
  questions,
  SUMMARY_STEP,
} from "./SetupChoices";
import SetupConnect from "./SetupConnect";
import SetupNext from "./SetupNext";
import { SetupAgentView, useSetupAgent } from "./SetupAgent";
import { resetSetupStart, useSetupStart } from "./start-store";
import { offersVoiceInstall, SetupFooter } from "./SetupFooter";
import { voiceStatus, type VoiceStatus } from "../voice/api";
import {
  checkVoiceInstall,
  onVoiceReady,
  useVoiceInstall,
} from "../voice/install-store";
import {
  hasSeenSetup,
  OPEN_CONNECTION,
  OPEN_SETUP,
  rememberSetup,
  saveSetup,
  setupDraft,
} from "./state";
import {
  clearSetupSession,
  keepSetupSession,
  restoreSetupSession,
} from "./session-draft";
import "./setup.css";

export default function StartupConfigurator() {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // Setup this tab was in before a reload comes back where it was.
  const [restored] = useState(() =>
    window.parent === window ? restoreSetupSession(SUMMARY_STEP) : undefined,
  );
  const [open, setOpen] = useState(
    () => window.parent === window && (!!restored || !hasSeenSetup()),
  );
  const [step, setStep] = useState(restored?.step ?? 0);
  const [draft, setDraft] = useState(() => restored?.draft ?? setupDraft());
  const [voice, setVoice] = useState<VoiceStatus>();
  const [voiceCheck, setVoiceCheck] = useState(0);
  const install = useVoiceInstall();
  const start = useSetupStart();
  // The configured harness's status and sign-in, read on the summary step.
  const agent = useSetupAgent(open && step === SUMMARY_STEP, draft);
  // Reading status never installs or asks for the microphone. A finished
  // install (VOICE_READY) reads it again so the summary says connected.
  useEffect(() => {
    if (!open || step !== SUMMARY_STEP) return;
    const controller = new AbortController();
    void voiceStatus(controller.signal).then(setVoice, () => {});
    return () => controller.abort();
  }, [open, step, voiceCheck]);
  useEffect(
    () => onVoiceReady(window, () => setVoiceCheck((value) => value + 1)),
    [],
  );
  // With voice ticked, read the installer's prerequisites too: "Save & set
  // up" is offered only when the server says it can install here.
  useEffect(() => {
    if (!open || step !== SUMMARY_STEP || !draft.voice) return;
    const controller = new AbortController();
    void checkVoiceInstall(controller.signal);
    return () => controller.abort();
  }, [open, step, draft.voice, voiceCheck]);
  useEffect(() => {
    const show = () => {
      setDraft(setupDraft());
      resetSetupStart();
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETUP, show);
    return () => window.removeEventListener(OPEN_SETUP, show);
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (open && node && !node.open) node.showModal();
    if (!open) node?.close();
    return () => node?.close();
  }, [open]);
  useEffect(() => {
    if (open) title.current?.focus();
  }, [open, step]);
  // Every step and choice, never a key (session-draft.ts).
  useEffect(() => {
    if (open) keepSetupSession({ step, draft });
  }, [open, step, draft]);
  function close() {
    clearSetupSession();
    rememberSetup();
    dialog.current?.close();
    setOpen(false);
  }
  function finish(connect = false) {
    saveSetup(draft);
    close();
    if (connect) window.dispatchEvent(new Event(OPEN_CONNECTION));
  }
  return (
    <dialog
      ref={dialog}
      className="genobi-setup"
      aria-labelledby="setup-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      {open && (
        <>
          <header className="setup-header">
            <span>GENOBI / YOUR STUDIO</span>
            <button
              className="setup-close"
              aria-label="Skip setup for now"
              onClick={close}
            >
              ×
            </button>
          </header>
          {/* Beside the step at desktop widths (landscape), above it on a phone. */}
          <div className="setup-aside">
            <div className="setup-character" aria-hidden="true">
              <div className="setup-halo" />
              <GenobiMark />
            </div>
            {step > 0 && (
              <div
                className="setup-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={SUMMARY_STEP}
                aria-valuenow={step}
                aria-label={`Setup step ${step} of ${SUMMARY_STEP}`}
              >
                {questions.slice(1).map((_, index) => (
                  <span key={index} data-done={index + 1 <= step} />
                ))}
              </div>
            )}
            {/* Desktop widths only (teachings.css): it must not move the step. */}
            <TeachingNote className="setup-teaching" />
          </div>
          <section key={step} className="setup-step">
            <p className="setup-eyebrow">
              {step === 0
                ? "HI, I’M GENOBI"
                : step === SUMMARY_STEP
                  ? "READY WHEN YOU ARE"
                  : "LET’S MAKE THIS YOURS"}
            </p>
            <h2 id="setup-title" tabIndex={-1} ref={title}>
              {questions[step]}
            </h2>
            {step === 0 ? (
              <>
                <p>
                  I’ll help you choose your models, agent and where things run.
                  Keep it open, use cloud tools, or mix the two.
                </p>
                <p className="setup-footnote">
                  A few choices. No downloads or paid runs until you ask.
                </p>
                <button className="setup-primary" onClick={() => setStep(1)}>
                  Let’s set up my studio <span aria-hidden="true">↗</span>
                </button>
              </>
            ) : step === CONNECT_STEP ? (
              <SetupConnect
                draft={draft}
                onHermes={(hermes) =>
                  setDraft((value) => ({ ...value, hermes }))
                }
                next={() => setStep((value) => value + 1)}
              />
            ) : step === SUMMARY_STEP ? (
              <>
                <SetupNext
                  draft={draft}
                  onChange={setDraft}
                  voiceStatus={voice}
                />
                <SetupAgentView
                  draft={draft}
                  installVoice={offersVoiceInstall(draft, voice, install)}
                  readiness={agent.readiness}
                  rows={agent.rows}
                  start={start}
                  message={agent.message}
                  onSignIn={() => void agent.signIn()}
                  onCheck={agent.recheck}
                  checked={agent.checked}
                  profile={agent.profile}
                  onSetUpHermes={() => void agent.setUpHermes()}
                />
              </>
            ) : (
              <SetupChoices
                step={step}
                draft={draft}
                onChange={setDraft}
                next={() => setStep((value) => value + 1)}
              />
            )}
          </section>
          <SetupFooter
            step={step}
            draft={draft}
            voiceStatus={voice}
            install={install}
            agent={agent.readiness}
            signIn={agent.rows}
            start={start}
            onBack={() => setStep((value) => value - 1)}
            onClose={close}
            onFinish={finish}
          />
        </>
      )}
    </dialog>
  );
}
