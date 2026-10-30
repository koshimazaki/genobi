/** Local, unpaid media preparation. Masters and their selected posters are read-only. */
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const probe = (file) =>
  JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
const ffmpeg = (args) =>
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    {
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
const directories = ["public/media", "public/media/template-gallery"];
const posterNames = {
  "gallery-build-v2": "gallery-build-poster",
  "signal-taste-reel": "signal-taste-poster",
};
const scratch = await mkdtemp(join(tmpdir(), "genobi-previews-"));
try {
  for (const directory of directories) {
    const names = (await readdir(directory))
      .filter((name) =>
        directory.endsWith("template-gallery")
          ? name.endsWith(".mp4") && !name.endsWith(".preview.mp4")
          : /^library-\d+\.mp4$/.test(name),
      )
      .sort();
    for (const name of names) {
      const input = join(directory, name);
      const stem = name.slice(0, -4);
      const output = join(directory, `${stem}.preview.mp4`);
      const metadata = probe(input);
      const seconds = Number(metadata.format.duration);
      const audio = metadata.streams.some((s) => s.codec_type === "audio");
      const ceiling = seconds > 60 ? 6_000_000 : 4_000_000;
      const common = [
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-vf",
        "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "4",
      ];
      const sound = ["-c:a", "aac", "-b:a", "96k"];
      ffmpeg([
        ...common,
        "-crf",
        "27",
        ...sound,
        "-movflags",
        "+faststart",
        output,
      ]);
      // Long or very busy cuts need a measured budget instead of a CRF guess.
      if ((await stat(output)).size > ceiling) {
        const bitrate = Math.floor(
          (ceiling * 0.94 * 8) / seconds - (audio ? 96_000 : 0),
        );
        const pass = join(scratch, "pass");
        ffmpeg([
          ...common,
          "-b:v",
          String(bitrate),
          "-pass",
          "1",
          "-passlogfile",
          pass,
          "-an",
          "-f",
          "null",
          "/dev/null",
        ]);
        ffmpeg([
          ...common,
          "-b:v",
          String(bitrate),
          "-pass",
          "2",
          "-passlogfile",
          pass,
          ...sound,
          "-movflags",
          "+faststart",
          output,
        ]);
      }
      if ((await stat(output)).size > ceiling)
        throw new Error(`${output} exceeds its budget`);
      const poster = join(directory, `${stem}.preview.jpg`);
      for (let quality = 3; quality <= 31; quality += 2) {
        ffmpeg([
          "-i",
          join(directory, `${posterNames[stem] ?? stem}.jpg`),
          "-map_metadata",
          "-1",
          "-vf",
          "scale=w='min(1280,iw)':h=-2",
          "-frames:v",
          "1",
          "-q:v",
          String(quality),
          "-update",
          "1",
          poster,
        ]);
        if ((await stat(poster)).size <= 150_000) break;
      }
      if ((await stat(poster)).size > 150_000)
        throw new Error(`${poster} exceeds its budget`);
      console.log(
        `${output}: ${(await stat(output)).size} bytes; poster ${(await stat(poster)).size}`,
      );
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
