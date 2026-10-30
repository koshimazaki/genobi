import { afterEach, describe, expect, it, vi } from "vitest";
import { ComfySdkWorkflows, withBaseUrl } from "../server/comfy-sdk";
import {
  deploymentJobId,
  workflowHandle,
  workflowJobId,
} from "../shared/comfy/workflow";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { NotYetWorkflow } from "../shared/comfy/workflow";

// A Comfy Developer Platform deployment through the real SDK, each client on
// its own base URL; the fetch is a fake, so nothing leaves the test.
const base = "https://openjutsu.run.comfy.app";
const handle = `${base}/api/v2/jobs/job-1`;
const KEY = "comfyui-test-key";

afterEach(() => {
  delete process.env.COMFY_BASE_URL;
});

describe("a Comfy API deployment", () => {
  it("sends the real SDK's requests to the deployment's origin only", async () => {
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return new Response("{}", { status: 503 });
    });
    const client = new ComfySdkWorkflows({
      destination: { kind: "deployment", url: base },
      fetcher: fetcher as unknown as typeof fetch,
    });
    await expect(client.poll(handle, KEY)).rejects.toThrow();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).origin).toBe(base);
    // The base was set for that construction alone.
    expect(process.env.COMFY_BASE_URL).toBeUndefined();
    expect(client.owns(handle)).toBe(true);
    expect(client.owns("https://cloud.comfy.org/api/v2/jobs/job-1")).toBe(
      false,
    );
  });

  it("keeps the Comfy key requirement and the operator's COMFY_BASE_URL refusal", async () => {
    const connect = vi.fn();
    const client = new ComfySdkWorkflows({
      destination: { kind: "deployment", url: base },
      connect,
      env: {},
    });
    await expect(client.poll(handle, "bfl-key")).rejects.toMatchObject({
      code: "workflow_unsent",
    });
    const set = new ComfySdkWorkflows({
      destination: { kind: "deployment", url: base },
      connect,
      env: { COMFY_BASE_URL: "https://elsewhere.example.com" },
    });
    await expect(set.poll(handle, KEY)).rejects.toThrow(/COMFY_BASE_URL/);
    // A Cloud handle never moves the deployment client's key to Cloud.
    await expect(
      client.poll("https://cloud.comfy.org/api/v2/jobs/job-1", KEY),
    ).rejects.toThrow(/delivery location/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("scopes the SDK's base URL to one construction and restores it", () => {
    const env: Record<string, string | undefined> = {};
    expect(withBaseUrl(env, base, () => env.COMFY_BASE_URL)).toBe(base);
    expect("COMFY_BASE_URL" in env).toBe(false);
    const kept = { COMFY_BASE_URL: "x" };
    expect(() =>
      withBaseUrl(kept, base, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(kept.COMFY_BASE_URL).toBe("x");
    expect(withBaseUrl(env, undefined, () => env.COMFY_BASE_URL)).toBe(
      undefined,
    );
  });

  it("reads handles on its own base and leaves Cloud's unchanged", () => {
    expect(workflowHandle("job-1", base)).toBe(handle);
    expect(workflowJobId(handle, base)).toBe("job-1");
    expect(deploymentJobId(handle, `${base}/prefix`)).toBeUndefined();
    expect(deploymentJobId(handle, "https://other.run.comfy.app")).toBe(
      undefined,
    );
    expect(() => workflowJobId(handle)).toThrow();
    expect(workflowHandle("job-1")).toBe(
      "https://cloud.comfy.org/api/v2/jobs/job-1",
    );
    expect(workflowJobId("https://cloud.comfy.org/api/job/job-1/status")).toBe(
      "job-1",
    );
    expect(deploymentJobId(`${base}/api/job/job-1/status`, base)).toBe(
      undefined,
    );
  });

  it("routes a deployment run and poll to the deployment client", async () => {
    const deployment = {
      run: vi.fn(async () => handle),
      poll: vi.fn(async () => ({ id: "job-1", status: "Pending" })),
      download: vi.fn(),
      owns: (value: string) => value.startsWith(`${base}/`),
    };
    const cloud = new NotYetWorkflow();
    const destinations = new WorkflowDestinations(cloud, { deployment });
    expect(
      await destinations.run({} as never, {}, KEY, {
        idempotencyKey: "job",
        location: "deployment",
      }),
    ).toBe(handle);
    expect((await destinations.poll(handle, KEY)).status).toBe("Pending");
    const none = new WorkflowDestinations(cloud);
    await expect(
      none.run({} as never, {}, KEY, {
        idempotencyKey: "job",
        location: "deployment",
      }),
    ).rejects.toMatchObject({ code: "workflow_not_configured" });
    await expect(
      none.run({} as never, {}, KEY, {
        idempotencyKey: "job",
        // A location an earlier build recorded (Runware): no client.
        location: "runware" as never,
      }),
    ).rejects.toMatchObject({
      code: "workflow_not_configured",
      message: expect.stringContaining("no longer supports"),
    });
  });
});
