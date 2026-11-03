import { useEffect, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import { download } from "./useBuilderSession";
import type { LibraryTake } from "./take-library";
import type { SceneLibraryState } from "./useSceneLibrary";
import { PresetGallery } from "./PresetGallery";
import "./scene-library.css";

const OPEN_KEY = "genobi.world.library.open";
const readOpen = () => {
  try {
    return globalThis.localStorage?.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
};
const megabytes = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** One object URL for a blob, revoked when the card goes. */
function useBlobUrl(blob: Blob | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) return setUrl("");
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function TakeCard({
  take,
  lib,
  busy,
}: {
  take: LibraryTake;
  lib: SceneLibraryState;
  busy: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const thumb = useBlobUrl(take.first);
  const video = useBlobUrl(playing ? take.video : null);
  return (
    <li className="wb-lib-card">
      <div className="wb-lib-media">
        {playing && video ? (
          <video
            src={video}
            autoPlay
            controls
            muted
            playsInline
            aria-label={`Preview of ${take.name}`}
          />
        ) : (
          thumb && <img src={thumb} alt={`First frame of ${take.name}`} />
        )}
      </div>
      <div className="wb-lib-meta">
        <strong title={take.name}>{take.name}</strong>
        <small>
          {take.mode === "live" ? "Live" : "Take"} · {take.seconds.toFixed(1)} s
          {take.frames ? ` · ${take.frames} f` : ""} · {megabytes(take.bytes)}
        </small>
      </div>
      <div className="wb-lib-actions">
        <button aria-pressed={playing} onClick={() => setPlaying(!playing)}>
          {playing ? "Stop" : "Preview"}
        </button>
        <button
          disabled={busy || !take.recipe}
          title={take.recipe ? undefined : "This receipt holds no recipe."}
          onClick={() => lib.loadTake(take)}
        >
          Load recipe
        </button>
        {lib.toAssets && (
          <>
            <button disabled={busy} onClick={() => lib.addTake(take)}>
              Add to assets
            </button>
            <button disabled={busy} onClick={() => lib.sendTake(take)}>
              Send to Director
            </button>
          </>
        )}
        <button onClick={() => download(take.video, `${take.name}.webm`)}>
          Download
        </button>
        <button
          disabled={busy}
          aria-label={`Remove ${take.name} from the library`}
          onClick={() => lib.removeTake(take)}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

/**
 * Where the library keeps its takes, in words. Embedded (the Comfy node's
 * World Builder, the one place the bundle runs in an iframe) they are kept
 * in this browser's IndexedDB for that ComfyUI address and leave only when
 * sent to the node; on a page of its own, in this browser until added or sent.
 */
export function emptyLibraryHint(embedded = window.parent !== window) {
  return embedded
    ? "Every capture and live recording lands here and stays with this ComfyUI in this browser (up to 20 takes, 500 MB). Nothing leaves it until you send a take to the node."
    : "Every capture and live recording lands here and stays in this browser (up to 20 takes, 500 MB). Nothing leaves it until you add or send a take.";
}

/**
 * The scene library under the viewport: this browser's takes and the
 * presets. It sits below the take strip, so opening or closing it never
 * changes the viewport's size.
 */
export function SceneLibrary({
  s,
  lib,
  disabled,
  onConfigureScene,
}: {
  s: BuilderSession;
  lib: SceneLibraryState;
  /** The scene is busy, playing or walking: loading waits. */
  disabled: boolean;
  onConfigureScene?: () => void;
}) {
  const [open, setOpen] = useState(readOpen);
  const [tab, setTab] = useState<"takes" | "presets">("presets");
  const busy = disabled || !!lib.working;
  const toggle = () => {
    setOpen(!open);
    try {
      globalThis.localStorage?.setItem(OPEN_KEY, open ? "0" : "1");
    } catch {
      // The choice lasts for this view only.
    }
  };
  return (
    <section className="wb-library" aria-label="Scene library">
      <header>
        <button
          className="wb-lib-toggle"
          aria-expanded={open}
          aria-controls="wb-library-body"
          onClick={toggle}
        >
          Library{" "}
          <small>
            {lib.takes.length} take{lib.takes.length === 1 ? "" : "s"}
          </small>
        </button>
        {open && (
          <div className="wb-lib-tabs" role="tablist" aria-label="Library">
            {(["presets", "takes"] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {key === "takes" ? "Takes" : "Presets"}
              </button>
            ))}
          </div>
        )}
        <p className="wb-lib-message" role="status">
          {lib.message}
        </p>
      </header>
      {open && (
        <div id="wb-library-body" role="tabpanel">
          {tab === "takes" ? (
            lib.takes.length ? (
              <ul className="wb-lib-row">
                {lib.takes.map((take) => (
                  <TakeCard key={take.id} take={take} lib={lib} busy={busy} />
                ))}
              </ul>
            ) : (
              <p className="wb-hint">{emptyLibraryHint()}</p>
            )
          ) : (
            <PresetGallery
              s={s}
              lib={lib}
              disabled={busy}
              onConfigureScene={onConfigureScene}
            />
          )}
        </div>
      )}
    </section>
  );
}
