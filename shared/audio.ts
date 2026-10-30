import type { Source } from "./types";

/**
 * Audio uploads are measured from their own headers, with the same bounded
 * ranged reads the MP4 reader uses, so both adapters agree on a duration
 * without ffprobe. Uncompressed WAV and FLAC state it exactly; MP3 states it
 * in a Xing, Info or VBRI frame. An MP3 without one is measured from its size
 * only when frames sampled across the file share one bitrate; a variable
 * bitrate without that frame, compressed WAV and formats whose length needs
 * the whole file (Ogg, M4A) are refused rather than guessed.
 */
export const MAX_AUDIO_BYTES = 50_000_000;
export const MAX_AUDIO_SECONDS = 20 * 60;
export const AUDIO_TYPES = ["audio/wav", "audio/flac", "audio/mpeg"] as const;
export type AudioType = (typeof AUDIO_TYPES)[number];
export type AudioMetadata = Pick<Source, "width" | "height" | "duration"> & {
  contentType: AudioType;
};

const HEAD = 64 * 1024;
const invalid = () =>
  new Error("Use a WAV, FLAC or MP3 file with a readable duration.");

type Read = (offset: number, length: number) => Promise<ArrayBuffer>;

export async function inspectAudio(
  size: number,
  read: Read,
): Promise<AudioMetadata> {
  // Byte ceilings are the caller's policy: uploads and derived files differ.
  if (!Number.isSafeInteger(size) || size < 16) throw invalid();
  const head = new Uint8Array(await read(0, Math.min(HEAD, size)));
  const tag = ascii(head, 0, 4);
  const found =
    tag === "RIFF" && ascii(head, 8, 4) === "WAVE"
      ? await wav(size, read)
      : tag === "fLaC"
        ? flac(head)
        : await mp3(size, head, read);
  if (
    !Number.isFinite(found.duration) ||
    found.duration <= 0 ||
    found.duration > MAX_AUDIO_SECONDS
  )
    throw new Error("Use audio between a moment and twenty minutes long.");
  return { width: 0, height: 0, ...found };
}

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));
const u32le = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32be = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/**
 * Linear PCM and IEEE float, plain or in WAVE_FORMAT_EXTENSIBLE. Compressed
 * formats (ADPCM, GSM, MP3-in-WAV) do not hold a whole number of bytes per
 * sample frame, so their header byte rate cannot measure them.
 */
const UNCOMPRESSED = new Set([1, 3]);
const EXTENSIBLE = 0xfffe;

/** RIFF chunks in order: `fmt ` gives the frame size, `data` the length. */
async function wav(size: number, read: Read) {
  let offset = 12,
    byteRate = 0;
  for (let count = 0; count < 64 && offset + 8 <= size; count++) {
    const header = new Uint8Array(await read(offset, 8));
    const id = ascii(header, 0, 4),
      length = u32le(header, 4);
    if (id === "fmt ") {
      const format = new Uint8Array(
        await read(offset + 8, Math.min(length, 40)),
      );
      if (length < 16 || format.length < 16) throw invalid();
      const tag =
        u16le(format, 0) === EXTENSIBLE && format.length >= 26
          ? u16le(format, 24)
          : u16le(format, 0);
      if (!UNCOMPRESSED.has(tag))
        throw new Error("Use an uncompressed WAV, or a FLAC or MP3 file.");
      // Sample rate × block align: the bytes one second of frames occupies.
      byteRate = u32le(format, 4) * u16le(format, 12);
    } else if (id === "data") {
      if (!byteRate) throw invalid();
      // A streamed WAV may leave the length unset; the file is the bound.
      const data = Math.min(length, size - offset - 8);
      return { duration: data / byteRate, contentType: "audio/wav" as const };
    }
    offset += 8 + length + (length % 2);
  }
  throw invalid();
}

/** STREAMINFO is always the first block: sample rate and total samples. */
function flac(head: Uint8Array) {
  if (head.length < 26 || (head[4] & 0x7f) !== 0) throw invalid();
  const rate = (head[18] << 12) | (head[19] << 4) | (head[20] >> 4);
  const samples = (head[21] & 0x0f) * 2 ** 32 + u32be(head, 22);
  if (!rate || !samples) throw invalid();
  return { duration: samples / rate, contentType: "audio/flac" as const };
}

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

interface Frame {
  version: number;
  rateIndex: number;
  bitrateIndex: number;
  length: number;
}

/** A Layer III frame header at `at`, or nothing if the bytes are not one. */
function header(bytes: Uint8Array, at: number): Frame | undefined {
  if (at + 4 > bytes.length) return;
  if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return;
  const version = (bytes[at + 1] >> 3) & 3,
    layer = (bytes[at + 1] >> 1) & 3,
    bitrateIndex = bytes[at + 2] >> 4,
    rateIndex = (bytes[at + 2] >> 2) & 3,
    padding = (bytes[at + 2] >> 1) & 1;
  if (version === 1 || layer !== 1 || rateIndex === 3) return;
  // Index 0 is free format, 15 is forbidden: neither has a size to step by.
  if (bitrateIndex === 0 || bitrateIndex === 15) return;
  const mpeg1 = version === 3;
  const kbps = BITRATES[mpeg1 ? 1 : 2][bitrateIndex];
  const rate = RATES[version as 0 | 2 | 3][rateIndex];
  const length =
    Math.floor(((mpeg1 ? 144 : 72) * kbps * 1000) / rate) + padding;
  return { version, rateIndex, bitrateIndex, length };
}

const SAMPLES = 6;
const WINDOW = 16 * 1024;
/** Consecutive headers that must chain before a sync word is trusted. */
const CHAIN = 3;

/**
 * The bitrate indices of the frames in one window, walked header to header
 * from the first place `CHAIN` frames line up. A window with no such run is
 * not audio this reader can vouch for.
 */
function bitrates(bytes: Uint8Array, first: Frame) {
  const same = (frame: Frame | undefined): frame is Frame =>
    !!frame &&
    frame.version === first.version &&
    frame.rateIndex === first.rateIndex;
  for (let at = 0; at + 4 <= bytes.length; at++) {
    let next = at,
      run = 0;
    for (let frame = header(bytes, next); same(frame) && run < CHAIN; run++) {
      next += frame.length;
      frame = header(bytes, next);
    }
    if (run < CHAIN) continue;
    const found = new Set<number>();
    for (
      let frame = header(bytes, at);
      same(frame);
      frame = header(bytes, at)
    ) {
      found.add(frame.bitrateIndex);
      at += frame.length;
    }
    return found;
  }
  return new Set<number>();
}

/** Layer III only. ID3v2 tags (album art included) are skipped by their size. */
async function mp3(size: number, head: Uint8Array, read: Read) {
  let start = 0;
  if (ascii(head, 0, 3) === "ID3") {
    const tag = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    start = 10 + tag + (head[5] & 0x10 ? 10 : 0);
  }
  if (start + 4 > size) throw invalid();
  const frame = new Uint8Array(await read(start, Math.min(HEAD, size - start)));
  // The first frame may follow padding; look a little way for its sync word.
  let at = 0;
  while (
    at + 4 < Math.min(frame.length, 4096) &&
    !(frame[at] === 0xff && (frame[at + 1] & 0xe0) === 0xe0)
  )
    at++;
  const first = header(frame, at);
  if (!first) throw invalid();
  const rate = RATES[first.version as 0 | 2 | 3][first.rateIndex];
  const mpeg1 = first.version === 3;
  const mono = frame[at + 3] >> 6 === 3;
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const side = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const xing = at + 4 + side;
  const marker = ascii(frame, xing, 4);
  let frames = 0;
  if ((marker === "Xing" || marker === "Info") && frame[xing + 7] & 1)
    frames = u32be(frame, xing + 8);
  else if (ascii(frame, at + 36, 4) === "VBRI") frames = u32be(frame, at + 50);
  if (frames)
    return {
      duration: (frames * samplesPerFrame) / rate,
      contentType: "audio/mpeg" as const,
    };
  // No stated frame count: the size measures the file only at one bitrate.
  // The first frame cannot show that, so sample windows across the file.
  const audio = start + at;
  const seen = bitrates(frame.subarray(at), first);
  for (let i = 1; i <= SAMPLES; i++) {
    const offset = audio + Math.floor(((size - audio) * i) / (SAMPLES + 1));
    const window = new Uint8Array(
      await read(offset, Math.min(WINDOW, size - offset)),
    );
    const found = bitrates(window, first);
    if (!found.size) throw unmeasured();
    found.forEach((index) => seen.add(index));
  }
  if (seen.size !== 1) throw unmeasured();
  return {
    duration:
      ((size - audio) * 8) /
      (BITRATES[mpeg1 ? 1 : 2][first.bitrateIndex] * 1000),
    contentType: "audio/mpeg" as const,
  };
}

const unmeasured = () =>
  new Error(
    "This MP3's length cannot be read: export it at a constant bitrate or with a Xing header.",
  );

/** Bytes read per step of the frame walk. */
const WALK = 256 * 1024;
/** What may follow the last frame: an ID3v1 or APE tag, padding. */
const TRAILER = 8 * 1024;

/**
 * A file the studio generated, measured by `inspectAudio`, or, for an MP3
 * that states no frame count and changes bitrate, by walking every frame
 * header from the first to the last and counting them: the exact length from
 * the headers alone, no decoder. Both the copy step and a take's hand-in read
 * it this way, so they cannot disagree. Uploads keep `inspectAudio`, which
 * refuses such a file rather than read it whole.
 */
export async function inspectStoredAudio(
  size: number,
  read: Read,
): Promise<AudioMetadata> {
  try {
    return await inspectAudio(size, read);
  } catch (error) {
    const walked = await walkMp3(size, read).catch(() => undefined);
    if (!walked) throw error;
    return walked;
  }
}

async function walkMp3(size: number, read: Read): Promise<AudioMetadata> {
  if (!Number.isSafeInteger(size) || size < 16) throw invalid();
  const head = new Uint8Array(await read(0, Math.min(HEAD, size)));
  let at = 0;
  if (ascii(head, 0, 3) === "ID3") {
    const tag = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    at = 10 + tag + (head[5] & 0x10 ? 10 : 0);
  }
  if (at + 4 > size) throw invalid();
  let base = at;
  let window = new Uint8Array(await read(at, Math.min(WALK, size - at)));
  let skip = 0;
  while (skip + 4 < Math.min(window.length, 4096) && !header(window, skip))
    skip++;
  const first = header(window, skip);
  if (!first) throw invalid();
  at += skip;
  let frames = 0;
  while (at + 4 <= size) {
    if (at - base + 4 > window.length) {
      base = at;
      window = new Uint8Array(await read(at, Math.min(WALK, size - at)));
    }
    const frame = header(window, at - base);
    if (
      !frame ||
      frame.version !== first.version ||
      frame.rateIndex !== first.rateIndex
    )
      break;
    frames++;
    at += frame.length;
  }
  // Anything longer than a tag after the last frame is audio the walk lost.
  if (!frames || size - Math.min(at, size) > TRAILER) throw unmeasured();
  const rate = RATES[first.version as 0 | 2 | 3][first.rateIndex];
  const duration = (frames * (first.version === 3 ? 1152 : 576)) / rate;
  if (duration > MAX_AUDIO_SECONDS)
    throw new Error("Use audio between a moment and twenty minutes long.");
  return { width: 0, height: 0, duration, contentType: "audio/mpeg" };
}
