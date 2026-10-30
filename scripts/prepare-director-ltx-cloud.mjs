import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    "Usage: node scripts/prepare-director-ltx-cloud.mjs <verified-workflow.json> <new-cloud-workflow.json>",
  );
const bytes = await readFile(input);
if (
  createHash("sha256").update(bytes).digest("hex") !==
  "b7a59e1a02dd9a93b79540b162ed326be956901ffbc970e0a168b9ebff3031ae"
)
  throw new Error(
    "Expected the pinned official inpainting graph. Fetch it first.",
  );
const graph = JSON.parse(bytes);
const sub = graph.definitions.subgraphs.find(
  (s) => s.id === "c9a49931-8154-4596-8a93-d47126ad589a",
);
// Cloud lacks the optional API encoders. Select the existing native Gemma path.
const removed = new Set([5020, 5021, 5022, 5611, 5612, 5613]);
for (const [id, slot] of [
  [13835, 0],
  [13836, 1],
]) {
  const link = sub.links.find((l) => l.id === id);
  link.origin_id = 1241;
  link.origin_slot = slot;
}
sub.nodes = sub.nodes.filter((n) => !removed.has(n.id));
sub.links = sub.links.filter(
  (l) => !removed.has(l.origin_id) && !removed.has(l.target_id),
);
const links = new Set(sub.links.map((l) => l.id));
for (const n of sub.nodes) {
  for (const i of n.inputs ?? [])
    if (i.link !== null && !links.has(i.link)) i.link = null;
  for (const [slot, o] of (n.outputs ?? []).entries())
    o.links = sub.links
      .filter((l) => l.origin_id === n.id && l.origin_slot === slot)
      .map((l) => l.id);
}
for (const port of [...sub.inputs, ...sub.outputs])
  port.linkIds = port.linkIds.filter((id) => links.has(id));
// Cloud omits the unused API-key input and linked COMBO widget after pruning.
const inputs = graph.nodes.find((n) => n.id === 5408);
inputs.widgets_values_named["use image input"] = true;
inputs.widgets_values_named["Enhance positive prompt"] = false;
inputs.widgets_values = ["", 15, true, false, "", 457289196];
graph.id = randomUUID();
graph.extra = {
  ...graph.extra,
  directorAdaptation: {
    sourceRevision: "44c8a36b7c31ee00b4271daed11dc2a4aa481140",
    change:
      "Native Gemma encoding only; optional unsupported Gemma API path removed. Preserve upstream license beside this derived graph.",
    inferenceVerified: false,
  },
};
// Check all surviving internal edges before emitting a graph for UI validation.
const nodes = new Map(sub.nodes.map((n) => [n.id, n]));
for (const l of sub.links) {
  if (
    l.origin_id !== -10 &&
    !nodes.get(l.origin_id)?.outputs?.[l.origin_slot]?.links?.includes(l.id)
  )
    throw new Error(`Broken output ${l.id}`);
  if (
    l.target_id !== -20 &&
    nodes.get(l.target_id)?.inputs?.[l.target_slot]?.link !== l.id
  )
    throw new Error(`Broken input ${l.id}`);
}
await writeFile(output, JSON.stringify(graph, null, 2), { flag: "wx" });
console.log(
  "Prepared native-encoder Cloud candidate; import and check Issues before running. Model compatibility and inference are not yet verified.",
);
