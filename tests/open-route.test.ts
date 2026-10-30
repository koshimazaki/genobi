// The open-route guard (shared/open-route.ts): Hermes never runs an
// Anthropic or OpenAI model, or any model through their providers. Whole
// words, any case, so an unrelated model that merely contains the letters
// still runs.
import { describe, expect, it } from "vitest";
import {
  OPEN_ROUTE_REFUSAL,
  canonicalProvider,
  isLocalProvider,
  closedModel,
  closedProvider,
  openRouteRefusal,
} from "../shared/open-route";

describe("the open-route guard", () => {
  it.each([
    "deepseek/deepseek-v4-pro",
    "deepseek/deepseek-v4-flash",
    "deepseek/deepseek-v4.1-flash",
    "deepseek-flash",
    "DeepSeek/DeepSeek-V4-Pro",
    "qwen/qwen3-vl-235b-a22b-instruct",
    "qwen/qwen3-coder-480b-a35b",
    "qwen/qwen3-coder:free",
    "moonshotai/kimi-k3",
    "z-ai/glm-5.3",
    "nousresearch/hermes-4-405b",
    "allenai/olmo-2-32b",
    "meta-llama/llama-4-maverick",
    "nvidia/nemotron-3-super-120b-a12b",
    "deepseek-ai/DeepSeek-V4-Pro",
  ])("lets the open model %s run", (model) => {
    expect(closedModel(model)).toBeUndefined();
  });

  it.each([
    ["anthropic/claude-sonnet-5", "anthropic"],
    ["claude-opus-4-8", "anthropic"],
    ["Claude-Sonnet-4.6", "anthropic"],
    ["ANTHROPIC/whatever", "anthropic"],
    ["openai/gpt-5.5", "openai"],
    ["openai/gpt-oss-120b", "openai"],
    ["gpt-6-astra", "openai"],
    ["GPT-4o", "openai"],
    ["chatgpt-4o-latest", "openai"],
    ["gpt-5-codex", "openai"],
    ["codex-mini-latest", "openai"],
    ["o1", "openai"],
    ["o3-pro", "openai"],
    ["openai/o4-mini", "openai"],
    ["o5", "openai"],
    ["openai/anything-new", "openai"],
    ["openrouter/auto", "opaque"],
    ["openrouter/pareto-code", "opaque"],
    // Selectors Hermes routes elsewhere (cli.py, `_normalize_moa_model`;
    // models.py, `parse_model_input`): the allow-shape refuses them all.
    ["moa:default", "opaque"],
    ["MOA:deepseek", "opaque"],
    ["nous:deepseek/deepseek-v4-pro", "opaque"],
    ["deepseek:deepseek-v4-pro", "opaque"],
    ["custom:local:qwen3", "opaque"],
    ["qwen3.5:4b", "opaque"],
    ["~deepseek/deepseek-pro-latest", "opaque"],
    ["deepseek/deepseek/v4", "opaque"],
    ["deepseek v4", "opaque"],
    ["moa/default", "opaque"],
    ["auto/deepseek-v4-pro", "opaque"],
  ])("refuses %s (%s)", (model, reason) => {
    expect(closedModel(model)).toBe(reason);
  });

  it.each([
    "nous",
    "deepseek",
    "openrouter",
    "opencode-go",
    "ollama-cloud",
    "lmstudio",
    "alibaba",
    "nebius",
    "azure-foundry",
    "copilot",
  ])("lets the provider %s run", (provider) => {
    expect(closedProvider(provider)).toBeUndefined();
  });

  it.each([
    ["anthropic", "anthropic"],
    ["Anthropic", "anthropic"],
    ["claude", "anthropic"],
    ["claude-code", "anthropic"],
    ["commandcode-anthropic", "anthropic"],
    ["openai", "openai"],
    ["openai-codex", "openai"],
    ["openai-api", "openai"],
    ["azure-openai", "openai"],
    ["chatgpt", "openai"],
    ["chatgpt-codex", "openai"],
    ["codex", "openai"],
    ["auto", "opaque"],
    ["moa", "opaque"],
    ["copilot-acp", "opaque"],
  ])("refuses the provider %s (%s)", (provider, reason) => {
    expect(closedProvider(provider)).toBe(reason);
  });

  it("leaves an unset model to the separate missing-model check", () => {
    expect(closedModel("")).toBeUndefined();
    expect(closedModel("  ")).toBeUndefined();
  });

  it("canonicalises a provider as Hermes does: case and aliases", () => {
    expect(canonicalProvider(" Nous ")).toBe("nous");
    expect(canonicalProvider("Deep-Seek")).toBe("deepseek");
    expect(canonicalProvider("Ollama")).toBe("custom");
    expect(canonicalProvider("LM-Studio")).toBe("lmstudio");
    expect(closedProvider("Claude-Code")).toBe("anthropic");
    expect(closedProvider("ChatGPT")).toBe("openai");
    expect(closedProvider("Nous")).toBeUndefined();
    expect(isLocalProvider("VLLM")).toBe(true);
  });

  it("names which of the pair is refused", () => {
    expect(
      openRouteRefusal("deepseek/deepseek-v4-pro", "nous"),
    ).toBeUndefined();
    expect(openRouteRefusal("anthropic/claude-sonnet-5", "nous")).toBe("model");
    expect(openRouteRefusal("deepseek/deepseek-v4-pro", "anthropic")).toBe(
      "provider",
    );
    expect(openRouteRefusal("openai/gpt-5.5", "openai-codex")).toBe("model");
    expect(openRouteRefusal("moa:default", "nous")).toBe("model");
  });

  it("explains the rule in a fixed sentence that recommends the open model", () => {
    expect(OPEN_ROUTE_REFUSAL).toMatch(/open route/);
    expect(OPEN_ROUTE_REFUSAL).toMatch(/Anthropic or OpenAI/);
    expect(OPEN_ROUTE_REFUSAL).toContain("deepseek/deepseek-v4-pro");
  });
});
