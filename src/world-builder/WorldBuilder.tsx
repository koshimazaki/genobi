import { WorkspaceHeading } from "../studio/WorkspaceHeading";
import { LiveControls } from "./LiveControls";
import { StudioPanel, useShell } from "../studio/ShellContext";
import { useEffect, useRef, type CSSProperties } from "react";
import Wordmark from "../components/Wordmark";
import ThemePicker from "../components/ThemePicker";
import Icon from "../components/Icon";
import { useBuilderSession } from "./useBuilderSession";
import { useBuilderAssets } from "./useBuilderAssets";
import { useRecipeHandoff } from "./useRecipeHandoff";
import { useWorldAgent } from "./world-agent";
import { useWorldPromptTarget } from "../voice/world-prompt-target";
import { TakeLength } from "./TakeLength";
import type { AddAsset } from "../studio/project-assets";
import { useWorldShortcuts } from "./useWorldShortcuts";
import { useWorldEditor } from "./useWorldEditor";
import { useIdlePreview } from "./useIdlePreview";
import { BuildToolbar } from "./BuildToolbar";
import "../styles.css";
import "./world-builder.css";
import "./world-builder-panels.css";
import { BuilderInspector } from "./BuilderInspector";
import { useDockedPanels } from "./useDockedPanels";
import { inspectorOpen } from "./panel-dock";
import { WorkspaceMenus } from "./WorkspaceMenus";
import "./workspace.css";
import "./panel-dock.css";
import "./node-compact.css";
import { type RecentAudio } from "./audio-history";
import { dropOnScene } from "./sound-drop";
import { SceneLibrary } from "./SceneLibrary";
import { togglePlay } from "./example-track";
import { useSceneLibrary } from "./useSceneLibrary";
import type { Take } from "./export-take";
const panels = [
  { key: "camera", label: "Camera", icon: "camera" },
  { key: "audio", label: "Sound", icon: "acoustic" },
  { key: "scene", label: "Scene", icon: "grid" },
  { key: "capture", label: "Capture", icon: "image" },
] as const;
export default function WorldBuilder({
  active = true,
  onAsset,
  projectAudio,
  onLayoutTake,
}: {
  active?: boolean;
  /** The studio's project-assets path; takes and first frames land there. */
  onAsset?: AddAsset;
  /** The open project's audio assets, listed in the Sound tab. */
  projectAudio?: RecentAudio[];
  onLayoutTake?: (take: Take) => Promise<void>;
}) {
  const shell = useShell();
  const s = useBuilderSession(),
    a = useBuilderAssets(s, onAsset, onLayoutTake),
    e = useWorldEditor(s),
    lib = useSceneLibrary(s, e, a, onAsset),
    { dock, dispatch, pip } = useDockedPanels(!!shell);
  const surface = useRef<HTMLElement>(null);
  useWorldShortcuts(s, e, active, surface);
  // Stopped in Shot or Build, the character keeps playing its motion.
  useIdlePreview(s, e.mode, active);
  // In the studio an agent's recipe for the open project lands here.
  useRecipeHandoff(s, Boolean(onAsset));
  // Voice fills the scene direction, and an agent session hears the page is open.
  useWorldPromptTarget(s.change, active);
  useWorldAgent(s.recipe, active);
  useEffect(() => {
    if (!active) {
      s.setPlaying(false);
      if (e.mode !== "shot") e.chooseMode("shot");
    }
  }, [active, s, e]);
  useEffect(() => {
    if (e.selected) dispatch({ type: "open", key: "object" });
  }, [e.selected, dispatch]);
  // Play never locks a control: mode, capture and edits stop it first.
  const idle = s.ready && !s.busy,
    shot = e.mode === "shot";
  return (
    <StudioPanel id="world">
      <main className="wb-app" ref={surface}>
        {!shell && (
          <header className="topbar wb-header">
            <span
              className="wb-brand"
              onClickCapture={(event) => {
                if (window.parent !== window) event.preventDefault();
              }}
            >
              <Wordmark />
            </span>
            <h1 className="wb-product-name">World Builder</h1>
            <div className="topbar-right">
              {window.parent === window && (
                <a className="connection-button" href="/">
                  Director
                </a>
              )}
              <ThemePicker />
            </div>
          </header>
        )}
        <section className="wb-workspace" aria-label="World Builder workspace">
          <div className="wb-workspace-bar">
            <WorkspaceHeading
              title="3D World Builder"
              icon="cube"
              purpose="Build a set / Capture scene guidance."
            />
            <WorkspaceMenus
              s={s}
              e={e}
              onCreature={() => dispatch({ type: "open", key: "scene" })}
            />
          </div>
          <div className="wb-stage-grid" data-inspector={inspectorOpen(dock)}>
            <div className="wb-view-column">
              <div
                className="wb-viewport"
                // Drop a track on the scene in any mode; it loads and plays.
                // A recent-track row dragged from the Sound panel works too.
                {...dropOnScene(s, projectAudio, () =>
                  dispatch({ type: "open", key: "audio" }),
                )}
                style={
                  {
                    "--wb-aspect": s.recipe.width / s.recipe.height,
                  } as CSSProperties
                }
              >
                <div className="wb-canvas-fit">
                  <canvas
                    ref={s.canvas}
                    tabIndex={0}
                    aria-label="World Builder scene"
                  />
                </div>
                <div
                  className="wb-view-modes"
                  role="group"
                  aria-label="World interaction"
                >
                  <button
                    aria-pressed={shot}
                    disabled={!idle}
                    onClick={() => e.chooseMode("shot")}
                  >
                    Shot camera
                  </button>
                  <button
                    aria-pressed={e.mode === "edit"}
                    disabled={!idle || s.recipe.scene === "neuro"}
                    onClick={() => e.chooseMode("edit")}
                  >
                    Build
                  </button>
                  <button
                    aria-pressed={e.mode === "walk"}
                    disabled={
                      !idle || !s.recipe.avatar || s.recipe.scene === "neuro"
                    }
                    onClick={() => e.chooseMode("walk")}
                  >
                    Walk
                  </button>
                </div>
                <BuildToolbar
                  s={s}
                  e={e}
                  onInspect={() => dispatch({ type: "toggle", key: "object" })}
                />
                <span className="wb-viewport-badge">
                  {s.recipe.scene === "neuro"
                    ? "NEURO"
                    : e.mode === "walk"
                      ? "WASD · SPACE JUMP · SHIFT RUN"
                      : e.mode === "edit"
                        ? "W MOVE · E ROTATE · R SIZE"
                        : "SHOT PREVIEW"}
                </span>
              </div>
              <LiveControls s={s} e={e} />
              <div className="wb-take-strip">
                <button
                  aria-label={s.playing ? "Stop preview" : "Play take"}
                  disabled={!s.ready || s.busy || !shot}
                  // With no track yet, the first Play brings in the example.
                  onClick={() => togglePlay(s)}
                >
                  <Icon name={s.playing ? "close" : "play"} size={16} />
                </button>
                <button
                  className="wb-loop"
                  aria-label="Loop scene preview"
                  aria-pressed={s.loop}
                  disabled={!s.ready || s.busy}
                  onClick={() => s.setLoop(!s.loop)}
                  title="Loop scene preview"
                >
                  ↻ Loop
                </button>
                <input
                  aria-label="Preview frame"
                  type="range"
                  min={0}
                  max={s.recipe.frames - 1}
                  value={s.frame}
                  disabled={s.busy || !shot}
                  onChange={(ev) => {
                    const frame = Number(ev.target.value);
                    s.run(s.stopping(() => s.api.current!.render(frame)));
                  }}
                />
                <output>
                  {String(s.frame + 1).padStart(3, "0")} / {s.recipe.frames}{" "}
                  <small>24 FPS</small>
                </output>
                <span className="wb-resolution">
                  {s.recipe.width} × {s.recipe.height}
                </span>
              </div>
              <SceneLibrary
                s={s}
                lib={lib}
                disabled={!s.ready || s.busy || e.mode === "walk"}
              />
            </div>
            <BuilderInspector
              s={s}
              e={e}
              a={a}
              dock={dock}
              dispatch={dispatch}
              pip={pip}
              projectAudio={projectAudio}
            />
            {/* In the left column beside a docked panel, which runs from the
                viewport's top to the workspace's foot. */}
            <footer className="wb-console">
              <div
                className="wb-panel-launchers"
                role="group"
                aria-label="Panels"
              >
                {panels.map((p) => (
                  <button
                    key={p.key}
                    data-wb-launcher={p.key}
                    // Multi-select: up to two panels dock; a third replaces the oldest.
                    aria-pressed={
                      dock.docked.includes(p.key) || dock.popped === p.key
                    }
                    aria-controls="wb-inspector"
                    onClick={() => dispatch({ type: "toggle", key: p.key })}
                  >
                    <Icon name={p.icon} size={15} />
                    {p.label}
                  </button>
                ))}
              </div>
              <TakeLength s={s} disabled={!idle} label="Capture" />
              <button
                className="wb-primary"
                // An add still running keeps a second take from colliding. From
                // Walk or Build the viewport becomes the shot camera first.
                disabled={!s.ready || (!s.capturing && (!idle || !!a.saving))}
                onClick={() => {
                  dispatch({ type: "open", key: "capture" });
                  if (s.capturing) s.api.current?.cancel();
                  else s.run(s.stopping(a.captureTake));
                }}
              >
                {s.capturing
                  ? `Cancel · ${s.progress}/${s.recipe.frames}`
                  : a.saving === "take"
                    ? "Adding to assets…"
                    : "Capture take"}
                <Icon name="arrow" size={17} />
              </button>
            </footer>
          </div>
        </section>
        <div className="wb-feedback">
          <p role="status">{s.status}</p>
          {s.error && <p role="alert">{s.error}</p>}
          <span>
            {e.mode === "walk"
              ? "Click the scene: WASD / arrows to move, Space to jump, hold Shift to run; 1 Ninja, 2 Fireball, 3 Backflip. Return to Shot camera to save your position."
              : e.mode === "edit"
                ? "Select an object. Drag the handles to transform it, or drag empty space to orbit."
                : "Prepare a set. Capture the guidance. Direct the result."}
          </span>
        </div>
      </main>
    </StudioPanel>
  );
}
