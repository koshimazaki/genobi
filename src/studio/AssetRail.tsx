import { useEffect, useState } from "react";
import { useShell } from "./ShellContext";
import { onAssetAdded } from "./project-assets";
import { stopPlayback } from "../director/media-playback";
import Icon from "../components/Icon";
export const ASSET_PANELS = ["project", "inspirations", "gallery"] as const;
export const assetPanels = (preset: string) =>
  ASSET_PANELS.filter((id) => preset !== "camera" || id !== "gallery");
export const isRailPanel = (id: string, preset: string) =>
  assetPanels(preset).some((p) => p === id);
export function Host({ node }: { node: HTMLDivElement }) {
  return (
    <div
      className="genobi-host"
      ref={(el) => {
        if (el && node.parentNode !== el) el.appendChild(node);
      }}
    />
  );
}
export function AssetRail() {
  const shell = useShell()!;
  const [tabs, setTabs] = useState<Record<string, string>>({});
  const collections = assetPanels(shell.preset);
  const selected = tabs[shell.preset];
  const tab =
    collections.find((id) => id === selected) ??
    (shell.preset === "dual" ? "gallery" : "project");
  // A hidden pane keeps its cards mounted: a preview there would play on
  // unseen, so changing tab (or workspace) stops it.
  useEffect(() => stopPlayback(), [tab]);
  // An output added to the project shows the tab it landed in.
  const preset = shell.preset;
  useEffect(
    () =>
      onAssetAdded(
        ({ use, keepTab }) =>
          // Sent from the rail's own Library: stay, the card says what happened.
          keepTab ||
          setTabs((current) => ({
            ...current,
            [preset]: use === "reference" ? "inspirations" : "project",
          })),
      ),
    [preset],
  );
  function close() {
    shell.setAssetsOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(".studio-assets-toggle")
        ?.focus(),
    );
  }
  return (
    <aside
      className="studio-asset-rail"
      id="studio-assets"
      aria-label="Assets"
      hidden={!shell.assetsOpen}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <header>
        <h2>Assets</h2>
        <button aria-label="Hide assets" onClick={close}>
          <Icon name="close" size={15} />
        </button>
      </header>
      <div
        className="studio-asset-tabs"
        role="tablist"
        aria-label="Asset collection"
      >
        {collections.map((id) => (
          <button
            key={id}
            id={`assets-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`assets-pane-${id}`}
            onClick={() => setTabs({ ...tabs, [shell.preset]: id })}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const index = collections.indexOf(id);
              const next =
                collections[
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? collections.length - 1
                      : (index +
                          (e.key === "ArrowRight"
                            ? 1
                            : collections.length - 1)) %
                        collections.length
                ];
              setTabs({ ...tabs, [shell.preset]: next });
              document.getElementById(`assets-tab-${next}`)?.focus();
            }}
            tabIndex={tab === id ? 0 : -1}
          >
            {id === "project"
              ? "Project"
              : id === "inspirations"
                ? "Inspirations"
                : "Library"}
          </button>
        ))}
      </div>
      {collections.map((id) => (
        <div
          key={id}
          role="tabpanel"
          id={`assets-pane-${id}`}
          aria-labelledby={`assets-tab-${id}`}
          hidden={id !== tab}
        >
          {id === "gallery" ? (
            <>
              <div hidden={shell.preset === "dual"}>
                <Host node={shell.hosts.gallery} />
              </div>
              <div hidden={shell.preset !== "dual"}>
                <Host node={shell.hosts.toolAssets} />
              </div>
            </>
          ) : (
            <Host node={shell.hosts[id]} />
          )}
        </div>
      ))}
    </aside>
  );
}
