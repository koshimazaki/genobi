/**
 * Where this World Builder runs. The Comfy node's standalone bundle
 * (`scripts/build-scene-adapter.mjs`) defines `globalThis.__genobiWorldHost`
 * as "comfy" at build time; the studio never sets it. Inside Comfy an agent
 * reaches the node through the graph, so the studio's agent links are left
 * out there, and the Sound tab names the graph's audio outputs as such.
 */
declare global {
  var __genobiWorldHost: string | undefined;
}

export function inComfyNode() {
  return globalThis.__genobiWorldHost === "comfy";
}
