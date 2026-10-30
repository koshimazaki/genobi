import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HOSTED_RUN_LOCATION } from "../shared/comfy/run-location";
// The first project-copy import also loads its bundle validators.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it.each([true, false, undefined])(
  "project copy probes skip only a confirmed hosted site (fixed: %s)",
  async (fixed) => {
    const detect = vi.fn(async (url: string) => {
      expect(url).toBe("/api/settings/run-location");
      return Response.json(
        fixed === undefined ? {} : { ...HOSTED_RUN_LOCATION, fixed },
      );
    });
    vi.stubGlobal("fetch", detect);
    const projects = vi.fn(async () =>
      Response.json({
        projects: [
          {
            id: "studio-house",
            copyId: "studio-house.abcdefghjk",
            access: "owner",
          },
        ],
      }),
    );
    const { copyAvailable } = await import("../src/director/project-copy");
    const { openCopyId } = await import("../src/voice/agent-client");
    expect(await copyAvailable(projects)).toBe(fixed !== true);
    expect(await openCopyId("studio-house", projects)).toBe(
      fixed !== true ? "studio-house.abcdefghjk" : undefined,
    );
    expect(projects.mock.calls).toHaveLength(fixed !== true ? 2 : 0);
    expect(detect).toHaveBeenCalledOnce();
    expect(detect.mock.calls[0][0]).toBe("/api/settings/run-location");
  },
);

it("waits for detection before either project request, including an immediate session start", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    ),
  );
  const projects = vi.fn();
  const { copyAvailable } = await import("../src/director/project-copy");
  const { openCopyId } = await import("../src/voice/agent-client");
  const pending = Promise.all([
    copyAvailable(projects),
    openCopyId("studio-house", projects),
  ]);
  expect(projects).not.toHaveBeenCalled();
  resolve(Response.json(HOSTED_RUN_LOCATION));
  expect(await pending).toEqual([false, undefined]);
  expect(projects).not.toHaveBeenCalled();
});

it("still probes the local server when hosted detection fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  const projects = vi.fn(async () =>
    Response.json({
      projects: [
        {
          id: "studio-house",
          copyId: "studio-house.abcdefghjk",
          access: "owner",
        },
      ],
    }),
  );
  const { copyAvailable } = await import("../src/director/project-copy");
  const { openCopyId } = await import("../src/voice/agent-client");
  // An unconfirmed answer keeps the local studio working; only hosted skips.
  expect(await copyAvailable(projects)).toBe(true);
  expect(await openCopyId("studio-house", projects)).toBe(
    "studio-house.abcdefghjk",
  );
  expect(projects).toHaveBeenCalledTimes(2);
});
