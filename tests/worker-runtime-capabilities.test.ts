import { expect, it } from "vitest";
import { call, useWorker } from "./worker-harness";
import { runtimeCapabilities } from "../shared/runtime-capabilities";

useWorker();

it("advertises hosted routes and browser requirements without local-only endpoints", async () => {
  const response = await call("/api/capabilities");
  expect(response.status).toBe(200);
  const capabilities = (await response.json()) as ReturnType<
    typeof runtimeCapabilities
  >;
  expect(capabilities).toEqual(runtimeCapabilities("hosted"));
  expect(capabilities.features.voice).toMatchObject({
    supported: false,
    routes: [],
  });
  expect(capabilities.features.projects.supported).toBe(false);
  expect(capabilities.features.worldRecipe.supported).toBe(false);
  expect(capabilities.features.workflows.supported).toBe(true);
  expect(capabilities.features.worldCapture.headlessCapture).toBe(false);
  const settings = (await call("/api/settings/run-location").then((r) =>
    r.json(),
  )) as {
    choices: string[];
    deploymentInputBytes: number;
  };
  expect(capabilities.runLocations).toEqual(settings.choices);
  expect(capabilities.limits.deploymentInputBytes).toBe(
    settings.deploymentInputBytes,
  );
});
