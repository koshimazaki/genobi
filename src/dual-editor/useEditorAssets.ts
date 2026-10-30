import { useCallback, useEffect, useRef, useState } from "react";
import type { Source } from "../../shared/types";
import { parseLibrary } from "../../shared/library";
import catalogue from "../../public/media/gallery.json";
import { arenaAsset } from "../arena/arena-drag";

export interface EditorVideoAsset {
  id: string;
  name: string;
  url: string;
  poster?: string;
  origin: "library" | "director" | "local";
  file?: File;
  mediaType?: "image" | "video";
}
const shipped: EditorVideoAsset[] = parseLibrary(catalogue).map((item) => ({
  id: `director:${item.id}`,
  name: item.label,
  url: item.url,
  poster: item.poster,
  origin: "library",
  mediaType: item.mediaType === "image" ? "image" : "video",
}));

/** Same-origin Director assets + File references retained only for this tab. */
export function useEditorAssets(enabled = true) {
  const [remote, setRemote] = useState(shipped),
    [local, setLocal] = useState<EditorVideoAsset[]>([]);
  const [status, setStatus] = useState("");
  const remoteRef = useRef(shipped);
  const localRef = useRef<EditorVideoAsset[]>([]);
  const cache = useRef(new Map<string, File>());
  const pending = useRef(new Map<string, Promise<File>>());
  const active = useRef(new Set<AbortController>());
  const refresh = useCallback(async () => {
    const controller = new AbortController();
    active.current.add(controller);
    try {
      setStatus("Refreshing Director…");
      const response = await fetch("/api/history", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          "Director's session assets are unavailable. The library and local files still work.",
        );
      const data = (await response.json()) as { sources: Source[] };
      if (!Array.isArray(data.sources))
        throw new Error("Director returned an invalid asset list.");
      const next: EditorVideoAsset[] =
        // Frames and timelines take pictures and video, not audio tracks.
        data.sources
          .filter((item) => item.mediaType !== "audio")
          .map((item) => ({
            id: `director:${item.id}`,
            name: item.label,
            url: item.url,
            poster: item.poster,
            origin: item.origin === "sample" ? "library" : "director",
            mediaType: item.mediaType === "image" ? "image" : "video",
          }));
      remoteRef.current = next;
      setRemote(next);
      setStatus("");
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus(
          error instanceof Error
            ? error.message
            : "Could not refresh Director assets.",
        );
    } finally {
      active.current.delete(controller);
    }
  }, []);
  useEffect(() => {
    const controllers = active.current;
    if (!enabled) return;
    void refresh();
    const refreshOnFocus = () => void refresh();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      for (const controller of controllers) controller.abort();
    };
  }, [refresh, enabled]);
  useEffect(
    () => () => {
      for (const asset of localRef.current) URL.revokeObjectURL(asset.url);
      localRef.current = [];
      cache.current.clear();
    },
    [],
  );

  function addLocal(file: File) {
    // File identity is intentional: different files with the same name are distinct.
    if (localRef.current.some((asset) => asset.file === file)) return;
    const asset: EditorVideoAsset = {
      id: `local:${crypto.randomUUID()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      origin: "local",
      file,
      mediaType: file.type.startsWith("image/") ? "image" : "video",
    };
    const next = [...localRef.current, asset];
    if (next.length > 20) URL.revokeObjectURL(next.shift()!.url);
    localRef.current = next;
    setLocal(next);
  }
  function removeLocal(id: string) {
    const asset = localRef.current.find((item) => item.id === id);
    if (asset) URL.revokeObjectURL(asset.url);
    localRef.current = localRef.current.filter((item) => item.id !== id);
    setLocal(localRef.current);
  }
  async function resolve(id: string): Promise<File | undefined> {
    let asset = [...localRef.current, ...remoteRef.current].find(
      (item) => item.id === id,
    );
    // Media dragged out of Arena: same-origin and owner-checked by its route.
    asset ??= arenaAsset(id);
    if (!asset) {
      await refresh();
      asset = [...localRef.current, ...remoteRef.current].find(
        (item) => item.id === id,
      );
    }
    if (!asset)
      throw new Error(
        "This asset is no longer in the drawer. Refresh Director assets.",
      );
    if (asset.file) return asset.file;
    if (cache.current.has(id)) return cache.current.get(id);
    if (pending.current.has(id)) return pending.current.get(id);
    const url = new URL(asset.url, location.origin);
    if (url.origin !== location.origin)
      throw new Error("Only this Director's saved assets can be loaded.");
    const controller = new AbortController();
    active.current.add(controller);
    const task = (async () => {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok || !response.body)
        throw new Error("This saved clip is unavailable or has expired.");
      const limit = 512 * 1024 ** 2;
      if (Number(response.headers.get("content-length")) > limit)
        throw new Error(
          "For clips above 512 MB, download and open the local file.",
        );
      const reader = response.body.getReader(),
        chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > limit)
            throw new Error(
              "For clips above 512 MB, download and open the local file.",
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const type =
        response.headers.get("content-type")?.split(";")[0] || "video/mp4";
      if (
        !type.startsWith("video/") &&
        ![
          "image/png",
          "image/jpeg",
          "image/webp",
          "application/octet-stream",
        ].includes(type)
      )
        throw new Error("This asset is not a supported image or video.");
      const extension =
        type === "image/png"
          ? "png"
          : type === "image/jpeg"
            ? "jpg"
            : type === "image/webp"
              ? "webp"
              : type.includes("webm")
                ? "webm"
                : "mp4";
      const file = new File(chunks, `${asset.name}.${extension}`, { type });
      // Bound the cached downloads to 512 MB; File references in open slots live separately.
      let total = [...cache.current.values()].reduce(
        (sum, entry) => sum + entry.size,
        0,
      );
      while (total + file.size > limit && cache.current.size) {
        const key = cache.current.keys().next().value!;
        total -= cache.current.get(key)!.size;
        cache.current.delete(key);
      }
      cache.current.set(id, file);
      return file;
    })();
    pending.current.set(id, task);
    try {
      return await task;
    } finally {
      pending.current.delete(id);
      active.current.delete(controller);
    }
  }
  return {
    assets: [...local, ...remote],
    status,
    refresh,
    addLocal,
    removeLocal,
    resolve,
  };
}
export type EditorAssets = ReturnType<typeof useEditorAssets>;
