import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

// The local server validates projects with `src/director/validate.ts` under
// plain Node (tsx), without Vite. Vite-only imports such as a recipe's
// `?raw` source must stay out of that graph, or the server fails before it
// listens. Vitest would resolve them, so this runs a separate Node process.
const script = `
const { validateProject } = await import("./src/director/validate.ts");
await import("./server/projects.ts");
await import("./server/project-takes.ts");
const { readFileSync } = await import("node:fs");
const p = validateProject(
  JSON.parse(readFileSync("docs/director-bundle/effects/project.json", "utf8")),
);
console.log(Object.keys(p.modules).sort().join(","));
`;

describe("the server's project modules load under plain Node", () => {
  it("imports them without Vite and trusts the motion effects", () => {
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(out.trim()).toBe("grade,shake,speed-lines,styled-title,transition");
  }, 60000);
});
