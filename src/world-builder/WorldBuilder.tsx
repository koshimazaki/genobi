import { WorkspaceHeading } from "../studio/WorkspaceHeading";
import { LiveControls } from "./LiveControls";
import { StudioPanel, useShell } from "../studio/ShellContext";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Wordmark from "../components/Wordmark";
import ThemePicker from "../components/ThemePicker";
import Icon from "../components/Icon";
import { useBuilderSession } from "./useBuilderSession";
import { useBuilderAssets } from "./useBuilderAssets";
import { useRecipeHandoff } from "./useRecipeHandoff";
import { useWorldAgent } from "./world-agent";
import { useWorldPromptTarget } from "../voice/world-prompt-target";
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
import { ViewportLightbox } from "./ViewportLightbox";
import { SceneLoopPanel } from "./SceneLoopPanel";
import "./loop-workspace.css";
import type { Recipe } from "./recipe";
import type { DockPanel } from "./panel-dock";
const advancedPanels = [
  { key: "scene", label: "Scene", icon: "grid" },
  { key: "capture", label: "Export", icon: "image" },
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
  const sidebar = useRef<HTMLElement>(null);
  const [cameraSelection, setCameraSelection] = useState<{
    id: number;
    recipe: Recipe;
  }>();
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
      s.inputTake.current?.cancel();
      if (e.mode !== "shot") e.chooseMode("shot");
    }
  }, [active, s, e]);
  useEffect(() => {
    if (e.selected) dispatch({ type: "open", key: "object" });
  }, [e.selected, dispatch]);
  // Play never locks a control: mode, capture and edits stop it first.
  const idle = s.ready && !s.busy,
    shot = e.mode === "shot";
  const openPanel = (key: DockPanel) => {
    dispatch({ type: "open", key });
    if (sidebar.current) sidebar.current.scrollTop = 0;
  };
  const settings = (
    <BuilderInspector
      s={s}
      e={e}
      a={a}
      dock={dock}
      dispatch={dispatch}
      pip={pip}
      projectAudio={projectAudio}
      onCameraChange={(recipe) =>
        setCameraSelection((before) => ({
          id: (before?.id ?? 0) + 1,
          recipe,
        }))
      }
    />
  );
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
            <WorkspaceMenus s={s} e={e} onCreature={() => openPanel("scene")} />
          </div>
          <div className="wb-stage-grid" data-loop-layout="true">
            <div className="wb-view-column">
              <ViewportLightbox
                active={active}
                onCamera={() => openPanel("camera")}
                cameraOpen={
                  dock.docked.includes("camera") || dock.popped === "camera"
                }
                cameraDisabled={!idle}
              >
                <div
                  className="wb-viewport"
                  // Drop a track on the scene in any mode; it loads and plays.
                  // A recent-track row dragged from the Sound panel works too.
                  {...dropOnScene(s, projectAudio, () => openPanel("audio"))}
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
                      disabled={
                        !idle || s.previewOnly || s.recipe.scene === "neuro"
                      }
                      onClick={() => e.chooseMode("edit")}
                    >
                      Build
                    </button>
                    <button
                      aria-pressed={e.mode === "walk"}
                      disabled={
                        !idle ||
                        s.previewOnly ||
                        !s.recipe.avatar ||
                        s.recipe.scene === "neuro"
                      }
                      onClick={() => e.chooseMode("walk")}
                    >
                      Walk
                    </button>
                  </div>
                  <BuildToolbar
                    s={s}
                    e={e}
                    onInspect={() =>
                      dispatch({ type: "toggle", key: "object" })
                    }
                  />
                  <span className="wb-viewport-badge">
                    {s.previewOnly
                      ? "GEOMETRY PREVIEW · WEBGL UNAVAILABLE"
                      : s.recipe.scene === "neuro"
                        ? "NEURO"
                        : e.mode === "walk"
                          ? "WASD · SPACE JUMP · SHIFT RUN"
                          : e.mode === "edit"
                            ? "W MOVE · E ROTATE · R SIZE"
                            : "DRAG TO FRAME · SCROLL TO ZOOM"}
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
              </ViewportLightbox>
            </div>
            <aside
              className="wb-loop-sidebar"
              aria-label="Loop studio"
              ref={sidebar}
            >
              <SceneLoopPanel
                s={s}
                e={e}
                cameraSelection={cameraSelection}
                settings={settings}
                onCamera={() => openPanel("camera")}
                onSound={() => openPanel("audio")}
                onSaveLoop={async (name) => {
                  const capture = s.api.current?.captureTake;
                  if (!capture)
                    throw new Error("The take library is still starting.");
                  await capture(name);
                }}
              />
              <details className="wb-loop-more">
                <summary>More settings</summary>
                <div
                  className="wb-loop-settings"
                  role="group"
                  aria-label="More scene settings"
                >
                  {advancedPanels.map((p) => (
                    <button
                      key={p.key}
                      data-wb-launcher={p.key}
                      aria-pressed={
                        dock.docked.includes(p.key) || dock.popped === p.key
                      }
                      aria-controls="wb-inspector"
                      onClick={() => {
                        if (
                          dock.docked.includes(p.key) ||
                          dock.popped === p.key
                        )
                          dispatch({ type: "close", key: p.key });
                        else openPanel(p.key);
                      }}
                    >
                      <Icon name={p.icon} size={15} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </details>
            </aside>
            <div className="wb-catalogue-row">
              <SceneLibrary
                s={s}
                lib={lib}
                onConfigureScene={() => openPanel("scene")}
                disabled={!s.ready || s.busy || e.mode === "walk"}
              />
            </div>
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
                : "Drag to frame your shot. Save A, load another asset, save B, then play or save the loop."}
          </span>
        </div>
      </main>
    </StudioPanel>
  );
}
