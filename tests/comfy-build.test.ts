// The Comfy build recipe's Python (comfy-build): the comfy-build.yaml generator
// and the model fetcher, with no network. Skipped where no python3 is on PATH:
// the suite never needs Python.
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const hasPython = spawnSync("python3", ["--version"]).status === 0;

it.skipIf(!hasPython).each(["test_models.py", "test_comfy_spec.py"])(
  "comfy-build/tests/%s passes",
  (file) => {
    const run = spawnSync("python3", ["-I", `comfy-build/tests/${file}`], {
      encoding: "utf8",
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      timeout: 60_000,
    });
    expect(run.stderr).toMatch(/\nOK\s*$/);
    expect(run.status).toBe(0);
  },
  60_000,
);
