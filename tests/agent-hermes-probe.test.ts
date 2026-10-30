// The profile's .env and the routes Hermes' own resolvers answer before every
// session: an OpenAI base URL in the environment is refused by name, a route
// on Anthropic, OpenAI or the Codex app server is refused, and so is a
// signed-in profile whose routes do not resolve.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OpenRouteError, assertOpenProfile } from "../server/agent-hermes-pins";
import { agentConfig } from "../server/agent-config";
import { hermesPlan } from "../server/agent-hermes";
import {
  ROUTE_CLOSED,
  ROUTE_UNRESOLVED,
  assertOpenRoute,
  routeVerdict,
  type ProbeResult,
  type ProbedRoute,
  type RouteProbe,
} from "../server/agent-hermes-probe";
import type { HermesRun } from "../server/agent-hermes-profile";
import { closedEnvNames } from "../shared/open-route-config";
import { fakeHermesConfig, fakeMachine } from "./agent-harness";

describe("the profile's .env", () => {
  it("names a variable that points at Anthropic or OpenAI, never its value", () => {
    expect(
      closedEnvNames(`OPENAI_API_KEY=sk-not-a-url
OPENAI_BASE_URL=https://API.openai.com./v1
export CUSTOM_BASE_URL="api.anthropic.com"
LM_BASE_URL=http://127.0.0.1:1234/v1
NOTE=see https://claude.ai/settings
`),
    ).toEqual(["OPENAI_BASE_URL", "CUSTOM_BASE_URL", "NOTE"]);
  });

  it("refuses a session while the .env names one", async () => {
    const config = await fakeHermesConfig();
    await writeFile(
      path.join(config.hermesHome!, ".env"),
      "OPENAI_BASE_URL=https://api.openai.com/v1\n",
    );
    const refusal = await assertOpenProfile(config.hermesHome!).catch(
      (e: Error) => e,
    );
    expect(refusal).toBeInstanceOf(OpenRouteError);
    expect((refusal as Error).message).toContain(".env OPENAI_BASE_URL");
    expect((refusal as Error).message).not.toContain("api.openai.com");
  });
});

describe("the routes Hermes resolves, before every session", () => {
  const route = (extra: Partial<ProbedRoute> = {}): ProbedRoute => ({
    route: "main",
    resolved: true,
    provider: "nous",
    scheme: "https",
    host: "inference-api.nousresearch.com",
    ...extra,
  });
  const probe = (extra: Partial<ProbeResult> = {}): ProbeResult => ({
    available: true,
    loaded: true,
    expanded: true,
    signed_in: true,
    routes: [route()],
    ...extra,
  });

  it("passes Nous, Ollama and an inheriting auxiliary task", () => {
    expect(routeVerdict(probe())).toBe("open");
    expect(
      routeVerdict(
        probe({
          routes: [
            route({ provider: "custom", scheme: "http", host: "127.0.0.1" }),
            route({ route: "auxiliary.compression", host: "", inherits: true }),
          ],
        }),
      ),
    ).toBe("open");
    // Signed in to Nous, token due a refresh: the stored endpoint stands in.
    expect(
      routeVerdict(probe({ routes: [route({ error: "AuthError" })] })),
    ).toBe("open");
  });

  it("refuses any route on an Anthropic or OpenAI host, provider or the Codex app server", () => {
    for (const bad of [
      route({ host: "api.openai.com." }),
      route({ route: "credential_pool", host: "API.Anthropic.com" }),
      route({ route: "auxiliary.vision", provider: "openai-codex", host: "" }),
      route({ api_mode: "codex_app_server" }),
      route({ scheme: "moa", host: "local" }),
    ])
      expect(routeVerdict(probe({ routes: [route(), bad] }))).toBe("closed");
  });

  it("refuses a signed-in profile whose routes do not resolve, and not a fresh one", () => {
    const failed = route({ resolved: false, error: "AuthError", host: "" });
    expect(routeVerdict(probe({ routes: [failed] }))).toBe("unresolved");
    expect(routeVerdict(probe({ loaded: false }))).toBe("unresolved");
    expect(routeVerdict(probe({ routes: [] }))).toBe("unresolved");
    // Before the first sign-in nothing can resolve yet.
    expect(routeVerdict(probe({ signed_in: false, routes: [failed] }))).toBe(
      "open",
    );
    // No answer at all reads as signed in: refused.
    expect(
      routeVerdict({ available: true, loaded: false, signed_in: true }),
    ).toBe("unresolved");
    // Another install layout: no probe, the name checks still apply.
    expect(routeVerdict({ available: false })).toBe("open");
  });

  it("asks before every session, so a pool endpoint changed since is refused", async () => {
    const config = await fakeHermesConfig();
    const { root: workdir } = await fakeMachine();
    const answers = [
      probe(),
      probe({
        routes: [
          route(),
          route({ route: "credential_pool", host: "api.openai.com" }),
        ],
      }),
    ];
    let asked = 0;
    const run: HermesRun = Object.assign(async () => {}, {
      probe: (async () => {
        asked += 1;
        return answers.shift()!;
      }) as RouteProbe,
    });
    const input = {
      prompt: "x",
      studioOrigin: "http://127.0.0.1:1",
      ticketUrl: "http://127.0.0.1:1/api/agent/ticket/T",
      workdir,
    };
    await expect(hermesPlan(config, input, {}, { run })).resolves.toBeDefined();
    // Nothing in config.yaml or .env changed; auth.json did.
    const refusal = await hermesPlan(config, input, {}, { run }).catch(
      (e: Error) => e,
    );
    expect(refusal).toBeInstanceOf(OpenRouteError);
    expect((refusal as Error).message).toBe(ROUTE_CLOSED);
    expect(asked).toBe(2);
  });

  it("refuses a pinned backend that fails over to another endpoint", () => {
    const failover = (host: string) =>
      route({
        route: "failover.vision",
        failover: true,
        provider: "openrouter",
        host,
      });
    expect(
      routeVerdict(probe({ routes: [route(), failover("openrouter.ai")] })),
    ).toBe("closed");
    // The auto chain starting at the main route's own endpoint is the pin.
    expect(
      routeVerdict(
        probe({
          routes: [route(), failover("inference-api.nousresearch.com.")],
        }),
      ),
    ).toBe("open");
  });

  it("refuses an expanded config that names a closed route, or none written", () => {
    expect(routeVerdict(probe({ config: ["tts.provider"] }))).toBe("closed");
    expect(routeVerdict(probe({ expanded: false }))).toBe("unresolved");
  });

  it("lower-cases the provider as Hermes keys it", async () => {
    const config = await agentConfig({
      GENOBI_AGENT_RUNNER: "hermes",
      GENOBI_AGENT_HERMES_MODEL: "deepseek/deepseek-v4-pro",
      GENOBI_AGENT_HERMES_PROVIDER: "Nous",
    });
    expect(config.hermesProvider).toBe("nous");
    expect(config.hermesClosed).toBe(false);
  });

  it("refuses with fixed sentences that name no value", async () => {
    const env = {};
    const pinned = { model: "m", provider: "nous" };
    await expect(
      assertOpenRoute(
        async () => probe({ routes: [route({ resolved: false })] }),
        env,
        pinned,
      ),
    ).rejects.toThrow(ROUTE_UNRESOLVED);
    await expect(
      assertOpenRoute(async () => probe(), env, pinned),
    ).resolves.toBeUndefined();
    await expect(
      assertOpenRoute(undefined, env, pinned),
    ).resolves.toBeUndefined();
  });
});
