import * as T from "three";
type Media = {
  texture: T.Texture;
  video?: HTMLVideoElement;
  bitmap?: ImageBitmap;
  url?: string;
  bytes: number;
};
function release(m: Media) {
  m.video?.pause();
  if (m.video) {
    m.video.removeAttribute("src");
    m.video.load();
  }
  m.texture.dispose();
  m.bitmap?.close();
  if (m.url) URL.revokeObjectURL(m.url);
}
/** Local, bounded media slots. Each video seeks to the capture frame's timestamp. */
export function createSceneMedia() {
  const slots = new Map<string, Media>(),
    versions = new Map<string, number>();
  let disposed = false;
  return {
    texture: (target: string) => slots.get(target)?.texture,
    has: (target: string) => slots.has(target),
    clear(target: string) {
      versions.set(target, (versions.get(target) ?? 0) + 1);
      const old = slots.get(target);
      if (old) release(old);
      slots.delete(target);
    },
    retain(targets: Set<string>) {
      for (const key of slots.keys()) if (!targets.has(key)) this.clear(key);
    },
    async load(target: string, blob: Blob) {
      if (blob.size > 64 * 1024 * 1024)
        throw new Error("Texture limit: 64 MB per file.");
      if (
        [...slots.entries()].reduce(
          (n, [key, m]) => n + (key === target ? 0 : m.bytes),
          blob.size,
        ) >
        128 * 1024 * 1024
      )
        throw new Error("Texture library limit: 128 MB.");
      const version = (versions.get(target) ?? 0) + 1;
      versions.set(target, version);
      let media: Media;
      if (blob.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(blob, {
          imageOrientation: "flipY",
        });
        if (bitmap.width * bitmap.height > 32_000_000) {
          bitmap.close();
          throw new Error("Texture image exceeds 32 megapixels.");
        }
        const texture = new T.Texture(bitmap);
        texture.needsUpdate = true;
        media = { texture, bitmap, bytes: blob.size };
      } else if (blob.type.startsWith("video/")) {
        const url = URL.createObjectURL(blob),
          video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        try {
          await new Promise<void>((resolve, reject) => {
            const end = () => {
              clearTimeout(timer);
              video.onloadeddata = null;
              video.onerror = null;
            };
            const fail = () => {
              end();
              reject(new Error("Video texture could not load."));
            };
            const timer = setTimeout(fail, 8000);
            video.onloadeddata = () => {
              end();
              resolve();
            };
            video.onerror = fail;
            video.src = url;
          });
          if (
            !Number.isFinite(video.duration) ||
            video.duration > 600 ||
            video.videoWidth * video.videoHeight > 8_300_000
          )
            throw new Error("Use a video under 10 minutes and at most 4K.");
          media = {
            texture: new T.VideoTexture(video),
            video,
            url,
            bytes: blob.size,
          };
        } catch (error) {
          URL.revokeObjectURL(url);
          video.removeAttribute("src");
          video.load();
          throw error;
        }
      } else throw new Error("Choose an image or video.");
      if (disposed || versions.get(target) !== version) {
        release(media);
        return;
      }
      media.texture.colorSpace = T.SRGBColorSpace;
      const old = slots.get(target);
      if (old) release(old);
      slots.set(target, media);
    },
    async seek(frame: number, fps: number) {
      for (const m of slots.values()) {
        const video = m.video;
        if (!video) continue;
        const target = Math.min(
          frame / fps,
          Math.max(0, video.duration - 0.001),
        );
        if (Math.abs(video.currentTime - target) > 0.0001)
          await new Promise<void>((resolve, reject) => {
            const end = () => {
              clearTimeout(timer);
              video.removeEventListener("seeked", ok);
              video.removeEventListener("error", fail);
            };
            const ok = () => {
              end();
              resolve();
            };
            const fail = () => {
              end();
              reject(new Error("Video texture seek failed."));
            };
            const timer = setTimeout(fail, 5000);
            video.addEventListener("seeked", ok, { once: true });
            video.addEventListener("error", fail, { once: true });
            video.currentTime = target;
          });
        m.texture.needsUpdate = true;
      }
    },
    assertReady(targets: string[]) {
      for (const target of targets)
        if (!slots.has(target))
          throw new Error(`Reattach the texture for ${target} before capture.`);
    },
    dispose() {
      disposed = true;
      for (const key of slots.keys()) this.clear(key);
    },
  };
}
