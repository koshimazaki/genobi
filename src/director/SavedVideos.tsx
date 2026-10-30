import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useState } from "react";
import type { Source } from "../../shared/types";
import {
  DIRECTOR_MEDIA_LIMIT,
  DIRECTOR_PROJECT_LIMIT,
} from "../../shared/director/types";
import type { Bundle } from "./bundle";
import type { PageKey } from "../usePageKey";
import { copyAvailable } from "./project-copy";
import { saveRender } from "./save-render";
import { listSavedVideos, loadSavedVideo } from "./saved-media";
import {
  addToProjectAssets,
  addedMessage,
  type AddedAsset,
} from "../studio/project-assets";

/**
 * Videos into the project's assets, through the one path every output takes
 * (`src/studio/project-assets.ts`): a rendered video, an MP4 from this
 * computer, or a video saved to this browser's library before outputs went to
 * the project. Saved videos stay where they are; adding one copies it, so
 * nothing is deleted. Placing a video on a clip is a drag from the Project
 * tab onto the clip. On the hosted site, with no project copy, a render is
 * also saved to the visitor's library so it survives a reload (`saveRender`).
 */
export default function SavedVideos({
  bundle,
  renderUrl,
  disabled,
  connection,
}: {
  bundle: Bundle;
  renderUrl: string;
  disabled: boolean;
  connection: PageKey;
}) {
  const [key] = connection;
  // Null until known; the hosted Worker and a bare preview have no copy.
  const [copy, setCopy] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void copyAvailable().then((found) => live && setCopy(found));
    return () => {
      live = false;
    };
  }, []);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const off = disabled || working;
  async function refresh() {
    const next = await listSavedVideos();
    setSources(next);
    setSourceId((current) =>
      next.some((s) => s.id === current) ? current : (next[0]?.id ?? ""),
    );
    return next;
  }
  // The add reserves the studio's edit itself, so this only marks the panel.
  async function run(action: () => Promise<AddedAsset | string>) {
    if (off) return;
    setWorking(true);
    setMessage("");
    setFailure("");
    try {
      const result = await action();
      setMessage(typeof result === "string" ? result : addedMessage(result));
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : "Asset operation failed.",
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <details
      className="dir-remix dir-saved-videos"
      onDragOver={(e) => e.stopPropagation()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <summary>Videos · add to project assets</summary>
      <p>
        Rendered and imported videos join this project&rsquo;s assets, under
        Project, beside every other output. Drag one onto a clip to use it.{" "}
        {copy === false
          ? "On the hosted site a render is also saved to your private library, which keeps it after a reload (it can expire after 30 days); project assets here last until you reload, so download the bundle to keep the project."
          : "On this computer the project copy keeps them."}
      </p>
      <div className="dir-remix-fields">
        <button
          disabled={off || !renderUrl || copy === null}
          onClick={() =>
            void run(async () => {
              const response = await fetch(renderUrl);
              if (!response.ok)
                throw new Error(
                  "Render unavailable. Render the project again.",
                );
              return saveRender({
                blob: await response.blob(),
                name: bundle.project.name,
                copy: copy === true,
                key,
              });
            })
          }
        >
          {copy === false
            ? "Save rendered video to library and assets"
            : "Add rendered video to assets"}
        </button>
        <label>
          Import MP4 to project assets
          <input
            type="file"
            accept="video/mp4,.mp4"
            disabled={off}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void run(async () => {
                  if (!file.name.toLowerCase().endsWith(".mp4"))
                    throw new Error("Choose an MP4 video.");
                  return addToProjectAssets({
                    // A disk file can arrive without a type; its name says MP4.
                    blob: file.type
                      ? file
                      : new Blob([file], { type: "video/mp4" }),
                    filename: file.name,
                    use: "production",
                  });
                });
            }}
          />
        </label>
      </div>
      <p>
        Project media: MP4, up to {DIRECTOR_MEDIA_LIMIT} per file and{" "}
        {DIRECTOR_PROJECT_LIMIT} per project. Adding never submits a generation.
      </p>
      <div className="dir-remix-fields">
        <button
          disabled={off}
          onClick={() =>
            void run(async () => {
              const next = await refresh();
              return next.length
                ? `${next.length} ${next.length === 1 ? "video" : "videos"} saved before; add any to the project.`
                : "No earlier saved videos.";
            })
          }
        >
          Show earlier saved videos
        </button>
        <label>
          Earlier saved video
          <ThemedSelect
            value={sourceId}
            disabled={off}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">Choose a saved video</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </ThemedSelect>
        </label>
        <button
          disabled={off || !sourceId}
          onClick={() =>
            void run(async () => {
              const source = sources.find((s) => s.id === sourceId);
              if (!source)
                throw new Error("Show saved videos again and choose one.");
              return addToProjectAssets({
                blob: await loadSavedVideo(source),
                filename: source.label,
                use: "production",
              });
            })
          }
        >
          Add to project assets
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {failure && <p role="alert">{failure}</p>}
    </details>
  );
}
