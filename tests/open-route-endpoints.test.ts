// Endpoints in a Hermes profile, whatever key holds them: any URL under any
// key or list, block or flow YAML, and a bare host under an endpoint key, is
// refused on an Anthropic or OpenAI host; a local or self-hosted server
// passes. Paths name the key, never the value.
import { describe, expect, it } from "vitest";
import { closedConfigPaths } from "../shared/open-route-config";

const proxy = (entry: string) => `model:
  default: deepseek/deepseek-v4-pro
  provider: proxy
providers:
  proxy:
${entry}
`;

describe("endpoints under any key", () => {
  it.each([
    ["    api: https://api.openai.com/v1", "providers.proxy.api"],
    ["    url: https://api.anthropic.com", "providers.proxy.url"],
    ["    endpoint: api.openai.com/v1", "providers.proxy.endpoint"],
    ["    api: //api.openai.com/v1", "providers.proxy.api"],
    ["    api: wss://api.openai.com/v1/realtime", "providers.proxy.api"],
    [
      "    mirrors:\n      - https://api.openai.com/v1\n      - http://127.0.0.1:8000/v1",
      "providers.proxy.mirrors",
    ],
    [
      "    routes:\n      - {name: a, target: 'https://claude.ai/api'}",
      "providers.proxy.routes.target",
    ],
    [
      "    extra: {upstream: https://chatgpt.com/backend-api}",
      "providers.proxy.extra.upstream",
    ],
    [
      "    api: https://my-resource.openai.azure.com/openai",
      "providers.proxy.api",
    ],
    ["    api: https://cdn.oaistatic.com/x", "providers.proxy.api"],
    [
      "    api: https://openai-audio-gateway.nousresearch.com/v1",
      "providers.proxy.api",
    ],
  ])("refuses %s", (entry, path) => {
    expect(closedConfigPaths(proxy(entry))).toEqual([path]);
  });

  it("compares hosts after IDNA, case and trailing-dot normalisation", () => {
    for (const host of [
      "API.OpenAI.COM",
      "api.openai.com.",
      "Api.Anthropic.Com..",
      "ａｐｉ.ｏｐｅｎａｉ.ｃｏｍ",
    ])
      expect(closedConfigPaths(proxy(`    api: https://${host}/v1`))).toEqual([
        "providers.proxy.api",
      ]);
  });

  it("normalises a model.base_url host the same way", () => {
    for (const host of [
      "api.openai.com.",
      "API.ANTHROPIC.COM.",
      "ａｐｉ.ｏｐｅｎａｉ.ｃｏｍ",
    ])
      expect(
        closedConfigPaths(
          `model:\n  provider: custom\n  base_url: https://${host}/v1\n`,
        ),
      ).toEqual(["model.base_url"]);
  });

  it("lets a local or self-hosted server through", () => {
    for (const url of [
      "http://127.0.0.1:11434/v1",
      "http://localhost:1234/v1",
      "https://vllm.internal.example:8000/v1",
      "http://[::1]:8080/v1",
      "https://inference-api.nousresearch.com/v1",
    ])
      expect(closedConfigPaths(proxy(`    api: ${url}`))).toEqual([]);
    // A word inside a longer label is not a vendor's host.
    expect(
      closedConfigPaths(proxy("    api: https://openwakeword.example/v1")),
    ).toEqual([]);
  });

  it("leaves a routing ${VAR} to the expanded check, which refuses one still unresolved", () => {
    const raw =
      "tts:\n  provider: ${SPEECH_BACKEND}\nmodel:\n  base_url: ${OLLAMA_URL}\n";
    // Raw, Hermes has not expanded it yet: the route probe checks it.
    expect(closedConfigPaths(raw)).toEqual([]);
    // Expanded, a reference still there was not resolved.
    expect(closedConfigPaths(raw, { expanded: true })).toEqual([
      "tts.provider",
      "model.base_url",
    ]);
    // Expanded to managed Nous speech, which is OpenAI's.
    expect(
      closedConfigPaths("tts:\n  provider: nous\n", { expanded: true }),
    ).toEqual(["tts.provider"]);
    // A reference outside a routing key is not a route.
    expect(
      closedConfigPaths("display:\n  skin: ${SKIN}\n", { expanded: true }),
    ).toEqual([]);
  });

  it("refuses OpenAI's Codex app server as the runtime, not other modes", () => {
    expect(
      closedConfigPaths("model:\n  openai_runtime: codex_app_server\n"),
    ).toEqual(["model.openai_runtime"]);
    expect(closedConfigPaths(proxy("    api_mode: codex_app_server"))).toEqual([
      "providers.proxy.api_mode",
    ]);
    expect(closedConfigPaths(proxy("    api_mode: codex_responses"))).toEqual(
      [],
    );
  });
});
