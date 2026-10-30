// Open local models on Hermes (Qwen on Ollama and the like): a local
// provider keeps its own endpoint through the pins and runs the server's
// `name:tag` ids. And tool backends judged by what Hermes resolves them to:
// managed `nous` text to speech is OpenAI's, so it is refused.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runnerStatus } from "../server/agent-config";
import {
  OpenRouteError,
  assertOpenProfile,
  pinnedRoutes,
} from "../server/agent-hermes-pins";
import { setupInstructions } from "../server/agent-hermes-setup";
import { closedModel, isLocalProvider } from "../shared/open-route";
import { closedConfigPaths } from "../shared/open-route-config";
import { agentStudio, fakeHermesConfig } from "./agent-harness";

const OLLAMA = `model:
  default: qwen3.5:4b
  provider: ollama
  base_url: http://127.0.0.1:11434/v1
`;

describe("local model servers", () => {
  it("knows Hermes' local providers", () => {
    for (const provider of [
      "ollama",
      "custom",
      "vllm",
      "llamacpp",
      "llama.cpp",
      "lmstudio",
      "LM-Studio",
    ])
      expect(isLocalProvider(provider)).toBe(true);
    for (const provider of ["nous", "deepseek", "openrouter", "moa"])
      expect(isLocalProvider(provider)).toBe(false);
  });

  it("runs a server's name:tag id on a local provider only", () => {
    for (const provider of ["ollama", "lmstudio", "vllm", "custom"])
      expect(closedModel("qwen3.5:4b", provider)).toBeUndefined();
    expect(closedModel("qwen3.5:4b", "nous")).toBe("opaque");
    expect(closedModel("qwen3.5:4b")).toBe("opaque");
    // Selectors stay refused, local or not.
    for (const model of [
      "moa:default",
      "custom:qwen3",
      "local:qwen3",
      "anthropic:x",
      "openai-codex:y",
      "gpt-oss:20b",
      "llama3:o3",
    ])
      expect(closedModel(model, "ollama")).toBeDefined();
  });

  it("keeps a local provider's endpoint, and clears a hosted one's", () => {
    const keys = (provider: string) =>
      pinnedRoutes({ model: "m", provider }).map(([key]) => key);
    expect(keys("ollama")).not.toContain("model.base_url");
    expect(keys("ollama")).not.toContain("model.api_mode");
    expect(keys("nous")).toContain("model.base_url");
    expect(keys("nous")).toContain("model.api_mode");
  });

  it("checks the endpoint: http(s) and off Anthropic's and OpenAI's hosts", () => {
    expect(closedConfigPaths(OLLAMA)).toEqual([]);
    const endpoint = (url: string) =>
      closedConfigPaths(OLLAMA.replace("http://127.0.0.1:11434/v1", url));
    expect(endpoint("https://ollama.lan:11434/v1")).toEqual([]);
    for (const url of [
      "https://api.openai.com/v1",
      "https://api.anthropic.com",
      "https://x.openai.azure.com/openai",
      "moa://local",
      "file:///tmp/socket",
      "127.0.0.1:11434",
    ])
      expect(endpoint(url)).toEqual(["model.base_url"]);
  });

  it("tells the person to point the profile at the server, not to sign in", () => {
    const text = setupInstructions({
      root: "/home/someone/.hermes",
      home: "/home/someone",
      model: "qwen3.5:4b",
      provider: "ollama",
    });
    expect(text).toContain(
      "hermes -p genobi config set model.base_url http://127.0.0.1:11434/v1",
    );
    expect(text).not.toContain("auth add");
  });

  it(
    "an Ollama profile keeps its endpoint through setup and its session launches",
    { timeout: 20_000 },
    async () => {
      const config = await fakeHermesConfig({
        hermesModel: "qwen3.5:4b",
        hermesProvider: "ollama",
      });
      const home = config.hermesHome!;
      await writeFile(path.join(home, "config.yaml"), OLLAMA);
      expect(await runnerStatus(config)).toEqual({
        available: true,
        runner: "hermes",
      });
      const studio = await agentStudio({ config, sampleMs: 50 });
      const cookie = await studio.fresh();
      const started = await studio.start(cookie, "Check the studio");
      expect(started.status).toBe(201);
      const done = await studio.settle(cookie, started.body.id);
      expect(done.status).toBe("done");
      expect(done.lines).toContain("Hermes on qwen3.5:4b.");
      // The session's update set the pins without touching the endpoint.
      const recorded = JSON.parse(
        await readFile(path.join(home, "fake-config.json"), "utf8"),
      );
      expect(recorded["model.provider"]).toBe("ollama");
      expect(recorded["model.default"]).toBe("qwen3.5:4b");
      expect(recorded).not.toHaveProperty("model.base_url");
      expect(await readFile(path.join(home, "config.yaml"), "utf8")).toBe(
        OLLAMA,
      );
    },
  );
});

describe("tool backends, by what Hermes resolves", () => {
  it("refuses managed nous text to speech and speech to text, which are OpenAI's", () => {
    expect(closedConfigPaths("tts:\n  provider: nous\n")).toEqual([
      "tts.provider",
    ]);
    expect(closedConfigPaths("tts: {provider: nous}\n")).toEqual([
      "tts.provider",
    ]);
    expect(closedConfigPaths("stt:\n  provider: Nous\n")).toEqual([
      "stt.provider",
    ]);
    expect(closedConfigPaths("tts:\n  provider: openai\n")).toEqual([
      "tts.provider",
    ]);
    // Open or neither vendor's: the default Edge voices, local engines.
    for (const engine of ["edge", "piper", "kittentts", "neutts"])
      expect(closedConfigPaths(`tts:\n  provider: ${engine}\n`)).toEqual([]);
    // Managed image generation is judged by its model.
    expect(
      closedConfigPaths(
        "image_gen:\n  provider: nous\n  model: fal-ai/flux-2/klein/9b\n",
      ),
    ).toEqual([]);
    expect(
      closedConfigPaths(
        "image_gen:\n  provider: nous\n  model: fal-ai/gpt-image-2\n",
      ),
    ).toEqual(["image_gen.model"]);
  });

  it("refuses a session while the profile names nous text to speech", async () => {
    const config = await fakeHermesConfig();
    await writeFile(
      path.join(config.hermesHome!, "config.yaml"),
      "tts:\n  provider: nous\n",
    );
    await expect(assertOpenProfile(config.hermesHome!)).rejects.toBeInstanceOf(
      OpenRouteError,
    );
  });
});
