import { spawn } from "node:child_process";
/**
 * Fixed argument arrays only; cancellation kills the child. Output stays
 * private: without `onLine` it is discarded, with it each stdout line goes to
 * that callback (pip's progress) and nowhere else, never to a log.
 */
export function installProcess(
  command: string,
  args: string[],
  signal: AbortSignal,
  timeout = 30 * 60_000,
  onLine?: (line: string) => void,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Installation cancelled."));
    const child = spawn(command, args, {
      stdio: ["ignore", onLine ? "pipe" : "ignore", "ignore"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    if (onLine && child.stdout) {
      let rest = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (part: string) => {
        const lines = (rest + part).split(/\r?\n|\r/);
        // A line longer than this is not one pip prints for progress.
        rest = (lines.pop() ?? "").slice(-4096);
        for (const line of lines) onLine(line);
      });
      child.stdout.on("end", () => rest && onLine(rest));
    }
    const stop = () => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        /* Already stopped. */
      }
    };
    const timer = setTimeout(stop, timeout);
    signal.addEventListener("abort", stop, { once: true });
    child.once("error", () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reject(new Error("The voice setup could not start this step."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(new Error("Installation cancelled."));
      else if (code !== 0)
        reject(
          new Error(
            "This setup step failed. Check your connection and available disk space, then try again.",
          ),
        );
      else resolve();
    });
  });
}
