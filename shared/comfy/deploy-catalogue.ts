import manifest from "../../workflows/ltx-world-builder.endpoints.json";

export const DEPLOY_ENDPOINTS = ["layout-to-video", "akuspace"] as const;
export type DeployEndpoint = (typeof DEPLOY_ENDPOINTS)[number];
export type DeployModel = `ltx-deploy-${DeployEndpoint}`;
export const isDeployModel = (value: unknown): value is DeployModel =>
  typeof value === "string" &&
  value.startsWith("ltx-deploy-") &&
  (DEPLOY_ENDPOINTS as readonly string[]).includes(value.slice(11));
export const deployEndpoint = (model: DeployModel) =>
  manifest.endpoints.find((e) => e.name === model.slice(11))!;
export const deployLabel = (name: string) => name.replaceAll("_", " ");
