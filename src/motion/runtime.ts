export interface ConstructionRun {
  cancel(): void;
  finished: Promise<unknown>;
}
export interface ConstructionRuntime {
  construct(
    element: HTMLElement,
    options?: Record<string, unknown>,
  ): ConstructionRun;
  installClock(): FrameClock;
}
export interface FrameClock {
  advance(ms: number): void;
  restore(): void;
}
let runtime: Promise<ConstructionRuntime> | undefined;
export function loadConstruction() {
  runtime ??= (async () => {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "/motion/construction/ui-generation.css";
    await new Promise<void>((resolve, reject) => {
      style.onload = () => resolve();
      style.onerror = () => {
        style.remove();
        reject(new Error("Could not load motion styles."));
      };
      document.head.append(style);
    });
    // A native module entry keeps the vendored renderer byte-preserved and
    // works identically under Vite development and static Pages hosting.
    return new Promise<ConstructionRuntime>((resolve, reject) => {
      const script = document.createElement("script");
      const ready = (event: Event) => {
        cleanup();
        resolve((event as CustomEvent<ConstructionRuntime>).detail);
      };
      const cleanup = () => {
        window.removeEventListener("genobi-construction-ready", ready);
        script.remove();
      };
      window.addEventListener("genobi-construction-ready", ready);
      script.type = "module";
      script.src = `/motion/construction/bridge.js?load=${Date.now()}`;
      script.onerror = () => {
        cleanup();
        reject(new Error("Could not load construction renderer."));
      };
      document.head.append(script);
    });
  })().catch((error) => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}
export async function loadFrameClock(): Promise<FrameClock> {
  return (await loadConstruction()).installClock();
}
