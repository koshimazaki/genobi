// The project copy routes under test: the local server, a second session on
// demand, the owner's file upload and push, and a reader for the event stream.
import { createHash } from "node:crypto";
import { expect } from "vitest";
import type { Project } from "../shared/director/types";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { AppOptions } from "../server/app";

export type Reply = {
  status: number;
  code?: string;
  revision?: number;
  [key: string]: unknown;
};

export async function studio(
  workflows?: WorkflowClient,
  extra?: Partial<AppOptions>,
) {
  const harness = await setup(
    undefined,
    workflows,
    undefined,
    undefined,
    undefined,
    undefined,
    extra,
  );
  const { base: url } = harness;
  const fresh = async () =>
    (await fetch(`${url}/api/health`)).headers.get("set-cookie")!.split(";")[0];
  const send = async (
    cookie: string,
    route: string,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await fetch(`${url}/api/projects${route}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      ...((await response.json()) as object),
      status: response.status,
    } as Reply;
  };
  const bundle = base();
  const project = bundle.project as Project;
  const upload = async (cookie: string) => {
    for (const bytes of new Set(bundle.files.values())) {
      const sha = createHash("sha256").update(bytes).digest("hex");
      const response = await fetch(
        `${url}/api/projects/${project.id}/files/${sha}`,
        {
          method: "PUT",
          headers: { cookie, "Content-Type": "application/octet-stream" },
          body: bytes,
        },
      );
      expect([200, 201]).toContain(response.status);
    }
  };
  const push = (
    cookie: string,
    baseRevision: number | null,
    revision: number,
    changes: Partial<Project> = {},
  ) =>
    send(cookie, `/${project.id}`, "PUT", {
      baseRevision,
      project: { ...project, ...changes, revision },
      brief: null,
    });
  return { ...harness, fresh, send, upload, push, project };
}

/** Open a project's event stream and read one event at a time. */
export async function eventStream(url: string, cookie: string) {
  const abort = new AbortController();
  const response = await fetch(url, {
    headers: { cookie },
    signal: abort.signal,
  });
  const reader = response.body!.getReader();
  let buffer = "";
  /** The next event, or undefined once the server ended the stream. */
  const next = async () => {
    while (!buffer.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) return undefined;
      buffer += new TextDecoder().decode(value);
    }
    const [frame] = buffer.split("\n\n", 1);
    buffer = buffer.slice(frame.length + 2);
    return JSON.parse(
      frame
        .split("\n")
        .find((l) => l.startsWith("data: "))!
        .slice(6),
    ) as Record<string, unknown>;
  };
  return { response, next, abort: () => abort.abort() };
}
