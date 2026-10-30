import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { baseEnv } from "./agent-runner";

export const VIEWER_ORIGIN = "http://127.0.0.1:4329";
/** A fixed local read-only service. Never replace or kill an existing listener. */
export class DevelopmentViewer {
  private child?: ChildProcess;
  private starting?: Promise<boolean>;
  constructor(private cwd: string) {}
  private async ready() {
    try {
      const response = await fetch(`${VIEWER_ORIGIN}/api/sessions`, {
        redirect: "error",
        signal: AbortSignal.timeout(800),
      });
      const value = await response.json();
      return (
        response.ok &&
        typeof value.viewerStarted === "number" &&
        Array.isArray(value.profiles) &&
        value.profiles.some((p: { role?: string }) => p.role === "developer")
      );
    } catch {
      return false;
    }
  }
  ensure(studioOrigin: string) {
    return (this.starting ??= this.start(studioOrigin).finally(() => {
      this.starting = undefined;
    }));
  }
  private async start(studioOrigin: string) {
    if (await this.ready()) return true;
    if (!this.child) {
      const child = spawn(
        "python3",
        [
          path.join(this.cwd, "scripts/hermes-supervisor.py"),
          "--studio-origin",
          studioOrigin,
        ],
        { cwd: this.cwd, env: baseEnv(process.env), stdio: "ignore" },
      );
      this.child = child;
      const clear = () => {
        if (this.child === child) this.child = undefined;
      };
      child.once("error", clear);
      child.once("exit", clear);
    }
    for (let i = 0; i < 10; i++) {
      if (await this.ready()) return true;
      if (!this.child) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }
  close() {
    this.child?.kill();
  }
}
