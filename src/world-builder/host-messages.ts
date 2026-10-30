import type { AudioSource } from "./audio-history";
import type { SceneAdapter } from "./scene-adapter";

/**
 * Messages from the window that opened or embeds the builder (the Director,
 * or Comfy's World Builder panel). Same origin and the exact host only; each
 * payload is a Blob or a recipe, never a path or URL to fetch.
 */
export function hostMessages({
  host,
  adapter,
  loadAudio,
  rememberAudio,
  fail,
}: {
  host: () => Window | null;
  adapter: SceneAdapter;
  loadAudio: (blob: Blob, source: AudioSource) => Promise<void>;
  /** Lists a track in Recent audio without loading it. */
  rememberAudio: (blob: Blob, source: AudioSource, label?: string) => unknown;
  fail: (error: unknown) => void;
}) {
  return (event: MessageEvent) => {
    const data = event.data;
    if (
      event.origin !== location.origin ||
      event.source !== host() ||
      !data ||
      typeof data !== "object"
    )
      return;
    if (data.type === "director:screen" && data.blob instanceof Blob)
      void adapter.setScreen(data.blob).catch(fail);
    if (data.type === "director:audio" && data.blob instanceof Blob)
      void loadAudio(data.blob, "comfy").catch(fail);
    // Comfy's recent audio outputs, offered in the Sound tab to pick from.
    if (
      data.type === "director:recent-audio" &&
      data.blob instanceof Blob &&
      data.blob.size <= 32 * 1024 * 1024
    )
      void Promise.resolve(
        rememberAudio(
          data.blob,
          "comfy",
          typeof data.name === "string" ? data.name : undefined,
        ),
      ).catch(fail);
    if (data.type === "director:assets")
      void (async () => {
        if (data.audio instanceof Blob) await loadAudio(data.audio, "comfy");
        if (data.screen instanceof Blob) await adapter.setScreen(data.screen);
      })().catch(fail);
    if (data.type === "director:recipe")
      void adapter.configure(data.recipe).catch(fail);
    // Comfy shows this editor inline in its node, then full size when opened.
    if (data.type === "director:layout") {
      if (data.compact === true)
        document.documentElement.dataset.wbLayout = "compact";
      else delete document.documentElement.dataset.wbLayout;
    }
  };
}
