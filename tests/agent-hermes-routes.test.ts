// Every model route in the `genobi` profile: the pins on each auxiliary
// task, delegation, Mixture of Agents and cron, every fallback chain empty,
// and the config.yaml check that refuses a session while any key still
// names an Anthropic or OpenAI model, provider or endpoint.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hermesPlan } from "../server/agent-hermes";
import {
  AUXILIARY_TASKS,
  OpenRouteError,
  assertOpenProfile,
  pinnedRoutes,
} from "../server/agent-hermes-pins";
import {
  applyProfile,
  profileSettings,
  type HermesRun,
} from "../server/agent-hermes-profile";
import { closedConfigPaths } from "../shared/open-route-config";
import { agentStudio, fakeHermesConfig, fakeMachine } from "./agent-harness";

const pinned = { model: "deepseek/deepseek-v4-pro", provider: "nous" };

/** A profile someone filled in by hand before Genobi set it up. */
const SEEDED = `model:
  default: deepseek/deepseek-v4-pro
  provider: nous
auxiliary:
  compression:
    provider: anthropic
    model: claude-sonnet-5
    fallback_chain:
      - provider: openai-codex
        model: gpt-5.5
`;

describe("the profile's model routes", () => {
  it("pins every auxiliary task, sub-agents, MoA and cron to the open route", () => {
    const routes = new Map(pinnedRoutes(pinned));
    for (const name of [
      "vision",
      "compression",
      "title_generation",
      "background_review",
      "moa_reference",
      "moa_aggregator",
      "review",
      "curator",
    ])
      expect(AUXILIARY_TASKS).toContain(name);
    expect(routes.get("auxiliary.openrouter_model")).toBe("");
    for (const name of AUXILIARY_TASKS)
      expect(routes.get(`auxiliary.${name}`)).toMatchObject({
        ...pinned,
        base_url: "",
        api_key: "",
        fallback_chain: [],
      });
    expect(routes.get("fallback_providers")).toEqual([]);
    expect(routes.get("fallback_model")).toEqual([]);
    expect(routes.get("delegation.fallback_providers")).toEqual([]);
    expect(routes.get("delegation.provider")).toBe("");
    expect(routes.get("model.aliases")).toEqual({});
    expect(routes.get("model_aliases")).toEqual({});
    expect(routes.get("model.base_url")).toBe("");
    expect(routes.get("moa.active_preset")).toBe("");
    expect(routes.get("moa.default_preset")).toBe("default");
    // The whole presets block: any other preset is dropped.
    expect(routes.get("moa.presets")).toEqual({
      default: {
        reference_models: [{ provider: "nous", model: pinned.model }],
        aggregator: { provider: "nous", model: pinned.model },
      },
    });
    expect(routes.get("cron.provider")).toBe("");
    expect(routes.get("stt.enabled")).toBe(false);
    expect(routes.get("model.openai_runtime")).toBe("");
    // No value the pins write names a closed route.
    expect(JSON.stringify([...routes.values()])).not.toMatch(
      /anthropic|claude|openai|gpt|codex/i,
    );
  });
});

describe("the config.yaml check", () => {
  it("finds a closed auxiliary route and its fallback chain", () => {
    expect(closedConfigPaths(SEEDED)).toEqual([
      "auxiliary.compression.provider",
      "auxiliary.compression.model",
      "auxiliary.compression.fallback_chain.provider",
      "auxiliary.compression.fallback_chain.model",
    ]);
  });

  it("finds closed routes in flow mappings, other sections and endpoints", () => {
    const found = closedConfigPaths(`model:
  default: "moa:default"
fallback_providers: [{provider: openrouter, model: anthropic/claude-opus-4.8}]
delegation: {provider: chatgpt, model: ''}
tts:
  provider: openai   # OpenAI's TTS
providers:
  proxy:
    base_url: https://api.openai.com/v1
compression:
  summary_provider: claude
voice:
  voice_chat_mode: gpt_live
moa:
  presets:
    default:
      reference_models:
        - provider: openai-codex
          model: gpt-5.5
`);
    expect(found).toEqual([
      "model.default",
      "fallback_providers.model",
      "delegation.provider",
      "tts.provider",
      "providers.proxy.base_url",
      "compression.summary_provider",
      "voice.voice_chat_mode",
      "moa.presets.default.reference_models.provider",
      "moa.presets.default.reference_models.model",
    ]);
  });

  it("passes an open profile, Genobi's own keys included", () => {
    expect(
      closedConfigPaths(`model:
  default: deepseek/deepseek-v4-pro
  provider: nous
  base_url: ''
fallback_providers: []
fallback_model: []
auxiliary:
  compression:
    provider: nous
    model: deepseek/deepseek-v4-pro
    fallback_chain: []
tts:
  provider: edge
wake_word:
  provider: openwakeword
x_search:
  model: grok-4.5
mcp_servers:
  genobi:
    env:
      GENOBI_URL: http://127.0.0.1:4317
tools:
  tool_search:
    enabled: 'off'
`),
    ).toEqual([]);
  });
});

describe("a pre-seeded profile", { timeout: 20_000 }, () => {
  it("has its routes set again, then refuses while one is still closed", async () => {
    const config = await fakeHermesConfig();
    const home = config.hermesHome!;
    await writeFile(path.join(home, "config.yaml"), SEEDED);
    const calls: string[][] = [];
    const run: HermesRun = async (args) => {
      calls.push(args);
    };
    // The changed config.yaml makes the pins run again, chains included.
    expect(
      await applyProfile(
        home,
        profileSettings(config, "http://127.0.0.1:1"),
        run,
        {},
      ),
    ).toBe(true);
    const compression = JSON.parse(
      calls.find((c) => c[2] === "auxiliary.compression")![3],
    );
    expect(compression).toMatchObject({
      ...pinned,
      fallback_chain: [],
    });
    // The recorder changed nothing on disk, so the closed route is still
    // there: the check refuses, naming the keys and never the values.
    const refusal = await assertOpenProfile(home).catch((e: Error) => e);
    expect(refusal).toBeInstanceOf(OpenRouteError);
    expect((refusal as Error).message).toContain(
      "auxiliary.compression.provider",
    );
    expect((refusal as Error).message).not.toMatch(/claude-sonnet|gpt-5/);
  });

  it("ends the session before Hermes runs a chat", async () => {
    const config = await fakeHermesConfig();
    await writeFile(path.join(config.hermesHome!, "config.yaml"), SEEDED);
    const { root: workdir } = await fakeMachine();
    await expect(
      hermesPlan(config, {
        prompt: "x",
        studioOrigin: "http://127.0.0.1:4431",
        ticketUrl: "http://127.0.0.1:4431/api/agent/ticket/T",
        workdir,
      }),
    ).rejects.toBeInstanceOf(OpenRouteError);
    const studio = await agentStudio({ config });
    const cookie = await studio.fresh();
    const started = await studio.start(cookie, "Check the studio");
    const done = await studio.settle(cookie, started.body.id);
    expect(done.status).toBe("failed");
    expect(done.lines.join("\n")).toMatch(/still names an Anthropic or OpenAI/);
    // The fake prints "Hermes on <model>." only when its chat starts.
    expect(done.lines.join("\n")).not.toMatch(/Hermes on/);
    expect(
      JSON.parse(
        await readFile(
          path.join(config.hermesHome!, "fake-config.json"),
          "utf8",
        ),
      )["auxiliary.compression"],
    ).toMatchObject(pinned);
  });
});
