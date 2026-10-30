// "Install the voice runtime" reports pip's own progress (the package and a
// counter), and the step list says what happened: the check before the
// download, the download skipped when the model was found locally.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { pipProgress, type RuntimeProgress } from "../shared/voice-install";
import { installProcess } from "../server/voice-install-process";
import {
  runtimeText,
  stepOutcome,
  VoiceInstallProgress,
} from "../src/voice/VoiceInstallProgress";
import type { VoiceInstallState } from "../src/voice/setup-api";
import {
  cleanInstallRoots,
  installFixture,
  settled,
} from "./voice-install-harness";

afterEach(cleanInstallRoots);

/** Lines as pip 24 prints them for `install -r requirements.txt`. */
const PIP = [
  "Looking in indexes: https://pypi.org/simple",
  "Collecting qwen-asr==0.0.6 (from -r /x/requirements.txt (line 5))",
  "  Downloading qwen_asr-0.0.6-py3-none-any.whl.metadata (2.1 kB)",
  "Collecting torch==2.14.0 (from -r /x/requirements.txt (line 6))",
  "  Downloading torch-2.14.0-cp311-none-macosx_11_0_arm64.whl.metadata (29 kB)",
  "Collecting numpy (from -r /x/requirements.txt (line 9))",
  "Collecting torch==2.14.0 (from qwen-asr==0.0.6)",
  "Downloading https://files.pythonhosted.org/packages/ab/cd/torch-2.14.0-cp311-none-macosx_11_0_arm64.whl (74.6 MB)",
  "Installing collected packages: numpy, torch, qwen-asr",
  "Successfully installed numpy-2.3.1 qwen-asr-0.0.6 torch-2.14.0",
];

describe("pip's progress lines", () => {
  it("names the current package and counts distinct packages", () => {
    const seen = new Set<string>();
    const steps: (RuntimeProgress | undefined)[] = [];
    let state: RuntimeProgress | undefined;
    for (const line of PIP) {
      state = pipProgress(state, line, seen);
      steps.push(state);
    }
    expect(steps[0]).toBeUndefined();
    expect(steps[1]).toEqual({
      action: "collecting",
      package: "qwen-asr",
      packages: 1,
    });
    expect(steps[2]).toMatchObject({
      action: "downloading",
      package: "qwen_asr",
    });
    // A package collected twice counts once.
    expect(steps[6]).toEqual({
      action: "collecting",
      package: "torch",
      packages: 3,
    });
    expect(steps[7]).toEqual({
      action: "downloading",
      package: "torch",
      packages: 3,
    });
    expect(steps[8]).toEqual({
      action: "installing",
      package: "qwen-asr",
      packages: 3,
    });
    expect(steps[9]).toEqual({ action: "installed", packages: 3 });
    expect(JSON.stringify(steps)).not.toMatch(/https?:|requirements|\/x\//);
  });

  it("ignores what it does not know and keeps names only", () => {
    expect(pipProgress(undefined, "WARNING: something")).toBeUndefined();
    const kept = { action: "collecting", packages: 2 } as const;
    expect(pipProgress(kept, "  Using cached foo-1.0.whl")).toBe(kept);
    expect(
      pipProgress(undefined, `Collecting ${"x".repeat(300)}`)?.package,
    ).toBeUndefined();
  });

  it("reads as words", () => {
    expect(runtimeText()).toMatch(/several hundred megabytes/);
    expect(
      runtimeText({ action: "collecting", package: "torch", packages: 12 }),
    ).toBe("Collecting torch · 12 packages so far");
    expect(runtimeText({ action: "installing", packages: 38 })).toBe(
      "Installing 38 packages",
    );
  });
});

describe("the runtime step", () => {
  it("passes each stdout line of the child to the callback, and nothing else", async () => {
    const lines: string[] = [];
    await installProcess(
      process.execPath,
      [
        "-e",
        "process.stdout.write('Collecting a\\r\\nCollecting b\\n');process.stderr.write('secret');process.stdout.write('tail')",
      ],
      new AbortController().signal,
      10_000,
      (line) => lines.push(line),
    );
    expect(lines).toEqual(["Collecting a", "Collecting b", "tail"]);
  });

  it("folds pip's lines into the install's progress", async () => {
    const { root, installer, deps } = await installFixture();
    let during: unknown;
    deps.run.mockImplementation(
      async (
        _command: string,
        args: string[],
        _signal: AbortSignal,
        _timeout?: number,
        onLine?: (line: string) => void,
      ) => {
        if (!args.includes("pip")) return;
        for (const line of PIP.slice(0, 5)) onLine?.(line);
        during = installer.status("studio");
      },
    );
    const { token } = await installer.describe("studio");
    await installer.start("studio", { token, confirmed: true, folder: root });
    await settled(installer);
    expect(during).toMatchObject({
      phase: "runtime",
      steps: { runtime: "running", check: "done", download: "done" },
      runtime: { action: "downloading", package: "torch", packages: 2 },
    });
    const pip = deps.run.mock.calls.find(([, args]) => args.includes("pip"));
    expect(pip?.[1]).toEqual(expect.arrayContaining(["--progress-bar", "off"]));
  });
});

const progress = (state: Partial<VoiceInstallState>) =>
  renderToStaticMarkup(
    <VoiceInstallProgress
      state={{ phase: "runtime", bytes: 0, busy: true, ...state }}
      total={1_880_560_703}
      pending={false}
      onCancel={() => {}}
    />,
  );

describe("the step list", () => {
  it("found locally: says where, and the download is skipped, not pending", () => {
    const html = progress({
      found: "~/Documents/asr/Qwen3-ASR-0.6B",
      reused: true,
      steps: {
        environment: "done",
        check: "done",
        download: "skipped",
        runtime: "running",
      },
      runtime: { action: "collecting", package: "torch", packages: 4 },
    });
    expect(html).toContain(
      "Model found locally · ~/Documents/asr/Qwen3-ASR-0.6B",
    );
    expect(html).toMatch(
      /<li data-state="skipped"><span aria-hidden="true">✓<\/span>Download Qwen3-ASR · skipped, model found locally<\/li>/,
    );
    expect(html).toContain("Collecting torch · 4 packages so far");
    expect(html).not.toContain('aria-label="Model download"');
    expect(html).toContain("You can close this and keep working.");
    // The order the owner set: check before download before runtime.
    const order = [
      "Prepare your voice environment",
      "Check for the model",
      "Download Qwen3-ASR",
      "Install the voice runtime",
      "Load the model",
      "Activate Voice Mode",
    ].map((label) => html.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("not found: says so, and the download runs with its progress", () => {
    const html = progress({
      phase: "download",
      bytes: 940_000_000,
      steps: { environment: "done", check: "done", download: "running" },
    });
    expect(html).toContain("Not found on this machine");
    expect(html).toContain('<li data-state="running">');
    expect(html).toContain("0.94 GB / 1.88 GB");
    expect(html).toContain('aria-label="Model download"');
    expect(html).toContain("several hundred megabytes");
    expect(html).not.toContain("skipped");
  });

  it("a failed step shows where it stopped; an older server's phase still reads", () => {
    const html = progress({
      phase: "error",
      busy: false,
      steps: { environment: "done", check: "done", download: "failed" },
    });
    expect(html).toContain(
      '<li data-state="failed"><span aria-hidden="true">!',
    );
    expect(
      stepOutcome({ phase: "verify", bytes: 0, busy: true }, "runtime"),
    ).toBe("done");
    expect(
      stepOutcome({ phase: "verify", bytes: 0, busy: true }, "verify"),
    ).toBe("running");
  });
});
