import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { expect, it } from "vitest";
import { galleryMedia } from "../shared/gallery/catalogue";
import { generationTemplates } from "../shared/gallery/generations";
import { houseTemplates, mixTemplates } from "../shared/templates/catalogue";
import catalogue from "../public/media/gallery.json";

const fullFiles = [
  ...new Set([
    ...[...houseTemplates, ...mixTemplates, ...generationTemplates].flatMap(
      (t) => galleryMedia(t)?.video ?? [],
    ),
    ...readdirSync("public/media")
      .filter((n) => /^library-\d+\.mp4$/.test(n))
      .map((n) => `/media/${n}`),
    "/media/template-gallery/signal-taste-reel.mp4",
  ]),
];
const probe = (file: string) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      `public${file}`,
    ]).toString(),
  );
const hasProbe = (() => {
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

it.each(fullFiles)("%s has a separate bounded preview and poster", (full) => {
  const preview = full.replace(/\.mp4$/, ".preview.mp4");
  const poster = full.replace(/\.mp4$/, ".preview.jpg");
  expect(existsSync(`public${preview}`)).toBe(true);
  expect(existsSync(`public${poster}`)).toBe(true);
  expect(statSync(`public${poster}`).size).toBeLessThanOrEqual(150_000);
  // MP4 faststart: the index precedes video payload, including multi-byte atom lengths.
  const bytes = readFileSync(`public${preview}`);
  expect(bytes.indexOf(Buffer.from("moov"))).toBeGreaterThan(0);
  expect(bytes.indexOf(Buffer.from("moov"))).toBeLessThan(
    bytes.indexOf(Buffer.from("mdat")),
  );
});

it.skipIf(!hasProbe).each(fullFiles)(
  "%s preserves aspect, length and sound without upscaling",
  (full) => {
    const source = probe(full);
    const previewPath = full.replace(/\.mp4$/, ".preview.mp4");
    const preview = probe(previewPath);
    const video = preview.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    const original = source.streams.find(
      (s: { codec_type: string }) => s.codec_type === "video",
    );
    const duration = Number(source.format.duration);
    expect(video.codec_name).toBe("h264");
    expect(video.profile).toBe("High");
    expect(video.width).toBeLessThanOrEqual(Math.min(1280, original.width));
    expect(video.height).toBeLessThanOrEqual(Math.min(720, original.height));
    expect(
      Math.abs(video.width / video.height - original.width / original.height),
    ).toBeLessThan(0.01);
    expect(Math.abs(Number(preview.format.duration) - duration)).toBeLessThan(
      0.15,
    );
    expect(statSync(`public${previewPath}`).size).toBeLessThanOrEqual(
      duration > 60 ? 6_000_000 : 4_000_000,
    );
    const audio = preview.streams.find(
      (s: { codec_type: string }) => s.codec_type === "audio",
    );
    expect(!!audio).toBe(
      source.streams.some(
        (s: { codec_type: string }) => s.codec_type === "audio",
      ),
    );
    if (audio) {
      expect(audio.codec_name).toBe("aac");
      expect(Number(audio.bit_rate)).toBeLessThanOrEqual(130_000);
    }
    const poster = probe(full.replace(/\.mp4$/, ".preview.jpg")).streams[0];
    expect(poster.width).toBeLessThanOrEqual(Math.min(1280, original.width));
  },
);

it("keeps the library's pricing metadata on its full files", () => {
  for (const clip of catalogue) {
    expect(clip.preview).toBe(clip.url.replace(/\.mp4$/, ".preview.mp4"));
    expect(clip.previewPoster).toBe(clip.url.replace(/\.mp4$/, ".preview.jpg"));
    expect(statSync(`public${clip.url}`).size).toBe(clip.bytes);
  }
});
