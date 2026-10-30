import { useEffect } from "react";
import { InstallWait } from "./InstallWait";
import { LocalRunInstructions } from "../voice/LocalRunInstructions";
import type { VoiceStatus } from "../voice/api";
import {
  cancelVoiceInstall,
  findVoiceModels,
  useVoiceInstall,
} from "../voice/install-store";
import {
  RUNTIME_SIZE,
  VoiceInstallProgress,
} from "../voice/VoiceInstallProgress";

/** Qwen3-ASR-0.6B's pinned size, shown before the grant read gives the exact one. */
const MODEL_GB = "1.9 GB";

/**
 * Setup's voice section. Ticking voice installs nothing: it looks for a
 * verified Qwen3-ASR already on this machine, and the footer's "Save & set
 * up" is the confirming click that uses it (or downloads one when none was
 * found or "Download a new copy" is chosen). The installer's own progress
 * shows in place, with what is being installed said in plain sentences
 * while it runs (`InstallWait.tsx`). The mic’s manual panel stays the advanced path.
 * Nothing here asks for the microphone; the browser asks on the first press
 * of the mic.
 */
export function SetupVoice({
  status,
  instructions,
  folder,
  onFolder,
  model,
  onModel,
}: {
  status?: VoiceStatus;
  /** Show the clone-and-run steps here when no other section does. */
  instructions: boolean;
  folder: string;
  onFolder: (folder: string) => void;
  /** The found model to use; undefined is the first, null a new download. */
  model?: string | null;
  onModel: (model: string | null) => void;
}) {
  const install = useVoiceInstall();
  const state = install.state;
  const ready = state?.phase === "ready";
  const running = install.pending || !!state?.busy;
  const installable = !!status && !status.available && status.maxSeconds > 0;
  useEffect(() => {
    if (installable) void findVoiceModels();
  }, [installable]);
  const found = install.found;
  const using =
    model === null
      ? undefined
      : (found?.find((item) => item.folder === model) ?? found?.[0]);
  return (
    <section className="setup-voice" aria-labelledby="setup-voice-title">
      <h3 id="setup-voice-title">Local voice</h3>
      {!status ? (
        <p role="status">Checking local voice…</p>
      ) : status.available ? (
        <p role="status">
          Voice is connected. Press the mic in the studio when you want to
          speak; your browser asks for the microphone the first time.
        </p>
      ) : status.maxSeconds === 0 ? (
        <>
          <p role="status">
            Local voice is unavailable here. Run Genobi on your computer to add
            it.
          </p>
          {instructions && <LocalRunInstructions expanded />}
        </>
      ) : (
        <>
          <p>
            <strong>Save &amp; set up</strong> first looks for Qwen3-ASR-0.6B
            already on this machine and uses a verified copy; only when none is
            found does it download one (about {MODEL_GB}, Apache 2.0). Then it
            installs the voice runtime (about {RUNTIME_SIZE}) and loads the
            model so the mic is live.
          </p>
          {!install.info && !install.error && (
            <p role="status">Checking what this machine needs…</p>
          )}
          {install.info && !install.info.supported && (
            <p role="status">{install.info.reason}</p>
          )}
          {install.info?.supported && !running && !ready && (
            <>
              {!found ? (
                <p role="status">
                  Looking for Qwen3-ASR already on this machine…
                </p>
              ) : found.length ? (
                <fieldset className="setup-voice__found">
                  <legend>Found on this machine, checked</legend>
                  {found.map((item) => (
                    <label key={item.folder}>
                      <input
                        type="radio"
                        name="setup-voice-model"
                        checked={using?.folder === item.folder}
                        onChange={() => onModel(item.folder)}
                      />
                      Use this one <code>{item.label}</code>
                    </label>
                  ))}
                  <label>
                    <input
                      type="radio"
                      name="setup-voice-model"
                      checked={!using}
                      onChange={() => onModel(null)}
                    />
                    Download a new copy
                  </label>
                </fieldset>
              ) : (
                <p role="status">
                  No verified copy is on this machine, so Save &amp; set up
                  downloads it.
                </p>
              )}
              <label className="voice-folder">
                Install inside this folder
                <input
                  aria-label="Voice installation folder"
                  value={folder}
                  placeholder={install.info.folder}
                  onChange={(event) => onFolder(event.target.value)}
                />
                <small>
                  Leave empty for {install.info.folder}. Genobi creates its own
                  folder there.
                </small>
              </label>
            </>
          )}
          <InstallWait kind="voice" active={running}>
            <VoiceInstallProgress
              state={state}
              total={install.info?.bytes ?? 0}
              pending={install.pending}
              onCancel={() => void cancelVoiceInstall()}
            />
          </InstallWait>
          {(install.error || state?.error) && (
            <p role="alert" className="voice-setup-error">
              {install.error || state?.error}
            </p>
          )}
          {ready && (
            <p role="status">Voice is installed. Connecting the mic…</p>
          )}
          <p>
            For manual voice setup, close setup and use the mic in the studio
            header.
          </p>
        </>
      )}
    </section>
  );
}
