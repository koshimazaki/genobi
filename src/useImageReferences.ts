import { videoReferenceLimit } from "../shared/h3";
import { useRef, useState } from "react";
import type { ComposerState } from "./useComposer";
import { readReference } from "./image-files";
import { remapReferences } from "./image-regions";
import { useShell } from "./studio/ShellContext";
import { studioDropFiles } from "./studio/media-drop";
import { studioStore } from "./studio/store";

export const REFERENCE_DRAG = "application/x-camera-director-reference";
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export function useImageReferences(
  state: ComposerState,
  update: (patch: Partial<ComposerState>) => void,
) {
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  const [loading, setLoading] = useState(false),
    [notice, setNotice] = useState("");
  const library = useShell()?.library;
  /**
   * A drop from disk, or an image dragged from the project's assets
   * (Project or Inspirations) or the library: the drag's identity is read
   * during the event, its bytes resolved from this project or library.
   */
  function drop(
    transfer: DataTransfer,
    target: "source" | "tray" | string = "tray",
  ) {
    studioDropFiles(transfer, studioStore.getState().director.bundle, library)
      .then((files) => add(files, target))
      .catch((error: unknown) =>
        setNotice(
          error instanceof Error ? error.message : "Could not read image.",
        ),
      );
  }
  async function add(
    files: File[],
    target: "source" | "tray" | string = "tray",
  ) {
    if (!files.length || busy.current) return;
    const origin = latest.current;
    const refs = origin.imageReferences ?? [];
    const source = target === "source";
    const region = target !== "source" && target !== "tray";
    const batch = source || region ? files.slice(0, 1) : files;
    const max = videoReferenceLimit(origin.model);
    if (refs.length + batch.length - (source && refs.length ? 1 : 0) > max) {
      setNotice(
        `Up to ${max} images. Remove a reference before adding another.`,
      );
      return;
    }
    busy.current = true;
    setLoading(true);
    setNotice("");
    try {
      const added = await Promise.all(batch.map(readReference));
      const current = latest.current;
      // Ignore a file read if the user changed workflow/source while it was pending.
      if (
        current.generator !== origin.generator ||
        current.model !== origin.model ||
        current.imageReferences !== origin.imageReferences
      ) {
        setNotice(
          "The workspace changed while reading. Please drop the image again.",
        );
        return;
      }
      const next = source ? [added[0], ...refs.slice(1)] : [...refs, ...added];
      if (next.reduce((n, r) => n + r.length, 0) > 14 * 1024 * 1024)
        throw new Error(
          "Use smaller images: references exceed the combined size limit.",
        );
      update({
        imageReferences: next,
        imageRegions: source
          ? []
          : current.imageRegions.map((r) =>
              r.id === target
                ? { ...r, action: "change", referenceIndex: refs.length }
                : r,
            ),
      });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not read image.",
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  function remove(index: number) {
    if (busy.current) return;
    const current = latest.current,
      refs = current.imageReferences ?? [];
    // Removing the source must not promote an unrelated reference into its place.
    const order =
      index === 0 && current.generator === "edit"
        ? []
        : refs.map((_, i) => i).filter((i) => i !== index);
    update({
      imageReferences: order.map((i) => refs[i]),
      imageRegions:
        index === 0 ? [] : remapReferences(current.imageRegions, order),
    });
    setNotice(
      index === 0 && current.generator === "edit"
        ? "Source and its references cleared."
        : "Image numbers changed; check any numbers typed in your prompt.",
    );
  }
  function earlier(index: number) {
    if (busy.current || index < 1) return;
    const current = latest.current,
      refs = current.imageReferences ?? [];
    const order = refs.map((_, i) => i);
    [order[index - 1], order[index]] = [order[index], order[index - 1]];
    update({
      imageReferences: order.map((i) => refs[i]),
      imageRegions:
        index === 1 ? [] : remapReferences(current.imageRegions, order),
    });
    setNotice(
      "Image order changed; check any image numbers typed in your prompt.",
    );
  }
  function assign(id: string, index: number) {
    const current = latest.current;
    if (
      busy.current ||
      !Number.isInteger(index) ||
      !current.imageReferences?.[index]
    )
      return;
    update({
      imageRegions: current.imageRegions.map((r) =>
        r.id === id ? { ...r, action: "change", referenceIndex: index } : r,
      ),
    });
  }
  return { add, drop, remove, earlier, assign, loading, notice };
}
export type ImageReferences = ReturnType<typeof useImageReferences>;
