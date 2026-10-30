import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Input, BlobSource, ALL_FORMATS, EncodedPacketSink } from "mediabunny";
import type { EncodedPacket } from "mediabunny";
import { copyEdit } from "../src/dual-editor/lossless-export";
import {
  decoderIdentity,
  losslessSegments,
} from "../src/dual-editor/lossless-plan";
import { frameIndex } from "../src/dual-editor/frame-math";
import type { FrameSource } from "../src/dual-editor/frame-source";
import type { TimelineSource } from "../src/dual-editor/timeline-export";
import type { EditClip } from "../src/dual-editor/timeline-model";
async function source(name = "native-2176x928.mp4") {
  const file = new File(
    [await readFile(new URL(`./fixtures/${name}`, import.meta.url))],
    name,
    { type: "video/mp4" },
  );
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  const track = (await input.getPrimaryVideoTrack())!;
  const packets = [];
  for await (const packet of new EncodedPacketSink(track).packets())
    packets.push(packet);
  const engine = {
    input,
    frames: frameIndex(packets),
    width: await track.getDisplayWidth(),
    height: await track.getDisplayHeight(),
    name,
  } as FrameSource;
  return { id: "a", file, engine, url: "", thumb: "" } satisfies TimelineSource;
}
const section = (patch: Partial<EditClip> = {}): EditClip => ({
  id: "clip",
  source: "a",
  lane: "A",
  in: 0,
  out: 48,
  start: 0,
  muted: false,
  ...patch,
});
async function packets(blob: Blob) {
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const result = [];
    for await (const packet of new EncodedPacketSink(track).packets())
      result.push(packet);
    return {
      result,
      width: await track.getDisplayWidth(),
      height: await track.getDisplayHeight(),
    };
  } finally {
    input.dispose();
  }
}
async function copied(src: TimelineSource, clips: EditClip[]) {
  return copyEdit(
    clips,
    new Map([["a", src]]),
    "mp4",
    new AbortController().signal,
    () => {},
  );
}
describe("Lossless editing uses source packets, never a silent re-encode", () => {
  it("returns an untouched source byte-for-byte, retaining all original metadata and sound", async () => {
    const src = await source("native-audio.mp4");
    try {
      expect(
        await copied(src, [section({ out: src.engine.frames.length })]),
      ).toBe(src.file);
    } finally {
      src.engine.input!.dispose();
    }
  });
  it("copies a keyframe-bounded B-frame cut at native 2176 × 928 with identical compressed bytes and original 24fps timing", async () => {
    const src = await source();
    try {
      const original = await packets(src.file),
        output = await packets(
          await copied(src, [section({ in: 12, out: 24 })]),
        );
      expect(output).toMatchObject({ width: 2176, height: 928 });
      const wanted = original.result.filter(
        (p) => p.timestamp >= 0.5 && p.timestamp < 1,
      );
      expect(output.result).toHaveLength(12);
      expect(output.result.map((p) => p.data)).toEqual(
        wanted.map((p) => p.data),
      );
      output.result.forEach((packet, i) =>
        expect(packet.timestamp).toBeCloseTo(wanted[i].timestamp - 0.5, 8),
      );
    } finally {
      src.engine.input!.dispose();
    }
  });
  it("joins compatible sections with identical compressed packets, including reordered B-frames", async () => {
    const src = await source();
    try {
      const original = await packets(src.file),
        output = await packets(
          await copied(src, [
            section({ out: 12 }),
            section({ id: "two", in: 36, out: 48, start: 0.5 }),
          ]),
        );
      const wanted = original.result.filter(
        (p) => p.timestamp < 0.5 || p.timestamp >= 1.5,
      );
      expect(output.result.map((p) => p.data)).toEqual(
        wanted.map((p) => p.data),
      );
      expect(output.result).toHaveLength(24);
    } finally {
      src.engine.input!.dispose();
    }
  });
  it("refuses non-keyframe start/end cuts rather than moving the cut or re-encoding", async () => {
    const src = await source();
    try {
      await expect(copied(src, [section({ in: 1, out: 24 })])).rejects.toThrow(
        /first frame.*keyframe/,
      );
      await expect(copied(src, [section({ out: 13 })])).rejects.toThrow(
        /last boundary.*keyframe/,
      );
    } finally {
      src.engine.input!.dispose();
    }
  });
  it("refuses audio cuts through a compressed packet instead of dropping or shifting sound", async () => {
    const src = await source("native-audio.mp4");
    try {
      await expect(copied(src, [section({ in: 12, out: 24 })])).rejects.toThrow(
        /audio packets/,
      );
    } finally {
      src.engine.input!.dispose();
    }
  });
  it("copies aligned audio packets without transcoding or losing A/V sync", async () => {
    const src = await source("aligned-audio.mp4");
    let input: Input | undefined;
    try {
      const blob = await copied(src, [section({ in: 8, out: 16 })]);
      input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const audio = (await input.getPrimaryAudioTrack())!;
      const original = (await src.engine.input!.getPrimaryAudioTrack())!;
      const expected: EncodedPacket[] = [],
        actual: EncodedPacket[] = [];
      for await (const packet of new EncodedPacketSink(original).packets())
        if (packet.timestamp >= 0.32 - 1e-6 && packet.timestamp < 0.64 - 1e-6)
          expected.push(packet);
      for await (const packet of new EncodedPacketSink(audio).packets())
        actual.push(packet);
      expect(actual).toHaveLength(15);
      expect(actual.map((p) => p.data)).toEqual(expected.map((p) => p.data));
      actual.forEach((p, i) =>
        expect(p.timestamp).toBeCloseTo(expected[i].timestamp - 0.32, 8),
      );
      expect((await packets(blob)).result).toHaveLength(8);
    } finally {
      input?.dispose();
      src.engine.input!.dispose();
    }
  });
  it("rejects incompatible resolutions and respects cancellation", async () => {
    const src = await source(),
      small = await source("native-audio.mp4");
    try {
      const sources = new Map([
        ["a", src],
        ["b", small],
      ]);
      await expect(
        copyEdit(
          [
            section({ out: 12 }),
            section({
              id: "two",
              source: "b",
              out: 12,
              start: 0.5,
              muted: true,
            }),
          ],
          sources,
          "mp4",
          new AbortController().signal,
          () => {},
        ),
      ).rejects.toThrow(/different resolutions or codec settings/);
      const abort = new AbortController();
      abort.abort();
      await expect(
        copyEdit([section()], sources, "mp4", abort.signal, () => {}),
      ).rejects.toThrow();
    } finally {
      src.engine.input!.dispose();
      small.engine.input!.dispose();
    }
  });
  it("closes harmless split boundaries but rejects black gaps", async () => {
    const src = await source();
    try {
      const timing = new Map([["a", src.engine]]);
      expect(
        losslessSegments(
          [section({ out: 1 }), section({ id: "two", in: 1, start: 1 / 24 })],
          timing,
        ),
      ).toHaveLength(1);
      expect(() => losslessSegments([section({ start: 1 })], timing)).toThrow(
        /black gaps/,
      );
    } finally {
      src.engine.input!.dispose();
    }
  });
  it("decoder identities compare actual codec-private bytes, independently of key order", () => {
    expect(
      decoderIdentity({ codec: "avc", description: new Uint8Array([1, 2]) }),
    ).toBe(
      decoderIdentity({
        description: new Uint8Array([1, 2]).buffer,
        codec: "avc",
      }),
    );
    expect(decoderIdentity({ description: new Uint8Array([1, 2]) })).not.toBe(
      decoderIdentity({ description: new Uint8Array([1, 3]) }),
    );
  });
});
