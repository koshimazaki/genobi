import { useRef, useState } from "react";
import Icon from "../components/Icon";
import { useStudio } from "../studio/useStudio";
import { studioStore } from "../studio/store";
import { download, type Bundle } from "./bundle";
import {
  briefArchive,
  nextReferenceLabel,
  withReferenceRoom,
  writeBrief,
  type PromptBrief,
  type PromptReference,
} from "./prompt-brief";
import { PromptText, type PromptTextHandle } from "./PromptText";
import { promptMention, mentionIntent } from "./prompt-mention";
import { importPromptFont } from "./prompt-font";
import { importAssets } from "./import-media";
import { acceptsStudioMedia, studioDropFile } from "../studio/media-drop";
import "./project-prompt.css";
import { readVersionBrief } from "./version-brief";
import { PROJECT_ASSET_DRAG, readAssetDrag } from "./asset-drag";
import { useShell } from "../studio/ShellContext";
import {
  PromptAssetPicker,
  type PromptKind,
  type PromptPicker,
} from "./PromptAssetPicker";
import {
  insertPromptReference,
  promptReferencePurpose,
  type ReferencePurpose,
} from "./prompt-insertion";
import { PromptReferencePreview } from "./PromptReferencePreview";
import "./prompt-references.css";
import "./prompt-fields.css";

export default function ProjectPrompt({
  bundle,
  disabled,
}: {
  bundle: Bundle;
  disabled: boolean;
}) {
  const actions = useStudio((s) => s.actions);
  const shell = useShell();
  const director = shell?.preset === "director";
  const brief = readVersionBrief(bundle);
  const field = useRef<PromptTextHandle>(null);
  const root = useRef<HTMLElement>(null);
  const uploadingRef = useRef(false);
  const fontInput = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const mention = useRef<{ start: number; end: number } | null>(null);
  const selection = useRef({
    start: brief.text.length,
    end: brief.text.length,
  });
  const [picker, setPicker] = useState<PromptPicker | null>(null);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PromptReference | null>(null);
  const blocked = disabled || uploading;
  function save(next: PromptBrief, source = bundle) {
    if (disabled) return;
    actions.commit(writeBrief(source, next), bundle);
    setNotice("");
  }
  function close() {
    setPicker(null);
    mention.current = null;
    if (opener.current) opener.current.focus();
    else field.current?.focus();
  }
  function open(
    kind: PromptKind,
    button: HTMLElement,
    options: { purpose?: ReferencePurpose; swap?: string } = {},
  ) {
    mention.current = null;
    opener.current = button;
    setPicker({ kind, ...options });
    setNotice("");
  }
  function choose(
    reference: Omit<PromptReference, "id" | "label">,
    source = bundle,
    target = picker,
  ) {
    if (!target || blocked) return;
    const replacing = brief.references.find((r) => r.id === target.swap);
    if (replacing) {
      save(
        {
          ...brief,
          references: brief.references.map((r) =>
            r.id === replacing.id
              ? { id: r.id, label: r.label, ...reference }
              : r,
          ),
        },
        source,
      );
      close();
      return;
    }
    const room = withReferenceRoom(brief);
    if (!room) {
      setNotice("Use up to 32 references in a prompt.");
      return;
    }
    const asset = reference.assetId
      ? source.project.assets[reference.assetId]
      : undefined;
    const label = nextReferenceLabel(
      room,
      reference.font
        ? "Font"
        : asset?.use === "reference"
          ? "Inspiration"
          : asset?.kind === "video"
            ? "Video"
            : "Image",
    );
    const ref = { ...reference, id: crypto.randomUUID(), label };
    const { start, end } = mention.current ?? selection.current;
    let inserted;
    try {
      inserted = insertPromptReference(
        brief.text,
        label,
        start,
        end,
        target.purpose,
      );
    } catch (error) {
      setNotice((error as Error).message);
      return;
    }
    const { text, caret } = inserted;
    mention.current = null;
    save({ ...room, text, references: [...room.references, ref] }, source);
    setPicker(null);
    selection.current = {
      start: caret,
      end: caret,
    };
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(caret, caret);
    });
  }
  function anchor() {
    const rect = field.current?.caretRect(),
      box = root.current?.getBoundingClientRect();
    return rect && box
      ? { x: Math.max(0, rect.left - box.left), y: rect.bottom - box.top + 8 }
      : undefined;
  }
  function swap(r: PromptReference, button: HTMLElement) {
    open(
      r.font
        ? "font"
        : r.assetId && bundle.project.assets[r.assetId]?.kind === "video"
          ? "video"
          : "image",
      button,
      { swap: r.id, purpose: promptReferencePurpose(brief.text, r.label) },
    );
  }
  /**
   * A dropped file or project asset becomes a new reference, or, dropped on
   * a reference chip (`swap`), replaces that reference's file in place.
   */
  async function drop(
    transfer: DataTransfer,
    purpose?: ReferencePurpose,
    swap?: PromptReference,
  ) {
    if (blocked || uploadingRef.current) return;
    setDragging(false);
    mention.current = null;
    const current = swap?.assetId
      ? bundle.project.assets[swap.assetId]
      : undefined;
    const wanted =
      current?.kind === "video"
        ? ["video"]
        : purpose || current
          ? ["image"]
          : ["image", "video"];
    const refuse = () =>
      new Error(
        swap
          ? `Drop ${wanted[0] === "video" ? "a video" : "an image"} to replace ${swap.label}.`
          : purpose
            ? "Choose an image for this reference."
            : "Use an image or video as a prompt reference.",
      );
    const target = (kind: string) => ({
      kind: kind as "image" | "video",
      purpose,
      swap: swap?.id,
    });
    try {
      if (transfer.types.includes(PROJECT_ASSET_DRAG)) {
        const { assetId, asset } = readAssetDrag(transfer, bundle);
        if (!wanted.includes(asset.kind)) throw refuse();
        choose({ assetId }, bundle, target(asset.kind));
        return;
      }
      // Capture protected DataTransfer synchronously before awaiting media work.
      const pending = studioDropFile(transfer, bundle, shell?.library);
      uploadingRef.current = true;
      setUploading(true);
      const file = await pending;
      if (!file) throw new Error("Drop a media file here.");
      const kind = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
          ? "image"
          : "";
      if (!wanted.includes(kind)) throw refuse();
      const imported = await importAssets(
        bundle,
        [file],
        purpose === "Style" || current?.use === "reference"
          ? "reference"
          : "production",
      );
      if (studioStore.getState().director.bundle !== bundle)
        throw new Error("Project changed; drop the file again.");
      choose({ assetId: imported.assetIds[0] }, imported.bundle, target(kind));
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }
  function dragOver(event: React.DragEvent) {
    if (!acceptsStudioMedia(event.dataTransfer.types)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = blocked ? "none" : "copy";
    if (!blocked) setDragging(true);
  }
  return (
    <section
      className="project-prompt"
      aria-label="Project prompt"
      data-dragging={dragging || undefined}
      ref={root}
      onDragOver={dragOver}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        if (!acceptsStudioMedia(event.dataTransfer.types)) return;
        event.preventDefault();
        event.stopPropagation();
        void drop(event.dataTransfer);
      }}
    >
      <div className="project-prompt-heading">
        <h3>Describe your animation</h3>
        <span>Assets stay linked to your words</span>
      </div>
      {director && (
        <div
          className="prompt-reference-toolbar"
          aria-label="Add prompt reference"
        >
          <button
            type="button"
            disabled={blocked}
            aria-expanded={picker?.purpose === "Character"}
            onDragOver={dragOver}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void drop(e.dataTransfer, "Character");
            }}
            onClick={(e) =>
              open("image", e.currentTarget, { purpose: "Character" })
            }
          >
            <Icon name="image" size={17} /> Character
          </button>
          <button
            type="button"
            disabled={blocked}
            aria-expanded={picker?.purpose === "Style"}
            onDragOver={dragOver}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void drop(e.dataTransfer, "Style");
            }}
            onClick={(e) =>
              open("image", e.currentTarget, { purpose: "Style" })
            }
          >
            <Icon name="palette" size={17} /> Style
          </button>
          <button
            type="button"
            disabled={blocked}
            aria-expanded={!!picker && !picker.purpose}
            onClick={(e) => open("references", e.currentTarget)}
          >
            <Icon name="plus" size={17} /> Add
          </button>
        </div>
      )}
      <PromptText
        ref={field}
        bundle={bundle}
        value={brief.text}
        references={brief.references}
        disabled={blocked}
        onSelect={(next) => {
          selection.current = next;
        }}
        onChange={(text, caret) => {
          save({ ...brief, text });
          const match = director ? promptMention(text, caret) : undefined;
          if (match) {
            mention.current = { start: match.start, end: match.end };
            opener.current = null;
            const intent = mentionIntent(match.query);
            setPicker({
              ...intent,
              inline: true,
              query: intent.search,
              anchor: anchor(),
            });
          } else if (picker?.inline) {
            setPicker(null);
            mention.current = null;
          }
        }}
        onSwap={swap}
        onPreview={(r) => {
          setPicker(null);
          mention.current = null;
          setPreview(r);
        }}
        onDropOn={(r, transfer) =>
          void drop(transfer, promptReferencePurpose(brief.text, r.label), r)
        }
        onUndo={actions.undo}
        menuOpen={!!picker}
        onMenuNext={() =>
          root.current
            ?.querySelector<HTMLButtonElement>("[data-suggestion]")
            ?.focus()
        }
        onMenuClose={close}
      />
      <div className="prompt-reference-actions">
        {!director &&
          (["image", "video", "font"] as const).map((kind) => (
            <button
              type="button"
              disabled={blocked}
              key={kind}
              onClick={(e) => open(kind, e.currentTarget)}
            >
              +{" "}
              {kind === "image" ? "Image" : kind === "video" ? "Video" : "Font"}
            </button>
          ))}
        <button
          type="button"
          disabled={blocked || !brief.text.trim()}
          onClick={() => {
            try {
              download(briefArchive(bundle), `${bundle.project.id}-brief.zip`);
              setNotice("Brief and referenced files downloaded.");
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Could not prepare brief",
              );
            }
          }}
        >
          Download brief + files
        </button>
      </div>
      {picker && (
        <PromptAssetPicker
          key={`${picker.kind}-${picker.purpose ?? ""}-${picker.swap ?? ""}`}
          bundle={bundle}
          brief={brief}
          picker={picker}
          blocked={blocked}
          onChoose={(reference) => choose(reference)}
          onClose={close}
          onKind={(kind, purpose) =>
            setPicker({ ...picker, kind, purpose, inline: false, query: "" })
          }
          onAddFont={() => fontInput.current?.click()}
          onOpenAssets={(role) =>
            actions.workspace({
              drawerOpen: true,
              assetRole: role === "reference" ? "reference" : "production",
              targetLayers: [],
            })
          }
          onRemove={() => {
            const ref = brief.references.find((r) => r.id === picker.swap);
            if (ref)
              save({
                ...brief,
                text: brief.text.split(`[${ref.label}]`).join(""),
                references: brief.references.filter((r) => r.id !== ref.id),
              });
            close();
            requestAnimationFrame(() => field.current?.focus());
          }}
        />
      )}
      <input
        hidden
        ref={fontInput}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        aria-label="Add prompt font"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || blocked) return;
          setUploading(true);
          try {
            const result = await importPromptFont(bundle, file);
            if (studioStore.getState().director.bundle !== bundle)
              throw new Error("Project changed; choose the font again.");
            choose(result.reference, result.bundle);
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : "Could not add font",
            );
          } finally {
            setUploading(false);
          }
        }}
      />
      <p className="prompt-brief-hint">
        {director
          ? "Type add or @ to add a reference. Drop an image or video here, or click a reference to swap it."
          : "Drag an asset or inspiration here to reference it. Click a reference to swap it."}
      </p>
      {notice && <p role="status">{notice}</p>}
      {preview && (
        <PromptReferencePreview
          bundle={bundle}
          reference={preview}
          onClose={() => {
            setPreview(null);
            requestAnimationFrame(() => field.current?.focus());
          }}
        />
      )}
    </section>
  );
}
