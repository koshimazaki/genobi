import { expect, it } from "vitest";
import { setup } from "./server-harness";
import { runtimeCapabilities } from "../shared/runtime-capabilities";

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
