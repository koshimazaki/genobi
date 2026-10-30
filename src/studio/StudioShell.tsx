import { NinjaHeading } from "./NinjaHeading";
import {
  Suspense,
  useEffect,
  useRef,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import App from "../App";
import TemplateGallery from "../template-gallery/TemplateGallery";
import { ShellContext, type HostId } from "./ShellContext";
import { useDockedRail } from "./useDockedRail";
import {
  panels,
  layouts,
  initialPreset,
  type PanelId,
  type Preset,
} from "./presets";
import { StudioNavigation } from "./StudioNavigation";
import { usePanelMotion } from "./usePanelMotion";
import { useStudio } from "./useStudio";
import { studioStore } from "./store";
import {
  addToProjectAssets,
  addedMessage,
  type OutputMedia,
} from "./project-assets";
import {
  readLayout,
  movePanel,
  openWorkingLayout,
  readWorkingRails,
  panelColumns,
  type NinjaPanel,
  type NinjaLayout,
} from "./ninja-layout";
import { NinjaControls } from "./NinjaControls";
import { pickRails } from "../../shared/saved-layouts";
import { NinjaPanelControls, useNinjaDrag } from "./NinjaPanelControls";
import "./shell.css";
import "./ninja.css";
import "./compact-workspace.css";
import "./director-workspace.css";
import "./asset-rail.css";
import "./workspace-parity.css";
import { AssetRail, Host, assetPanels, isRailPanel } from "./AssetRail";
import { EditorResize } from "./EditorResize";
import { useEditorAssets } from "../dual-editor/useEditorAssets";
import { NinjaResize, useNinjaGrid } from "./NinjaResize";
import { lazyReload } from "../lazy-reload";
import { projectAudio } from "../world-builder/project-audio";
import { queueLayoutTake } from "../layout-take";
import { useHostedStudio } from "../hosted-studio";
const Scrolls = lazyReload(() => import("../scrolls/Scrolls"));
const Director = lazyReload(() => import("../director/Director"));
const WorldBuilder = lazyReload(() => import("../world-builder/WorldBuilder"));
// 3D camera plates (#18).
const Scene3D = lazyReload(() => import("../scene3d/Scene3D"));
const DualEditor = lazyReload(() =>
  import("../dual-editor/DualEditor").then((m) => ({ default: m.DualEditor })),
);

/** How long an asset-added notice stays above the workspace. */
const NOTICE_MS = 6000;

export default function StudioShell() {
  const hosted = useHostedStudio();
  const [preset, setPreset] = useState(() =>
    initialPreset(location.pathname, location.search),
  );
  const library = useEditorAssets();
  const [assetViews, setAssetViews] =
    useState<Record<string, boolean>>(readWorkingRails);
  const docked = useDockedRail();
  // Open by default only where the rail docks; the person's choice wins.
  const assetsOpen =
    preset !== "ninja" &&
    (assetViews[preset] ?? (preset !== "gallery" && docked));
  const setAssetsOpen = (open: boolean) =>
    setAssetViews((v) => ({ ...v, [preset]: open }));
  const [restored] = useState(readLayout);
  const [ninjaLayout, setNinjaLayout] = useState(restored.layout);
  const [savedLayout, setSavedLayout] = useState(restored.layout);
  const [ninjaEditing, setNinjaEditing] = useState(
    restored.message !== "Saved layout restored.",
  );
  const configButton = useRef<HTMLButtonElement>(null);
  const [layoutMessage, setLayoutMessage] = useState(restored.message);
  const ninja = ninjaLayout.panels
    .map((p) => p.id)
    .filter((id) => id !== "inputs");
  // Heavy tools latch their first visit so later layout changes only hide
  // them. "plates" is the 3D camera panel (#18), latched by itself.
  const [visited, setVisited] = useState<Set<Preset | "plates" | "plateView">>(
    () =>
      new Set([
        preset,
        ...(ninja.includes("world") ? ["world" as const] : []),
        ...(ninja.includes("dual") ? ["dual" as const] : []),
        ...(ninja.includes("plates") || ninja.includes("plateView")
          ? ["plates" as const]
          : []),
      ]),
  );
  const [hosts] = useState(
    () =>
      Object.fromEntries(
        [...Object.keys(panels), "header", "galleryFilters", "toolAssets"].map(
          (id) => [id, document.createElement("div")],
        ),
      ) as Record<HostId, HTMLDivElement>,
  );
  // New panel types need a stable destination during an active local preview.
  for (const id of Object.keys(panels) as PanelId[]) {
    hosts[id] ??= document.createElement("div");
  }
  const assetRole = useStudio((s) => s.workspace.assetRole);
  const bundle = useStudio((s) => s.director.bundle);
  // The 3D Sound tab lists the project's audio; its bytes stay in this tab.
  const projectAudioChoices = useMemo(() => projectAudio(bundle), [bundle]);
  // `at` restarts the expiry even when two adds read the same.
  const [notice, setNotice] = useState({ text: "", at: 0 });
  const root = useRef<HTMLDivElement>(null);
  const visible = useMemo(
    () =>
      preset === "ninja"
        ? ninjaLayout.panels.map((p) => p.id).filter((id) => id !== "inputs")
        : [
            ...layouts[preset].filter((id) => !isRailPanel(id, preset)),
            ...(assetsOpen ? assetPanels(preset) : []),
          ],
    [preset, ninjaLayout, assetsOpen],
  );
  const [motionVersion, setMotionVersion] = useState(0);
  useNinjaGrid(root, preset === "ninja", JSON.stringify(ninjaLayout));
  const measure = usePanelMotion(root, preset + motionVersion + visible.join());
  function updatePanel(panel: NinjaPanel, animate = true) {
    const next = {
      ...ninjaLayout,
      panels: ninjaLayout.panels.map((p) => (p.id === panel.id ? panel : p)),
    };
    if (animate) changeLayout(next);
    else {
      setNinjaLayout(next);
      setLayoutMessage("");
    }
  }
  function changeLayout(next: NinjaLayout) {
    measure();
    setNinjaLayout(next);
    setMotionVersion((v) => v + 1);
    setLayoutMessage("");
    setVisited(
      (previous) =>
        new Set([
          ...previous,
          ...next.panels.flatMap(({ id }) =>
            id === "world" ||
            id === "dual" ||
            id === "plates" ||
            id === "plateView"
              ? [id]
              : [],
          ),
        ]),
    );
  }
  function move(from: PanelId, to: PanelId) {
    const next = movePanel(ninjaLayout, from, to);
    if (next === ninjaLayout) return;
    changeLayout(next);
    setLayoutMessage(
      `${panels[from].title} moved to position ${next.panels.findIndex((p) => p.id === from) + 1}. Save layout to keep it.`,
    );
  }
  const drag = useNinjaDrag(preset === "ninja" && ninjaEditing, move);
  function select(next: Preset, updateUrl = true) {
    if (next === preset) return;
    const focusWasInPanel = root.current?.contains(document.activeElement);
    measure();
    setPreset(next);
    if (focusWasInPanel)
      requestAnimationFrame(() => {
        root.current?.parentElement
          ?.querySelector<HTMLButtonElement>(`[data-preset-button="${next}"]`)
          ?.focus({ preventScroll: true });
      });
    setVisited((previous) => new Set([...previous, next]));
    if (next === "director" || next === "editor")
      studioStore.getState().actions.workspace({ advanced: next === "editor" });
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("workspace", next);
      history.replaceState(null, "", url);
    }
  }
  useEffect(() => {
    if (preset === "director" || preset === "editor")
      studioStore
        .getState()
        .actions.workspace({ advanced: preset === "editor" });
  }, [preset]);
  useEffect(() => {
    const navigate = () =>
      select(initialPreset(location.pathname, location.search), false);
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  });
  useEffect(() => {
    Object.entries(hosts).forEach(([id, host]) => {
      if (
        id !== "header" &&
        id !== "galleryFilters" &&
        !visible.includes(id as PanelId)
      )
        host
          .querySelectorAll<HTMLMediaElement>("video,audio")
          .forEach((media) => media.pause());
    });
  }, [hosts, visible]);
  // Every tool's output reaches the project's assets through this one path.
  // A new asset is announced briefly; a repeat add of the same bytes is not,
  // because the tool that asked already says so and nothing changed.
  async function addAsset(media: OutputMedia) {
    const added = await addToProjectAssets(media);
    if (added.added) setNotice({ text: addedMessage(added), at: Date.now() });
    return added;
  }
  useEffect(() => {
    if (!notice.text) return;
    const timer = setTimeout(() => setNotice({ text: "", at: 0 }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  const hasWorld =
    visited.has("world") || (visited.has("ninja") && ninja.includes("world"));
  const hasDual =
    visited.has("dual") || (visited.has("ninja") && ninja.includes("dual"));
  const hasPlates =
    visited.has("plates") ||
    visited.has("plateView") ||
    (visited.has("ninja") &&
      (ninja.includes("plates") || ninja.includes("plateView")));
  const navigation = (
    <StudioNavigation
      preset={preset}
      onSelect={select}
      editing={ninjaEditing}
      onToggle={() => setNinjaEditing((value) => !value)}
      configButton={configButton}
      filters={<Host node={hosts.galleryFilters} />}
    />
  );
  return (
    <ShellContext.Provider
      value={{
        preset,
        select,
        visible,
        hosts,
        navigation,
        assetsOpen,
        setAssetsOpen,
        library,
      }}
    >
      <div
        className="genobi-shell"
        data-preset={preset}
        data-media-role={assetRole}
        data-configuring={preset === "ninja" && ninjaEditing}
      >
        <Host node={hosts.header} />
        {preset === "ninja" && <NinjaHeading editing={ninjaEditing} />}
        {preset === "ninja" && ninjaEditing && (
          <NinjaControls
            layout={ninjaLayout}
            saved={savedLayout}
            onChange={changeLayout}
            onSaved={(layout) => {
              setSavedLayout(layout);
              setNinjaEditing(false);
              requestAnimationFrame(() => configButton.current?.focus());
            }}
            message={layoutMessage}
            onMessage={setLayoutMessage}
            rails={pickRails(assetViews)}
            onApply={(layout, rails) => {
              const opened = openWorkingLayout(layout, rails, savedLayout);
              changeLayout(layout);
              setSavedLayout(opened.saved);
              setAssetViews(rails);
              return opened.kept;
            }}
          />
        )}
        <p className="genobi-notice" role="status">
          {notice.text}
        </p>
        <div
          className="studio-workspace"
          data-assets-open={assetsOpen || undefined}
        >
          <div className="studio-main">
            <TemplateGallery active={preset === "gallery"} />
            <div
              className="genobi-grid"
              ref={root}
              data-compact={ninjaLayout.compact !== false}
            >
              {[
                ...visible,
                ...(Object.keys(panels) as PanelId[]).filter(
                  (id) => !visible.includes(id),
                ),
              ].map((id) => {
                const config = ninjaLayout.panels.find((p) => p.id === id);
                return (
                  <section
                    key={id}
                    className={`genobi-panel genobi-panel-${id}`}
                    data-panel={id}
                    data-dragging={drag.drag?.from === id || undefined}
                    data-drop={
                      (drag.drag?.to === id && drag.drag.from !== id) ||
                      undefined
                    }
                    hidden={
                      !visible.includes(id) ||
                      (preset !== "ninja" && isRailPanel(id, preset))
                    }
                    aria-labelledby={`panel-${id}`}
                    data-sized={
                      (preset === "ninja" && config?.height !== undefined) ||
                      undefined
                    }
                    data-fit={config?.fit ?? "contain"}
                    style={
                      {
                        gridArea: preset === "ninja" ? undefined : id,
                        order: visible.indexOf(id),
                        ...(preset === "ninja"
                          ? {
                              "--ninja-columns": panelColumns(config),
                              height: config?.height,
                            }
                          : {}),
                      } as CSSProperties
                    }
                  >
                    <header className="genobi-panel-heading">
                      <h2 id={`panel-${id}`}>
                        {preset === "director" && id === "prompt"
                          ? "Make it yours"
                          : panels[id].title}
                      </h2>
                      {preset === "ninja" && ninjaEditing ? (
                        <NinjaPanelControls
                          id={id}
                          index={visible.indexOf(id)}
                          count={visible.length}
                          width={
                            ninjaLayout.panels.find((p) => p.id === id)
                              ?.width ?? "half"
                          }
                          drag={drag}
                          columns={panelColumns(config)}
                          height={config?.height}
                          fit={config?.fit ?? "contain"}
                          onFit={() => {
                            if (!config) return;
                            const next = { ...config };
                            delete next.height;
                            updatePanel(next);
                          }}
                          onView={() =>
                            config &&
                            updatePanel({
                              ...config,
                              fit: config.fit === "cover" ? "contain" : "cover",
                            })
                          }
                          onMove={(offset) => {
                            const to = visible[visible.indexOf(id) + offset];
                            if (to) move(id, to);
                          }}
                          onWidth={() =>
                            changeLayout({
                              ...ninjaLayout,
                              panels: ninjaLayout.panels.map((p) =>
                                p.id === id
                                  ? {
                                      ...p,
                                      width:
                                        panelColumns(p) === 12
                                          ? "half"
                                          : "full",
                                      columns: panelColumns(p) === 12 ? 6 : 12,
                                    }
                                  : p,
                              ),
                            })
                          }
                        />
                      ) : (
                        <span aria-hidden="true">
                          {id === "tools" ? "JSON / TOOLS" : "· ·"}
                        </span>
                      )}
                    </header>
                    <div className={`genobi-panel-content ${panels[id].scope}`}>
                      {(preset === "ninja" || !isRailPanel(id, preset)) && (
                        <Host node={hosts[id]} />
                      )}
                    </div>
                    {preset === "editor" &&
                      ["stage", "timeline"].includes(id) && (
                        <EditorResize title={panels[id].title} />
                      )}
                    {preset === "ninja" && ninjaEditing && config && (
                      <NinjaResize
                        panel={config}
                        onChange={(panel) => updatePanel(panel, false)}
                      />
                    )}
                  </section>
                );
              })}
              {preset === "ninja" && !ninja.length && (
                <p className="genobi-empty">
                  A little room to think. Choose a panel above to begin.
                </p>
              )}
            </div>
          </div>
          {preset !== "ninja" && <AssetRail />}
        </div>
        <div className="genobi-owners">
          <App />
          <Suspense fallback={null}>
            <Scrolls />
          </Suspense>
          <Suspense fallback={<p role="status">Opening project tools…</p>}>
            <Director
              active={visible.some((id) => ["stage", "timeline"].includes(id))}
              initializeProject={visible.some((id) =>
                ["stage", "timeline", "tools"].includes(id),
              )}
            />
          </Suspense>
          {hasWorld && (
            <Suspense fallback={<p role="status">Opening 3D…</p>}>
              <WorldBuilder
                active={visible.includes("world")}
                onAsset={addAsset}
                projectAudio={projectAudioChoices}
                onLayoutTake={
                  hosted
                    ? undefined
                    : async (take) => {
                        await queueLayoutTake(take);
                        select("camera");
                      }
                }
              />
            </Suspense>
          )}
          {hasPlates && (
            <Suspense fallback={<p role="status">Opening 3D camera…</p>}>
              <Scene3D
                active={
                  visible.includes("plates") || visible.includes("plateView")
                }
              />
            </Suspense>
          )}
          {hasDual && (
            <Suspense fallback={<p role="status">Opening Dual Swords…</p>}>
              <DualEditor
                onCapture={({ blob, filename }) =>
                  addAsset({ blob, filename, use: "reference" })
                }
                onExport={({ blob, filename }) =>
                  addAsset({ blob, filename, use: "production" })
                }
              />
            </Suspense>
          )}
        </div>
      </div>
    </ShellContext.Provider>
  );
}
