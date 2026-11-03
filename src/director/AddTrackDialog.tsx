import { studioDropFile } from "../studio/media-drop";
import { studioStore } from "../studio/store";
import { useShell } from "../studio/ShellContext";
import { useRef, useState } from "react";
import type { Project } from "../../shared/director/types";
import SelectMenu from "../components/SelectMenu";
import Icon from "../components/Icon";
import { useModalDialog } from "../components/useModalDialog";
import { EffectsPicker } from "../effects/EffectsPicker";

export default function AddTrackDialog({
  project,
  busy,
  close,
  media,
  graphics,
}: {
  project: Project;
  busy: boolean;
  close: () => void;
  media: (files: File[], name: string) => Promise<void>;
  graphics: (moduleId: string, name: string) => void;
}) {
  const shell = useShell();
  const dialog = useRef<HTMLDialogElement>(null),
    picker = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("auto"),
    [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]),
    [error, setError] = useState("");
  const [view, setView] = useState<"media" | "effects">("media");
  useModalDialog(dialog);
  const options = [
    { value: "auto", label: "Media · detect from file" },
    { value: "image", label: "Image" },
    { value: "video", label: "Video / rendered animation" },
    { value: "audio", label: "Audio" },
    ...Object.entries(project.modules)
      .filter(([id]) =>
        project.layers.some((l) => "moduleId" in l && l.moduleId === id),
      )
      .map(([id, m]) => ({
        value: `module:${id}`,
        label: `${m.engine} · ${id}${m.mode === "filter" ? " filter" : " graphics"}`,
      })),
  ];
  function chooseFiles(next: File[]) {
    if (busy) return;
    setFiles(next);
    setError("");
    if (next.length) {
      setType("auto");
      if (!name) setName(next.length === 1 ? next[0].name : "");
    }
  }
  async function add() {
    if (busy) return;
    setError("");
    try {
      if (type.startsWith("module:")) graphics(type.slice(7), name.trim());
      else {
        if (!files.length) throw new Error("Choose or drop a media file first");
        if (
          type !== "auto" &&
          files.some((f) => !f.type.startsWith(`${type}/`))
        )
          throw new Error(`Choose ${type} files or use automatic detection`);
        await media(files, name.trim());
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <dialog
      ref={dialog}
      className={`dir-add-dialog${view === "effects" ? " is-effects" : ""}`}
      aria-labelledby="add-track-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <h2 id="add-track-heading">Add track</h2>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Close Add track"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="dir-add-dialog-body">
        <div
          className="dir-add-choices"
          role="group"
          aria-label="Add to the edit"
        >
          <button
            type="button"
            aria-pressed={view === "media"}
            disabled={busy}
            onClick={() => setView("media")}
          >
            Media & graphics
          </button>
          <button
            type="button"
            aria-pressed={view === "effects"}
            disabled={busy}
            onClick={() => setView("effects")}
          >
            Animations & Effects
          </button>
        </div>
        {view === "effects" ? (
          <EffectsPicker />
        ) : (
          <>
            <SelectMenu
              id="add-track-type"
              label="Type"
              value={type}
              onChange={setType}
              options={options}
              disabled={busy}
              compact
            />
            <label className="dir-track-name">
              Track name
              <input
                aria-label="Track name"
                value={name}
                maxLength={120}
                placeholder="Use the file or graphics name"
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {!type.startsWith("module:") && (
              <>
                <input
                  ref={picker}
                  hidden
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,video/*,audio/*"
                  onChange={(e) =>
                    chooseFiles(Array.from(e.target.files ?? []))
                  }
                />
                <button
                  className="dir-asset-drop"
                  disabled={busy}
                  onClick={() => picker.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files.length) {
                      chooseFiles(Array.from(e.dataTransfer.files));
                      return;
                    }
                    void studioDropFile(
                      e.dataTransfer,
                      studioStore.getState().director.bundle,
                      shell?.library,
                    )
                      .then((file) => chooseFiles(file ? [file] : []))
                      .catch((error) => setError(String(error)));
                  }}
                >
                  <Icon name="upload" size={24} />
                  <span>
                    {files.length
                      ? files.map((f) => f.name).join(", ")
                      : "Drop image, video or audio"}
                  </span>
                  <small>or choose files</small>
                </button>
              </>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer>
        <button disabled={busy} onClick={close}>
          {view === "effects" ? "Done" : "Cancel"}
        </button>
        {view === "media" && (
          <button
            className="dir-primary"
            disabled={busy || (!type.startsWith("module:") && !files.length)}
            onClick={() => void add()}
          >
            {busy ? "Adding…" : "Add track"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
