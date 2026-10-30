import ThemedSelect from "../components/ThemedSelect";
import { acceptsStudioMedia, studioDropFile } from "../studio/media-drop";
import { useShell } from "../studio/ShellContext";
import { studioStore } from "../studio/store";
import { scrollExamples } from "./example-catalog";
import { MAX_IMAGE_REFERENCES } from "../../shared/image";
import type { useScrolls } from "./useScrolls";

/** A Scrolls result dragged within Scrolls carries its asset ID only. */
export const SCROLL_ASSET_DRAG = "application/x-genobi-scroll-asset";
const accepts = (types: readonly string[]) =>
  types.includes(SCROLL_ASSET_DRAG) || acceptsStudioMedia(types);

/**
 * "Like these": the sheets the next run is made like, as a compact chip row
 * under the brief. Pick an image already in this scroll, or a library example
 * (added as a style reference without changing the board's sheet). The row
 * keeps one height whatever is picked; chips scroll sideways.
 */
export function ScrollReferences({
  s,
  urls,
}: {
  s: ReturnType<typeof useScrolls>;
  urls: Record<string, string>;
}) {
  const shell = useShell();
  const d = s.bundle.document,
    picked = s.references,
    disabled = s.busy || !!s.pending;
  const available = d.assets.filter(
    (a) => a.kind === "image" && !picked.some((p) => p.id === a.id),
  );
  async function add(value: string) {
    if (value.startsWith("asset:"))
      return s.setReferences([...picked.map((a) => a.id), value.slice(6)]);
    const example = scrollExamples.find((e) => `example:${e.file}` === value);
    if (!example) return;
    try {
      const response = await fetch(`/scrolls/${example.file}`);
      if (!response.ok) throw new Error("Could not load the example.");
      await s.addReference(
        new File([await response.blob()], `${example.name}.png`, {
          type: "image/png",
        }),
      );
    } catch (error) {
      s.setMessage((error as Error).message);
    }
  }
  /**
   * A drop: a Scrolls result by ID, or (through the studio's shared drop
   * reader) a file, a project asset of the open Director project, or a
   * library item. Identity is read synchronously; only images are taken.
   */
  function drop(transfer: DataTransfer) {
    if (picked.length >= MAX_IMAGE_REFERENCES)
      return s.setMessage(
        `Use up to ${MAX_IMAGE_REFERENCES} references; remove one first.`,
      );
    const id = transfer.getData(SCROLL_ASSET_DRAG);
    if (id) {
      if (!available.some((a) => a.id === id))
        return s.setMessage("That image is already a reference.");
      return void add(`asset:${id}`);
    }
    void studioDropFile(
      transfer,
      studioStore.getState().director.bundle,
      shell?.library,
    )
      .then((file) => {
        if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type))
          throw new Error("Drop a PNG, JPEG or WebP sheet as a reference.");
        return s.addReference(file);
      })
      .catch((error: Error) => s.setMessage(error.message));
  }
  return (
    <div
      className="scroll-references"
      aria-label="Make one like these"
      onDragOver={(e) => {
        if (!disabled && accepts(e.dataTransfer.types)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (disabled || !accepts(e.dataTransfer.types)) return;
        e.preventDefault();
        drop(e.dataTransfer);
      }}
    >
      <span className="scroll-references__label">Like these</span>
      <ul className="scroll-references__chips">
        {picked.length ? (
          picked.map((a) => (
            <li
              key={a.id}
              title={`${a.name}\n${a.prompt ?? "No prompt recorded."}`}
            >
              <img src={urls[a.id]} alt="" />
              <span>{a.name}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove reference ${a.name}`}
                onClick={() =>
                  s.setReferences(
                    picked.filter((p) => p.id !== a.id).map((p) => p.id),
                  )
                }
              >
                ×
              </button>
            </li>
          ))
        ) : (
          <li className="scroll-references__empty">
            None: the brief alone describes the image.
          </li>
        )}
      </ul>
      <label>
        <span className="scroll-references__add">Add reference</span>
        <ThemedSelect
          value=""
          disabled={disabled || picked.length >= MAX_IMAGE_REFERENCES}
          onChange={(e) => void add(e.target.value)}
        >
          <option value="">Choose a sheet…</option>
          {available.map((a) => (
            <option key={a.id} value={`asset:${a.id}`}>
              {a.name}
            </option>
          ))}
          {scrollExamples.map((e) => (
            <option key={e.file} value={`example:${e.file}`}>
              {`Example · ${e.name}`}
            </option>
          ))}
        </ThemedSelect>
      </label>
    </div>
  );
}
