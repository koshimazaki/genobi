import { useEffect, useRef, useState } from "react";
import { setupRequest, readVoiceSetup, type VoiceSetupInfo } from "./setup-api";
import "./voice-setup.css";
import { LocalRunInstructions } from "./LocalRunInstructions";
import {
  adoptVoiceInstall,
  cancelVoiceInstall,
  findVoiceModels,
  startVoiceInstall,
  useVoiceInstall,
} from "./install-store";
import {
  gigabytes,
  RUNTIME_SIZE,
  VoiceInstallProgress,
} from "./VoiceInstallProgress";
import { FoundVoiceModels } from "./FoundVoiceModels";
import "./voice-starter.css";
export function VoiceSetup({
  onReady,
  onClose,
}: {
  onReady: () => void;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<VoiceSetupInfo>();
  const [folder, setFolder] = useState("");
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [check, setCheck] = useState(0);
  const install = useVoiceInstall();
  const state = install.state;
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError("");
    readVoiceSetup(controller.signal).then(
      (value) => {
        if (!active) return;
        setInfo(value);
        setFolder(value.folder);
        // A running install (started here or from setup) keeps its progress.
        adoptVoiceInstall(value);
        // Look for a model already on this machine before offering a download.
        if (!value.state.busy && value.state.phase !== "ready")
          void findVoiceModels();
      },
      (failure: Error) => {
        if (active && failure.name !== "AbortError") setError(failure.message);
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [check]);
  useEffect(() => {
    confirm.current?.focus();
  }, [info]);
  const pending = choosing || install.pending;
  const busy = pending || !!state?.busy;
  const ready = state?.phase === "ready";
  const message = error || install.error || state?.error;
  return (
    <div
      id="voice-overlay"
      className="voice-setup"
      role="dialog"
      aria-labelledby="voice-setup-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="voice-setup-head">
        <span className="voice-setup-mark" aria-hidden="true">
          ◉
        </span>
        <button aria-label="Close voice setup" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 id="voice-setup-title">
        {ready ? "Your voice is ready" : "Install Voice Mode?"}
      </h2>
      <p>
        Speak naturally. Transcribe on your machine, then send your words to
        your agent or a tool.
      </p>
      {info && (
        <>
          <div className="voice-model-card">
            <strong>{info.model}</strong>
            <span>{gigabytes(info.bytes)} model · Apache 2.0</span>
            <small>
              The voice runtime downloads separately (about {RUNTIME_SIZE}).
              Installation may take several minutes.
            </small>
          </div>
          {!state?.busy && !ready && (
            <label className="voice-folder">
              Install inside this folder
              <div>
                <input
                  aria-label="Voice installation folder"
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  disabled={pending}
                />
                {info.browse && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setChoosing(true);
                      setError("");
                      try {
                        const value = await setupRequest<{ folder: string }>(
                          "/folder",
                          "POST",
                          { token: info.token },
                        );
                        setFolder(value.folder);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setChoosing(false);
                      }
                    }}
                  >
                    Choose…
                  </button>
                )}
              </div>
              <small>
                Genobi creates its own folder here and saves the setup for next
                time.
              </small>
            </label>
          )}
          {!state?.busy && !ready && (
            <FoundVoiceModels
              found={install.found}
              searching={!!install.searching}
              disabled={!info.supported || busy || !folder.trim()}
              onUse={(model) => void startVoiceInstall(folder, model)}
            />
          )}
          <VoiceInstallProgress
            state={state}
            total={info.bytes}
            pending={pending}
            onCancel={() => void cancelVoiceInstall()}
          />
          {!info.supported && <p role="status">{info.reason}</p>}
        </>
      )}
      {message && (
        <p role="alert" className="voice-setup-error">
          {message}
        </p>
      )}
      <div className="voice-setup-actions">
        {ready ? (
          <button className="primary" onClick={onReady}>
            Start using Voice Mode
          </button>
        ) : state?.busy ? null : (
          <>
            <button onClick={onClose}>Not now</button>
            <button
              ref={confirm}
              // A found model is the first offer; a download is then secondary.
              className={install.found?.length ? undefined : "primary"}
              disabled={
                !info?.supported ||
                busy ||
                !folder.trim() ||
                // The search answers first: a found model is offered before a download.
                !install.found
              }
              onClick={() => void startVoiceInstall(folder)}
            >
              {pending
                ? "Preparing…"
                : !install.found
                  ? "Looking on this machine…"
                  : "Install new"}
            </button>
          </>
        )}
      </div>
      {!info && !error && <p role="status">Checking your machine…</p>}
      {((!info && error) || (info && !info.supported)) && (
        <button onClick={() => setCheck((value) => value + 1)}>
          Retry setup check
        </button>
      )}
      {!info && error && <LocalRunInstructions />}
    </div>
  );
}
