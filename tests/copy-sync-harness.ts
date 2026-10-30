// Copy-rule tests against the real local server: a fetcher whose answers can
// be held back or failed, an agent sending Director commands, and windows.
import { CopySync } from "../src/director/project-copy-sync";
import { createStudioStore } from "../src/studio/store";
import { setup } from "./server-harness";

type Held = {
  match: (method: string, path: string) => boolean;
  gate: Promise<void>;
  /** Answer with this failure instead of the server's answer. */
  fail?: number;
};

export async function studio() {
  const harness = await setup();
  const held: Held[] = [];
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const response = await fetch(`${harness.base}${input}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: harness.cookie,
      },
    });
    const rule = held.find((h) => h.match(method, input));
    if (rule) {
      held.splice(held.indexOf(rule), 1);
      await rule.gate;
      if (rule.fail)
        return Response.json(
          { error: "File not found." },
          { status: rule.fail },
        );
    }
    return response;
  }) as typeof fetch;
  /**
   * Hold the answer to the next matching request until released; with
   * `fail`, answer it with that status instead.
   */
  const hold = (method: string, pattern: RegExp, fail?: number) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    held.push({ match: (m, p) => m === method && pattern.test(p), gate, fail });
    return () => release();
  };
  const agent = (id: string, baseRevision: number, command: object) =>
    fetch(`${harness.base}/api/projects/${id}/commands`, {
      method: "POST",
      headers: { cookie: harness.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevision, command }),
    }).then((r) => r.json() as Promise<{ revision: number }>);
  return { ...harness, fetcher, hold, agent };
}
export const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** One studio window: its own store and copy rules over the shared server. */
export function tab(fetcher: typeof fetch) {
  const store = createStudioStore();
  const notices: string[] = [];
  const sync = new CopySync({
    store,
    fetcher,
    notice: (text) => notices.push(text),
    live: () => {},
  });
  const rename = (name: string) => {
    const now = store.getState().director.bundle!;
    store
      .getState()
      .actions.commit({ ...now, project: { ...now.project, name } });
  };
  const name = () => store.getState().director.bundle!.project.name;
  return { store, sync, notices, rename, name };
}
