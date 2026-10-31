import { ActivitySettings } from "../activity/ActivitySettings";
import { AgentConnectionSettings } from "./AgentConnectionSettings";
import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./Icon";
import { SOURCE_URL } from "./Topbar";
import { useModalDialog } from "./useModalDialog";
import { KeySlot, LocalAgentStatus, useLocalKeys } from "./LocalKeys";
import RunLocationField from "./RunLocationField";
import { PageKeyForm } from "./PageKeyForm";
import type { KeysStatus } from "../../shared/keys";
import "../styles/studio-settings.css";

function SettingsSection({
  title,
  subtitle,
  open = false,
  children,
}: {
  title: string;
  subtitle: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="settings-section" open={open}>
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <Icon name="chevron" />
      </summary>
      <div className="settings-section__body">{children}</div>
    </details>
  );
}

/** One settings surface; key custody follows the connected server's capabilities. */
export default function KeyDialog({
  value,
  onSave,
  onClose,
  serverKey,
  onServerKey,
  needsKey = false,
}: {
  value: string;
  onSave: (key: string) => void;
  onClose: () => void;
  serverKey: boolean;
  /** Status only; saved=false marks the opening read from another window. */
  onServerKey?: (status: KeysStatus, saved?: boolean) => void;
  /** A page-key run is waiting to be polled with its original key. */
  needsKey?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useModalDialog(ref);
  const { keys, setKeys, runners } = useLocalKeys();
  const saved = (next: KeysStatus) => {
    setKeys(next);
    onServerKey?.(next);
  };
  const read = useRef(onServerKey);
  read.current = onServerKey;
  useEffect(() => {
    if (keys) read.current?.(keys, false);
  }, [keys]);
  const connect = (key: string) => {
    onSave(key);
    onClose();
  };
  const keychain = keys?.keychain === true;
  return (
    <dialog
      ref={ref}
      className="key-dialog studio-settings"
      aria-labelledby="studio-settings-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="section-eyebrow">CONNECTIONS & PREFERENCES</span>
          <h2 id="studio-settings-title">Studio settings</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close settings"
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="settings-intro">
        Choose where models run and which keys they use. Open a section when you
        need it.
      </p>
      {(needsKey || (keychain && Boolean(value))) && (
        <VisitKey waiting={needsKey} onSave={connect} />
      )}
      <div className="settings-grid">
        <SettingsSection
          title="Studio setup"
          subtitle="Local ComfyUI, Comfy Cloud or deployment"
          open
        >
          <RunLocationField />
          <p>
            Connect your Comfy API key for Router, Cloud or your deployment.
            Deployment GPU time is billed to its owning Comfy workspace.
          </p>
          {keychain && keys ? (
            <KeySlot
              kind="comfy"
              label="Comfy API key"
              placeholder="comfyui-…"
              status={keys}
              onChange={saved}
            />
          ) : (
            <PageKeyForm kind="comfy" value={value} onSave={connect} />
          )}
          <p className="settings-note">
            {keychain
              ? "Saved in this machine’s macOS Keychain. This page receives connection status only."
              : "One key at a time for this visit. Kept in page memory; cleared on refresh or disconnect."}
          </p>
        </SettingsSection>
        <SettingsSection
          title="BFL key"
          subtitle="Override compatible FLUX models"
          open
        >
          <p>
            Use BFL direct for FLUX video, image API models and upscaling. A
            connected BFL key takes priority over the saved Comfy key for these
            models.
          </p>
          <p>
            LTX and open Comfy workflows keep their Comfy route. Local workflows
            stay local.
          </p>
          {keychain && keys ? (
            <KeySlot
              kind="bfl"
              label="BFL API key"
              placeholder="Enter your BFL key"
              status={keys}
              onChange={saved}
            />
          ) : (
            <PageKeyForm kind="bfl" value={value} onSave={connect} />
          )}
          <p className="settings-note">
            {keychain
              ? "Remove the BFL key to return compatible models to Comfy. An environment key is managed on the server."
              : "Connecting BFL replaces this visit’s key. Reconnect Comfy to use its cloud models."}
          </p>
        </SettingsSection>
        <SettingsSection
          title="Agents & studio connection"
          subtitle="Hermes, external agents and hosted pairing"
        >
          <p>
            Running Genobi locally and running models in the cloud are
            independent choices. Pairing is only needed to control a local agent
            from the hosted studio.
          </p>
          <LocalAgentStatus runners={runners} />
          <AgentConnectionSettings />
        </SettingsSection>
        <SettingsSection
          title="Activity & display"
          subtitle="History, Genobi bubble and setup guide"
        >
          <ActivitySettings />
        </SettingsSection>
      </div>
      <p className="key-footnote">
        {keys && !keychain
          ? "This server has no Keychain. Environment keys can be configured on the server. "
          : serverKey && !keychain
            ? "Disconnecting returns to the server connection. "
            : ""}
        Library clips need no key. Live cloud runs spend your credits.{" "}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          read the code
        </a>{" "}
        or run your own studio.
      </p>
    </dialog>
  );
}

/**
 * A run started with a key for this visit is polled with that key only: a
 * Keychain key may be another account, where the run would read as lost. So
 * the local dialogue keeps a way to hand the page that key again, in page
 * memory as before, and to forget it once the run is saved.
 */
export function VisitKey({
  waiting,
  onSave,
}: {
  waiting: boolean;
  onSave: (key: string) => void;
}) {
  if (!waiting)
    return (
      <div className="key-visit">
        <p>
          A key for this visit is connected; runs use it, not the saved key,
          until you forget it.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => onSave("")}
          >
            Forget the visit’s key
          </button>
        </div>
      </div>
    );
  return (
    <form
      className="key-visit"
      onSubmit={(e) => {
        e.preventDefault();
        const key = new FormData(e.currentTarget).get("apiKey");
        onSave(typeof key === "string" ? key.trim() : "");
      }}
    >
      <span className="section-eyebrow">RUN IN PROGRESS</span>
      <p>
        A run started with a key for this visit is waiting for its result. Enter
        that key again to save it. It stays in this page’s memory and is not
        saved in the Keychain.
      </p>
      <label htmlFor="visit-key">The key that run started with</label>
      <input
        id="visit-key"
        type="password"
        autoComplete="off"
        name="apiKey"
        placeholder="Enter that key"
        maxLength={512}
        minLength={8}
        required
      />
      <div className="dialog-actions">
        <button className="primary-button" type="submit">
          Resume the run <Icon name="arrow" />
        </button>
      </div>
    </form>
  );
}
