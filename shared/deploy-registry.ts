import {
  DEPLOY_ENDPOINTS,
  deployEndpoint,
  deployLabel,
} from "./comfy/deploy-catalogue";
import type { ReadyEntry } from "./registry-types";

export const deployEntries: ReadyEntry[] = DEPLOY_ENDPOINTS.map((name) => {
  const videoModel = `ltx-deploy-${name}` as const;
  const endpoint = deployEndpoint(videoModel);
  return {
    id: videoModel,
    videoModel,
    label: "LTX-2.5 · Comfy Deploy",
    task: deployLabel(name),
    family: "ltx",
    status: "ready",
    recipeVersion: 1,
    generator: "video",
    route: "workflow",
    model: `workflow/${endpoint.workflow.slice(0, -5)}`,
    open: true,
    camera: "ltx-2.5",
    deploymentOnly: true,
    controls: {
      kind: "video",
      duration: {
        choices: [8],
      },
      aspectRatios: ["16:9"],
      resolutions: ["hd"],
      draft: false,
      camera: true,
      acoustic: false,
    },
  };
});
