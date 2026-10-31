import { useShell } from "../studio/ShellContext";
import { WorkspaceHeading } from "../studio/WorkspaceHeading";
import ThemePicker from "../components/ThemePicker";
import RegenerateAction from "./RegenerateAction";
import GenerateVersionAction from "./GenerateVersionAction";

/**
 * The Director's and Editor's title row. Its file actions end with the way
 * across: "Go to Editor ↗" in the Director, "Back to Director" in the Editor
 * (`switchMode`, the Director's own `setAdvanced`, which also keeps the
 * shell's preset in step). Secondary buttons; the pink primary marks Render
 * MP4 and the agent actions. Every button keeps one row height, so the
 * toolbar does not move between the two (AGENTS.md, stable dimensions).
 */
export default function ComposerHeader({
  versionRequest,
  simple = false,
  name,
  busy,
  transportBusy,
  open,
  save,
  render,
  switchMode,
}: {
  versionRequest?: number;
  simple?: boolean;
  name?: string;
  busy: boolean;
  transportBusy: boolean;
  open: () => void;
  save: () => void;
  render: () => void;
  /** Director to Editor and back; absent, no switch is shown. */
  switchMode?: () => void;
}) {
  const shell = useShell();
  return (
    <>
      {!shell && (
        <header className="dir-header">
          <a className="dir-brand" href="/">
            GENOBI <span>DIRECTOR</span>
          </a>
          <span className="dir-version">COMPOSER / 01</span>
          <div className="dir-spacer" />
          <a href="/">Generation studio ↗</a>
          <ThemePicker />
        </header>
      )}
      <section className="dir-heading">
        <WorkspaceHeading
          title={
            shell?.preset === "editor" || (!shell && !simple)
              ? "Editor"
              : "Director"
          }
          icon={
            shell?.preset === "editor" || (!shell && !simple)
              ? "sliders"
              : "play"
          }
          purpose={
            shell?.preset === "editor" || (!shell && !simple)
              ? "Arrange clips / Edit timing and sound."
              : "Remix a template / Direct your story."
          }
          project={name}
        />
        <div className="dir-file-actions">
          <GenerateVersionAction
            disabled={transportBusy}
            request={versionRequest}
          />
          <button disabled={transportBusy} onClick={open}>
            {simple ? "Open saved project" : "Open bundle"}
          </button>
          <button disabled={busy} onClick={save}>
            {simple ? "Save editable project" : "Download bundle"}
          </button>
          {!simple && (
            <button className="dir-primary" disabled={busy} onClick={render}>
              Render MP4 ↗
            </button>
          )}
          {!simple && <RegenerateAction disabled={busy} />}
          {switchMode && (
            <button
              className="dir-mode-switch"
              disabled={transportBusy}
              onClick={switchMode}
            >
              {simple ? "Go to Editor ↗" : "Back to Director"}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
