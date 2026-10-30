// The voice language: the shared allow-list, the per-browser choice, the
// request the studio sends, and the worker's own check of the request.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredVoiceLanguage,
  parseVoiceLanguage,
  VOICE_LANGUAGES,
} from "../shared/voice-languages";
import { transcribe, voiceStatus } from "../src/voice/api";
import {
  LANGUAGE_KEY,
  readVoiceLanguage,
  saveVoiceLanguage,
} from "../src/voice/language-store";

afterEach(() => vi.unstubAllGlobals());

describe("the allow-list", () => {
  it("is Qwen3-ASR's thirty languages, and auto", () => {
    expect(VOICE_LANGUAGES).toHaveLength(30);
    expect(new Set(VOICE_LANGUAGES).size).toBe(30);
    expect(parseVoiceLanguage("Japanese")).toBe("Japanese");
    expect(parseVoiceLanguage("auto")).toBe("auto");
    expect(parseVoiceLanguage(undefined)).toBeUndefined();
  });

  it("takes only a listed name, exactly", () => {
    for (const value of ["Klingon", "english", "", 7, ["English"], null])
      expect(() => parseVoiceLanguage(value)).toThrow(
        "Choose a voice language",
      );
  });

  it("reads the server default in any case; unset detects", () => {
    expect(configuredVoiceLanguage(undefined)).toBe("auto");
    expect(configuredVoiceLanguage("ENGLISH")).toBe("English");
    expect(configuredVoiceLanguage("Auto")).toBe("auto");
    expect(configuredVoiceLanguage("Klingon")).toBeUndefined();
  });
});

describe("the choice in this browser", () => {
  const memory = () => {
    const items = new Map<string, string>();
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      items,
    };
  };

  it("is English until chosen, and remembers a choice", () => {
    const store = memory();
    expect(readVoiceLanguage(store)).toBe("English");
    saveVoiceLanguage("auto", store);
    expect(store.items.get(LANGUAGE_KEY)).toBe("auto");
    expect(readVoiceLanguage(store)).toBe("auto");
  });

  it("is English when the stored value is unknown or storage refuses", () => {
    const store = memory();
    store.items.set(LANGUAGE_KEY, "Klingon");
    expect(readVoiceLanguage(store)).toBe("English");
    const refusing = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(readVoiceLanguage(refusing)).toBe("English");
    expect(() => saveVoiceLanguage("French", refusing)).not.toThrow();
    expect(readVoiceLanguage(undefined)).toBe("English");
  });
});

describe("the studio's requests", () => {
  it("sends the language with each note", async () => {
    // A body reads once: a fresh answer for each note.
    const fetch = vi.fn(async (_url: string) =>
      Response.json({ text: "bonjour" }),
    );
    vi.stubGlobal("fetch", fetch);
    await transcribe(new Blob([]), new AbortController().signal, "French");
    await transcribe(new Blob([]), new AbortController().signal, "auto");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/voice/transcribe?language=French",
      "/api/voice/transcribe?language=auto",
    ]);
  });

  it("keeps only listed languages from the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          available: true,
          maxSeconds: 180,
          languages: ["auto", "English", "Klingon", 4],
        }),
      ),
    );
    expect((await voiceStatus()).languages).toEqual(["auto", "English"]);
  });
});

const python = (() => {
  try {
    return execFileSync("sh", ["-c", "command -v python3"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
})();

describe.skipIf(!python)("the worker's check of a request's language", () => {
  // validate_request is pure standard library; the model is never loaded.
  const run = (language: unknown) =>
    execFileSync(
      python,
      [
        // -B: no __pycache__ beside the worker.
        "-I",
        "-B",
        "-c",
        `import json, sys, tempfile, os
sys.path.insert(0, sys.argv[1])
from voice_worker import validate_request, WorkerFailure
fd, pcm = tempfile.mkstemp(suffix=".f32"); os.write(fd, b"\\0" * 64000); os.close(fd)
request = {"schema": 1, "pcmPath": pcm, "chunks": [[0, 16000]]}
request.update(json.loads(sys.argv[2]))
try:
    print(validate_request(request).get("language", "absent"))
except WorkerFailure as failure:
    print(failure)
finally:
    os.unlink(pcm)`,
        path.resolve("server/voice-worker"),
        JSON.stringify(language === undefined ? {} : { language }),
      ],
      { encoding: "utf8" },
    ).trim();

  it("takes a name or null, and refuses anything else", () => {
    expect(run("Japanese")).toBe("Japanese");
    expect(run(null)).toBe("None");
    expect(run(undefined)).toBe("absent");
    for (const bad of ["", "x".repeat(21), "Eng lish", "../x", 7])
      expect(run(bad)).toBe("invalid_language");
  });
});

// These fixtures exercise local voice; hosted detection is covered separately.
vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: async () => false,
  useHostedStudio: () => false,
}));
