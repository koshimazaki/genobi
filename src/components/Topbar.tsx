import { useShell } from "../studio/ShellContext";
import AccountBalance from "./AccountBalance";
import Icon from "./Icon";
import ThemePicker from "./ThemePicker";
import Wordmark from "./Wordmark";
import StartupGuide from "../studio/StartupGuide";
import VoiceButton from "../voice/VoiceButton";
import { useEffect } from "react";
import { OPEN_CONNECTION } from "../setup/state";
import "../styles/header-icons.css";
import type { KeySlots } from "../../shared/keys";

/** Where the studio's code lives; the key dialogue links the same place. */
export const SOURCE_URL = "https://github.com/koshimazaki/Genobi";

/**
 * The header: the studio's name, the spend readout, Voice, the theme and
 * the key.
 * Under the key, one quiet line says the studio is open source and can be
 * run elsewhere; it is a link, not a call to action, so it stays muted. The
 * balance's provider label hangs under its amount in the same small type.
 */
export default function Topbar({
  apiKey,
  hasServerKey,
  slots,
  connection,
  keyVerified,
  onVerified,
  revision,
  onOpenKey,
  onWorldBuilder,
}: {
  apiKey: string;
  hasServerKey: boolean;
  /** Which server slots hold a key: a balance for each. */
  slots?: KeySlots;
  /** Moves when a saved server key changes; see `useServerKey`. */
  connection: number;
  keyVerified: boolean;
  onVerified: (verified: boolean) => void;
  revision: string;
  onOpenKey: () => void;
  onWorldBuilder?: () => void;
}) {
  const shell = useShell();
  useEffect(() => {
    window.addEventListener(OPEN_CONNECTION, onOpenKey);
    return () => window.removeEventListener(OPEN_CONNECTION, onOpenKey);
  }, [onOpenKey]);
  return (
    <header className="topbar">
      <Wordmark />
      {shell && <div className="topbar-navigation">{shell.navigation}</div>}
      <div className="topbar-right">
        {!shell && (
          <a
            className="connection-button"
            href="/dual-editor"
            target="_blank"
            rel="noopener noreferrer"
          >
            Dual Swords ↗
          </a>
        )}
        {!shell && onWorldBuilder && (
          <button className="connection-button" onClick={onWorldBuilder}>
            World Builder
          </button>
        )}
        <AccountBalance
          apiKey={apiKey}
          onVerified={onVerified}
          hasServerKey={hasServerKey}
          slots={slots}
          connection={connection}
          revision={revision}
        />
        {shell && <StartupGuide onCamera={() => shell.select("camera")} />}
        <a
          className="header-icon"
          href="/taste"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Taste reference library (opens in a new tab)"
          title="Taste · references, recipes & credits"
        >
          <Icon name="book" size={15} />
        </a>
        <VoiceButton />
        <ThemePicker />
        <div className="connection-group">
          <button
            className="connection-button header-icon"
            aria-label="Settings"
            title="API keys & studio settings"
            onClick={onOpenKey}
          >
            <Icon name="key" size={15} />
            <span className="sr-only">
              {apiKey
                ? "Your key"
                : hasServerKey
                  ? "Server key"
                  : "Connect key"}
            </span>
            <span
              className={`connection-dot ${keyVerified ? "connected" : ""}`}
            />
          </button>
          <a
            className="source-link"
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Run your own</span>
            <span>Open source ↗</span>
          </a>
        </div>
        {/* Ninja is the custom setup and has no Assets rail, so the toggle
            goes and the header icons close up on the right edge, leaving
            more of the row to Ninja's navigation and layout controls. */}
        {shell && shell.preset !== "ninja" && (
          <button
            className="connection-button studio-assets-toggle"
            aria-label="Assets"
            aria-expanded={shell.assetsOpen}
            aria-controls="studio-assets"
            onClick={() => shell.setAssetsOpen(!shell.assetsOpen)}
          >
            <Icon name="grid" size={15} />
            <span>Assets</span>
          </button>
        )}
      </div>
    </header>
  );
}
