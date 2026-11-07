import { expect, it } from "vitest";
import { setup } from "./server-harness";
import { runtimeCapabilities } from "../shared/runtime-capabilities";
import { declaredRoutes } from "./declared-routes";

it("discovers local support without claiming installed voice or headless rendering", async () => {
  const { base, cookie } = await setup();
  const response = await fetch(`${base}/api/capabilities`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  const capabilities = await response.json();
  expect(capabilities).toEqual(runtimeCapabilities("local"));
  expect(capabilities).toMatchObject({
    runtime: "local",
    limits: { deploymentInputBytes: 150_000_000 },
    features: {
      voice: { supported: true, statusRoute: "/api/voice/status" },
      projects: { supported: true },
      projectMediaStaging: { supported: true },
      projectMediaOperations: { supported: true },
      worldMedia: { supported: true, execution: "browser" },
      browserExport: {
        supported: true,
        execution: "browser",
        headlessExport: false,
      },
      editor: { execution: "browser", headlessExport: false },
      worldCapture: { execution: "browser", headlessCapture: false },
    },
  });
  const voice = await fetch(
    `${base}${capabilities.features.voice.statusRoute}`,
    {
      headers: { cookie },
    },
  );
  expect(voice.status).toBe(200);
  expect(await voice.json()).toMatchObject({ available: false, model: false });
  const settings = await fetch(`${base}/api/settings/run-location`, {
    headers: { cookie },
  }).then((r) => r.json());
  expect(capabilities.runLocations).toEqual(settings.choices);
  expect(capabilities.limits.deploymentInputBytes).toBe(
    settings.deploymentInputBytes,
  );
});

it("advertises only routes the local server declares", () => {
  const declared = new Set(declaredRoutes());
  const advertised = Object.entries(runtimeCapabilities("local").features)
    .flatMap(
      ([name, feature]) =>
        (feature as { routes?: string[] }).routes?.map(
          (r) => `${name}: ${r}`,
        ) ?? [],
    )
    .filter((entry) => !declared.has(entry.slice(entry.indexOf(": ") + 2)));
  expect(advertised).toEqual([]);
});

it("advertises the World file download agents use", () => {
  expect(runtimeCapabilities("local").features.worldControl.routes).toContain(
    "GET /api/world/:id/files/:file",
  );
});
