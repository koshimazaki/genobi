/**
 * The voice installer's progress as the local server reports it and the
 * studio renders it (`server/voice-install.ts`, `src/voice/VoiceInstallProgress.tsx`).
 * Shapes, the step order and pip's progress lines only: no Node or DOM.
 *
 * The order is the owner's: look for the model on this machine before any
 * download, download only when it is not found, then the runtime.
 */
export const INSTALL_STEPS = [
  "environment",
  "check",
  "download",
  "runtime",
  "verify",
  "activate",
] as const;
export type InstallStep = (typeof INSTALL_STEPS)[number];
export const INSTALL_STEP_LABELS: Record<InstallStep, string> = {
  environment: "Prepare your voice environment",
  check: "Check for the model",
  download: "Download Qwen3-ASR",
  runtime: "Install the voice runtime",
  verify: "Load the model",
  activate: "Activate Voice Mode",
};
export const INSTALL_PHASES = [
  "idle",
  ...INSTALL_STEPS,
  "ready",
  "error",
  "cancelled",
] as const;
export type InstallPhase = (typeof INSTALL_PHASES)[number];
export type StepOutcome = "pending" | "running" | "done" | "skipped" | "failed";

/** Where `pip install` is, from its own output lines. Names only. */
export interface RuntimeProgress {
  action: "collecting" | "downloading" | "installing" | "installed";
  /** The package pip names on its latest line, when it names one. */
  package?: string;
  /** Distinct packages collected so far, or the number being installed. */
  packages: number;
}

export interface InstallState {
  phase: InstallPhase;
  bytes: number;
  /** Each step's outcome; absent before an install starts. */
  steps?: Partial<Record<InstallStep, StepOutcome>>;
  /** The verified model folder the check found (home shown as `~`). */
  found?: string;
  /** Set once every model file was already on disk and only verified. */
  reused?: boolean;
  runtime?: RuntimeProgress;
  error?: string;
}

/** A Python distribution name as pip prints it; anything else is dropped. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const name = (value?: string) =>
  value && NAME.test(value) ? value : undefined;

/** `torch-2.14.0-cp311-…whl` or `numpy-2.3.1.tar.gz` → `torch`, `numpy`. */
const fromArchive = (file: string) =>
  name(/^([A-Za-z0-9][A-Za-z0-9._]*?)-\d/.exec(file)?.[1]);

/**
 * Folds one line of `pip install` output into the runtime's progress:
 * `Collecting torch==2.14.0`, `Downloading torch-2.14.0-….whl (80.1 MB)`,
 * `Installing collected packages: a, b, c` and `Successfully installed …`.
 * Lines it does not know leave the progress as it was. Only package names
 * are kept; URLs, paths and anything else in the line are not.
 */
export function pipProgress(
  current: RuntimeProgress | undefined,
  line: string,
  seen: Set<string> = new Set(),
): RuntimeProgress | undefined {
  const text = line.trim().slice(0, 500);
  const collecting = /^Collecting ([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(text);
  if (collecting) {
    const pkg = name(collecting[1]);
    if (pkg) seen.add(pkg.toLowerCase());
    return { action: "collecting", package: pkg, packages: seen.size };
  }
  const downloading = /^Downloading (\S+)/.exec(text);
  if (downloading) {
    const file = downloading[1].split("/").pop() ?? "";
    return {
      action: "downloading",
      package: fromArchive(file) ?? current?.package,
      packages: Math.max(seen.size, current?.packages ?? 0),
    };
  }
  const installing = /^Installing collected packages: (.+)$/.exec(text);
  if (installing) {
    const names = installing[1].split(",").map((part) => part.trim());
    return {
      action: "installing",
      package: name(names[names.length - 1]),
      packages: names.filter((part) => name(part)).length,
    };
  }
  if (/^Successfully installed /.test(text))
    return {
      action: "installed",
      packages: text
        .replace(/^Successfully installed /, "")
        .split(/\s+/)
        .filter(Boolean).length,
    };
  return current;
}
