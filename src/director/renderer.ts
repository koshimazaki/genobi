import { recipeResolution } from "./recipe-resolution";
import type { Bundle } from "./bundle";
import { digest } from "./bundle";
import { recipes, libraries } from "./recipes";
import {
  active,
  localSeconds,
  visualAt,
  type Layer,
} from "../../shared/director/types";
import type { GraphicsInstance } from "./module-types";
import { FilterHost } from "./filter-host";
import { canvas } from "./media";
import type { Texture } from "three";
import { openVideo } from "./video-source";
import type { FontResolution } from "../../shared/director/fonts";
import { fontRequest, preloadBundledFonts, resolveFont } from "./font-registry";

export class DirectorRenderer {
  readonly audio = new AudioContext({ sampleRate: 48000 });
  readonly composite: HTMLCanvasElement;
  private filter: FilterHost;
  private videos = new Map<string, Awaited<ReturnType<typeof openVideo>>>();
  private images = new Map<string, HTMLImageElement>();
  private buffers = new Map<string, AudioBuffer>();
  private graphics = new Map<string, GraphicsInstance>();
  /** Each `font` layer's resolved face, the same for preview and export. */
  readonly fonts = new Map<string, FontResolution>();
  private urls: string[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private disposed = false;
  private serial: Promise<void> = Promise.resolve();
  constructor(
    readonly bundle: Bundle,
    readonly output: HTMLCanvasElement,
  ) {
    const { width, height } = bundle.project.composition;
    output.width = width;
    output.height = height;
    this.composite = canvas(width, height);
    this.filter = new FilterHost(this.composite);
  }
  async init() {
    try {
      await document.fonts.ready;
      await preloadBundledFonts(
        this.bundle.project.layers.flatMap((l) =>
          "parameters" in l && typeof l.parameters.weight === "number"
            ? [l.parameters.weight]
            : [],
        ),
      );
      const approved = await Promise.all(
        recipes.map(async (r) => ({
          ...r,
          hash: await digest(new TextEncoder().encode(r.source)),
        })),
      );
      const resolved = new Map<string, (typeof approved)[number]>();
      for (const [id, m] of Object.entries(this.bundle.project.modules)) {
        const r = approved.find(
          (r) =>
            r.hash === m.file.sha256 &&
            r.engine === m.engine &&
            r.version === m.engineVersion &&
            r.mode === m.mode,
        );
        if (!r)
          throw new Error(
            `Unregistered graphics module: ${id}. Add and review this recipe in the local source first.`,
          );
        resolved.set(id, r);
      }
      const used = new Set(
        this.bundle.project.layers.flatMap((l) =>
          "assetId" in l ? [l.assetId] : [],
        ),
      );
      for (const [id, a] of Object.entries(this.bundle.project.assets)) {
        if (a.use === "reference" || !used.has(id)) continue;
        const bytes = this.bundle.files.get(a.file.path)!;
        if (a.kind === "audio") {
          const b = await this.audio.decodeAudioData(bytes.slice().buffer);
          if (b.duration + 0.02 < (a.durationSeconds ?? 0))
            throw new Error(`Audio duration mismatch: ${id}`);
          this.buffers.set(id, b);
          continue;
        }
        if (a.kind === "image" && !/\.(png|jpe?g|webp)$/i.test(a.file.path))
          throw new Error("Production images must be PNG, JPEG or WebP");
        const url = URL.createObjectURL(new Blob([bytes]));
        this.urls.push(url);
        if (a.kind === "image") {
          const img = new Image();
          img.src = url;
          await img.decode();
          if (img.width * img.height > 16000000)
            throw new Error("Image exceeds 16 megapixels");
          this.images.set(id, img);
        }
      }
      for (const l of this.bundle.project.layers) {
        if (l.kind === "video") {
          const a = this.bundle.project.assets[l.assetId];
          const video = await openVideo(
            this.bundle.files.get(a.file.path)!,
            l.name,
          );
          this.videos.set(l.id, video);
          if (
            video.duration + 0.02 < (a.durationSeconds ?? 0) ||
            !Number.isFinite(video.duration)
          )
            throw new Error(`Video duration mismatch: ${l.name}`);
        }
        if ("moduleId" in l) {
          let parameters = recipeResolution(this.bundle.project, l);
          const request = fontRequest(
            parameters,
            this.bundle.project.modules[l.moduleId].parameterSchema,
          );
          if (request) {
            const r = await resolveFont(
              request.stack,
              request.weight,
              request.text,
            );
            this.fonts.set(l.id, r);
            parameters = { ...parameters, font: r.stack };
          }
          const instance = await resolved.get(l.moduleId)!.create({
            canvas: canvas(this.output.width, this.output.height),
            width: this.output.width,
            height: this.output.height,
            parameters,
            libraries,
            renderer: this.filter.renderer,
          });
          if (instance.output instanceof HTMLCanvasElement)
            instance.output.remove();
          this.graphics.set(l.id, instance);
        }
      }
      this.output.dataset.fonts = [...this.fonts]
        .map(([id, r]) => `${id}:${r.used}`)
        .join("|");
      return this;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  /** `override` replaces one layer for this frame only, as a trim preview. */
  render(frame: number, override?: Layer) {
    const task = this.serial.then(() => this.draw(frame, override));
    this.serial = task.catch(() => {});
    return task;
  }
  private async draw(frame: number, override?: Layer) {
    if (this.disposed) return;
    const p = this.bundle.project,
      { width, height, fps } = p.composition;
    const ctx = this.composite.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    for (const l of override
      ? p.layers.map((l) => (l.id === override.id ? override : l))
      : p.layers) {
      if (!active(l, frame) || l.kind === "audio") continue;
      const timeSeconds = localSeconds(l, frame, fps);
      if (l.kind === "filter") {
        const g = this.graphics.get(l.id)!;
        this.filter.texture.needsUpdate = true;
        await g.render({ timeSeconds, inputTexture: this.filter.texture });
        const result = this.filter.output(g.output as Texture);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(result, 0, 0);
        continue;
      }
      let source: CanvasImageSource;
      let sw = width,
        sh = height;
      if (l.kind === "video") {
        const v = await this.videos
          .get(l.id)!
          .at(timeSeconds + l.sourceStartFrame / fps);
        if (this.disposed) return;
        source = v;
        sw = v.width;
        sh = v.height;
      } else if (l.kind === "image") {
        const img = this.images.get(l.assetId)!;
        source = img;
        sw = img.width;
        sh = img.height;
      } else {
        const g = this.graphics.get(l.id)!;
        await g.render({ timeSeconds });
        if (this.disposed) return;
        source = g.output as HTMLCanvasElement;
      }
      const v = visualAt(l, frame),
        fit = Math.min(width / sw, height / sh);
      ctx.save();
      // 4K studio footage drawn into a 1080p frame: filter it, not skip pixels.
      ctx.imageSmoothingQuality = "high";
      ctx.globalAlpha = v.opacity;
      ctx.translate(width / 2 + v.position.x, height / 2 + v.position.y);
      ctx.rotate((v.rotationDegrees * Math.PI) / 180);
      ctx.scale(v.scale, v.scale);
      ctx.drawImage(
        source,
        (-sw * fit) / 2,
        (-sh * fit) / 2,
        sw * fit,
        sh * fit,
      );
      ctx.restore();
    }
    const out = this.output.getContext("2d")!;
    out.fillStyle = p.composition.background;
    out.fillRect(0, 0, width, height);
    out.drawImage(this.composite, 0, 0);
    this.output.dataset.frame = String(frame);
  }
  audioInfo(assetId: string) {
    const buffer = this.buffers.get(assetId);
    return buffer
      ? { sampleRate: buffer.sampleRate, samples: buffer.length }
      : undefined;
  }
  waveforms() {
    const result: Record<string, number[]> = {};
    const { fps } = this.bundle.project.composition;
    for (const l of this.bundle.project.layers) {
      if (l.kind !== "audio") continue;
      const buffer = this.buffers.get(l.assetId)!;
      const data = buffer.getChannelData(0);
      const start = (l.sourceStartFrame / fps) * buffer.sampleRate,
        step = ((l.durationFrames / fps) * buffer.sampleRate) / 128;
      result[l.id] = Array.from({ length: 128 }, (_, i) => {
        let peak = 0;
        for (
          let j = Math.floor(start + i * step);
          j < Math.min(data.length, start + (i + 1) * step);
          j++
        )
          peak = Math.max(peak, Math.abs(data[j]));
        return Math.min(1, peak * 3);
      });
    }
    return result;
  }
  async resume() {
    await this.audio.resume();
  }
  scheduleAudio(
    frame: number,
    when: number,
    destination: AudioNode = this.audio.destination,
  ) {
    this.stopAudio();
    const { fps } = this.bundle.project.composition;
    for (const l of this.bundle.project.layers) {
      if (
        l.muted ||
        l.kind !== "audio" ||
        l.startFrame + l.durationFrames <= frame
      )
        continue;
      const skipped = Math.max(0, frame - l.startFrame);
      const source = this.audio.createBufferSource();
      source.buffer = this.buffers.get(l.assetId)!;
      const gain = this.audio.createGain();
      gain.gain.value = l.gain;
      source.connect(gain).connect(destination);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      source.start(
        when + Math.max(0, l.startFrame - frame) / fps,
        (l.sourceStartFrame + skipped) / fps,
        (l.durationFrames - skipped) / fps,
      );
      this.sources.push(source);
    }
  }
  stopAudio() {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already ended */
      }
      source.disconnect();
    }
    this.sources = [];
  }
  async mix() {
    const { fps, durationFrames } = this.bundle.project.composition;
    const offline = new OfflineAudioContext(
      2,
      Math.round((durationFrames / fps) * 48000),
      48000,
    );
    for (const l of this.bundle.project.layers) {
      if (l.muted || l.kind !== "audio") continue;
      const source = offline.createBufferSource();
      source.buffer = this.buffers.get(l.assetId)!;
      const gain = offline.createGain();
      gain.gain.value = l.gain;
      source.connect(gain).connect(offline.destination);
      source.start(
        l.startFrame / fps,
        l.sourceStartFrame / fps,
        l.durationFrames / fps,
      );
    }
    const mix = await offline.startRendering();
    for (let c = 0; c < mix.numberOfChannels; c++)
      for (const sample of mix.getChannelData(c))
        if (Math.abs(sample) > 1)
          throw new Error("Audio mix clips. Lower layer gains before export.");
    return mix;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // The canvas outlives this renderer; its next one reports its own fonts.
    delete this.output.dataset.fonts;
    this.stopAudio();
    for (const g of this.graphics.values()) g.dispose();
    for (const v of this.videos.values()) v.dispose();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.filter.dispose();
    void this.audio.close();
  }
}
