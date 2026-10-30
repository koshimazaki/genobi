// Spoken generation requests (issue #23): the local, deterministic parser and
// the vocabulary it builds from the registry.
import { describe, expect, it } from "vitest";
import { registry } from "../shared/registry";
import {
  parseVoiceIntent,
  resolveVoiceIntent,
  type VoiceIntent,
} from "../shared/voice-intent";
import {
  HEARD_VARIANTS,
  speakableEntries,
  tokenize,
  voiceVocabulary,
} from "../shared/voice-vocabulary";
import { cleanTranscript, STUDIO_DICTIONARY } from "../shared/voice-dictionary";

const flux = { kind: "family", family: "flux" } as const;
const ltx = { kind: "family", family: "ltx" } as const;
const klein = { kind: "entry", id: "flux-3-klein" } as const;
const selected = (text: string) => {
  const intent = parseVoiceIntent(text);
  return (
    intent &&
    resolveVoiceIntent(intent, { generator: "video", model: "flux-3" })?.id
  );
};

describe("parseVoiceIntent", () => {
  it("reads the owner's examples", () => {
    expect(
      parseVoiceIntent("I want to generate an image with FLUX of a penguin"),
    ).toEqual({ medium: "image", model: flux, subject: "a penguin" });
    expect(
      parseVoiceIntent("I want to generate image with flux of the penguin"),
    ).toEqual({ medium: "image", model: flux, subject: "the penguin" });
    expect(
      parseVoiceIntent("make a video with LTX of a neon street at night"),
    ).toEqual({
      medium: "video",
      model: ltx,
      subject: "a neon street at night",
    });
    expect(parseVoiceIntent("image of a penguin")).toEqual({
      medium: "image",
      subject: "a penguin",
    });
  });

  it("selects Klein for FLUX stills, LTX-2.5 Fast for LTX video", () => {
    expect(selected("I want to generate an image with FLUX of a penguin")).toBe(
      "flux-3-klein",
    );
    expect(selected("make a video with LTX of a neon street at night")).toBe(
      "ltx-2-5-fast",
    );
    expect(selected("image of a penguin")).toBe("flux-3-klein");
    // A medium alone: the default, or the held model when it fits.
    const rain = parseVoiceIntent("a video of rain on glass")!;
    expect(resolveVoiceIntent(rain)?.id).toBe("ltx-2-5-fast");
    expect(selected("a video of rain on glass")).toBe("flux-3-video");
  });

  it("ignores casing and punctuation and keeps the subject as said", () => {
    expect(
      parseVoiceIntent("MAKE A VIDEO, with ltx: A Neon Street at night!"),
    ).toEqual({
      medium: "video",
      model: ltx,
      subject: "A Neon Street at night",
    });
    expect(parseVoiceIntent("Image of a penguin, please.")).toEqual({
      medium: "image",
      subject: "a penguin",
    });
    expect(
      parseVoiceIntent("Okay, Genobi — generate a picture of “a red fox”."),
    ).toEqual({ medium: "image", subject: "a red fox" });
  });

  it("hears the spoken variants: flux three, Klein, and client for Klein", () => {
    const penguin = (model: VoiceIntent["model"]) => ({
      medium: "image",
      model,
      subject: "a penguin",
    });
    expect(
      parseVoiceIntent("generate an image with flux three of a penguin"),
    ).toEqual(penguin(flux));
    expect(
      parseVoiceIntent("generate an image with Klein of a penguin"),
    ).toEqual(penguin(klein));
    expect(
      parseVoiceIntent("Generate an image with client of a penguin"),
    ).toEqual(penguin(klein));
    expect(
      parseVoiceIntent("generate an image using flux 3 client of a penguin"),
    ).toEqual(penguin(klein));
    expect(
      parseVoiceIntent("make a video with LTX two point five pro of rain"),
    ).toEqual({
      medium: "video",
      model: { kind: "entry", id: "ltx-2-5-pro" },
      subject: "rain",
    });
  });

  it("takes a model before the medium, after the verb or after the subject", () => {
    expect(parseVoiceIntent("make an LTX video of a dog")).toEqual({
      medium: "video",
      model: ltx,
      subject: "a dog",
    });
    expect(parseVoiceIntent("generate with flux a penguin")).toEqual({
      model: flux,
      subject: "a penguin",
    });
    expect(parseVoiceIntent("generate a penguin with FLUX")).toEqual({
      model: flux,
      subject: "a penguin",
    });
    expect(
      parseVoiceIntent("an image of a penguin with flux 3 klein please"),
    ).toEqual({ medium: "image", model: klein, subject: "a penguin" });
  });

  it("never reads a mishearing at the end of the subject", () => {
    expect(parseVoiceIntent("an image of a lawyer with client")).toEqual({
      medium: "image",
      subject: "a lawyer with client",
    });
  });

  it("returns null for anything that is not a generation request", () => {
    for (const text of [
      "open the director",
      "what time is it",
      "What time is it?",
      "",
      "   ",
      "make the video louder",
      "make it brighter",
      "generate",
      "make an image",
      "Open Genobi and orbit the vessel for 6.1 seconds.",
      "a slow dolly in on a forest shaman",
      "make a video with a dog in it",
    ])
      expect(parseVoiceIntent(text), text).toBeNull();
  });

  it("reads Object.prototype's names as ordinary words", () => {
    const names = [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
      "valueOf",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
      "__defineGetter__",
    ];
    for (const name of names) {
      expect(
        parseVoiceIntent(`image of a ${name} at a building site`),
        name,
      ).toEqual({ medium: "image", subject: `a ${name} at a building site` });
      // In every slot: opening, medium, model, number, mishearing, subject end.
      for (const text of [
        `${name}`,
        `${name} ${name} of ${name}`,
        `make a ${name} of a dog`,
        `make a video with ${name} of a dog`,
        `make a video with flux ${name} of a dog`,
        `generate a ${name} with ${name}`,
        `an image of a dog with ${name}`,
      ])
        expect(() => parseVoiceIntent(text), text).not.toThrow();
      // Underscores split words; each piece stays the word it was.
      expect(tokenize(name).map((t) => t.word)).toEqual(
        name.toLowerCase().split("_").filter(Boolean),
      );
    }
    expect(selected("image of a constructor at a building site")).toBe(
      "flux-3-klein",
    );
  });

  it("works on a transcript after the dictionary's clean-up", () => {
    const heard = cleanTranscript(
      "make a video with L T X two point five fast of a harbour",
      STUDIO_DICTIONARY,
    );
    expect(parseVoiceIntent(heard)).toEqual({
      medium: "video",
      model: { kind: "entry", id: "ltx-2-5-fast" },
      subject: "a harbour",
    });
  });
});

describe("resolveVoiceIntent", () => {
  it("selects nothing for a medium the named model cannot make", () => {
    const intent = parseVoiceIntent("make a video with Klein of a cat")!;
    expect(intent).toEqual({ medium: "video", model: klein, subject: "a cat" });
    expect(resolveVoiceIntent(intent)).toBeNull();
    expect(
      resolveVoiceIntent({ medium: "image", model: ltx, subject: "x" }),
    ).toBeNull();
  });

  it("keeps what the composer holds when it already fits", () => {
    const still = { medium: "image", model: flux, subject: "x" } as const;
    // FLUX 3 Image is a FLUX still: asking for a FLUX still keeps it.
    expect(
      resolveVoiceIntent(still, { generator: "image", model: "flux-3" })?.id,
    ).toBe("flux-3-image");
    // Klein on the API stays on the API when Klein is named.
    expect(
      resolveVoiceIntent(
        { medium: "image", model: klein, subject: "x" },
        { generator: "image", model: "flux-3-klein-api" },
      )?.id,
    ).toBe("flux-3-klein-api");
    // A medium alone keeps the held video model.
    expect(
      resolveVoiceIntent(
        { medium: "video", subject: "x" },
        { generator: "video", model: "ltx-2.5-pro" },
      )?.id,
    ).toBe("ltx-2-5-pro");
  });

  it("never selects a coming entry, an upscale or an edit", () => {
    for (const text of [
      "make a video with ltx hdr of a sunset",
      "make an image with flux omni of a cat",
    ]) {
      const intent = parseVoiceIntent(text);
      const id = intent && resolveVoiceIntent(intent)?.id;
      expect([
        "flux-3-omni",
        "ltx-hdr",
        "flux-video-upscale",
        "flux-3-edit",
      ]).not.toContain(id);
    }
  });
});

describe("the vocabulary", () => {
  const vocabulary = voiceVocabulary();
  const named = (words: string) =>
    vocabulary.find((alias) => alias.words.join(" ") === words)?.target;

  it("comes from the registry's labels and ids", () => {
    expect(named("flux")).toEqual(flux);
    expect(named("flux 3")).toEqual(flux);
    expect(named("ltx 2.5")).toEqual(ltx);
    expect(named("klein")).toEqual(klein);
    expect(named("flux 3 image klein")).toEqual(klein);
    expect(named("ltx 2.5 pro")).toEqual({ kind: "entry", id: "ltx-2-5-pro" });
    expect(named("acoustic space")).toEqual({
      kind: "entry",
      id: "ltx-2-5-akuspace",
    });
    // "FLUX 3" alone is a family, not FLUX 3's video entry.
    expect(named("flux 3")).toEqual(flux);
    // Every target is a runnable still or video entry, or its family.
    const ids = speakableEntries(registry).map((e) => e.id);
    for (const { target } of vocabulary)
      if (target.kind === "entry") expect(ids).toContain(target.id);
  });

  it("follows a renamed entry without a second edit", () => {
    const renamed = registry.map((e) =>
      e.id === "flux-3-klein" ? { ...e, label: "FLUX 3 Image Kestrel" } : e,
    );
    const words = voiceVocabulary(renamed).map((a) => a.words.join(" "));
    expect(words).toContain("kestrel");
    expect(words).toContain("flux 3 image kestrel");
  });

  it("keeps mishearings only for words the registry still derives", () => {
    const derived = new Set(vocabulary.flatMap((a) => a.words));
    for (const word of HEARD_VARIANTS.keys())
      expect(derived, word).toContain(word);
  });

  it("reads spoken and written numbers alike", () => {
    expect(
      tokenize("FLUX three, LTX-2.5 and two point five").map((t) => t.word),
    ).toEqual(["flux", "3", "ltx", "2.5", "and", "2.5"]);
  });
});
