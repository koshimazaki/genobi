import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const hasPython = spawnSync("python3", ["--version"]).status === 0;

it.skipIf(!hasPython).each([-1, 1, 0])(
  "refuses an invalid workflow output socket (%s)",
  (index) => {
    const checked = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util
spec = importlib.util.spec_from_file_location("verify", "docker/akuspace/scripts/verify.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
graph = {
    "1": {"class_type": "Source", "inputs": {}},
    "2": {"class_type": "Sink", "inputs": {"value": ["1", ${index}]}},
}
info = {
    "Source": {"output": ${index === 0 ? "[]" : '["IMAGE"]'}},
    "Sink": {"input": {"required": {"value": ["IMAGE"]}}},
}
report = verify.Report(False)
verify.check_graph("fixture", graph, info, report)
assert len(report.errors) == 1, report.errors
assert "links to output" in report.errors[0], report.errors
`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
    expect(checked.stderr).toBe("");
    expect(checked.status).toBe(0);
  },
);

it.skipIf(!hasPython)(
  "refuses empty and UI-format graphs instead of reporting success",
  () => {
    const checked = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util
spec = importlib.util.spec_from_file_location("verify", "docker/akuspace/scripts/verify.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
for graph in ({}, {"nodes": [], "version": 0.4}, []):
    report = verify.Report(False)
    verify.check_graph("fixture", graph, {}, report)
    assert report.errors, graph
`,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      },
    );
    expect(checked.stderr).toBe("");
    expect(checked.status).toBe(0);
  },
);
