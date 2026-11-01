import { Comfy } from "@comfyorg/sdk";
import { ComfyLow } from "@comfyorg/sdk/low";
import { AppError } from "./errors";
import { isComfyKey, mediaUrl, type Fetcher } from "../shared/provider";
import type { ProviderResult } from "../shared/provider";
import { type ApiGraph } from "../shared/comfy/slots";
import { selectWorkflowOutputs } from "../shared/comfy/outputs";
import { workflowAssetGraph, type SdkAssets } from "./comfy-assets";
import { runFailure, type RunFailure } from "./comfy-run-failure";
import { readComfyCloudInfo } from "./comfy-cloud-check";
import { comboOptions, inspectWorkflow } from "../shared/comfy/readiness";
import {
  CLOUD_BASE,
  DEFAULT_DESTINATION,
  notConfigured,
  type WorkflowDestination,
} from "../shared/comfy/destination";
import {
  deploymentJobId,
  pollError,
  submitError,
  unsent,
  workflowHandle,
  workflowJobId,
  workflowState,
  VIDEO_OUTPUT,
  type WorkflowClient,
  type WorkflowOutput,
  type WorkflowRunOptions,
  type WorkflowTemplate,
} from "../shared/comfy/workflow";

/**
 * The `workflow` route on Comfy Cloud (API v2) through the official SDK,
 * `@comfyorg/sdk` (MIT). Shared by both adapters: the SDK imports `node:`
 * modules, which the Worker resolves under `nodejs_compat`, so it stays out of
 * `shared/`, which must compile without them.
 *
 * Only the slice of the SDK this file uses is typed here, so tests can hand in
 * a fake client and no test reaches the network.
 */
export interface SdkOutput {
  readonly nodeId: string;
  readonly type: string;
  getDownloadUrl(): Promise<{ url: string }>;
}
export interface SdkJob {
  readonly id: string;
  readonly status: string;
  readonly progress: { value: number } | null;
  readonly outputs: SdkOutput[];
  /** The failure detail of a `failed` job (`JobError`), else null. */
  readonly error?: RunFailure | null;
}
export interface SdkClient {
  assets?: SdkAssets;
  workflows: { fromJson(graph: ApiGraph): unknown };
  submit(
    workflow: never,
    options: { idempotencyKey: string; signal?: AbortSignal },
  ): Promise<{ id: string }>;
  jobs: { get(id: string): Promise<SdkJob> };
}
export type Connect = (
  apiKey: string,
  fetcher: Fetcher,
  /** The deployment's base URL; absent, Comfy Cloud. */
  baseUrl?: string,
) => SdkClient;

/**
 * The SDK reads its base URL only from `COMFY_BASE_URL`, once, while a
 * client is constructed ("read per construction ... so a process can point
 * successive clients at different deployments", `@comfyorg/sdk` 0.5.0
 * `client.ts`). A deployment client sets it for that one synchronous
 * construction and puts it back at once, so no other client and no later
 * request sees it; the fetch lock below holds every request to that origin.
 */
export function withBaseUrl<T>(
  env: Record<string, string | undefined>,
  baseUrl: string | undefined,
  build: () => T,
): T {
  if (baseUrl === undefined) return build();
  const had = Object.prototype.hasOwnProperty.call(env, "COMFY_BASE_URL");
  const before = env.COMFY_BASE_URL;
  env.COMFY_BASE_URL = baseUrl;
  try {
    return build();
  } finally {
    if (had) env.COMFY_BASE_URL = before;
    else delete env.COMFY_BASE_URL;
  }
}

const processEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

const connectSdk: Connect = (apiKey, fetcher, baseUrl) =>
  withBaseUrl(
    processEnv(),
    baseUrl,
    () =>
      new Comfy({
        apiKey,
        fetch: fetcher,
        clientInfo: "genobi",
      }) satisfies SdkClient,
  );

/**
 * The fetch the SDK is given: it may reach the destination's own origin and
 * nothing else, and never follows a redirect, so the key cannot travel to a
 * host this file did not choose. A refused request was never sent.
 */
export function destinationFetch(origin: string, fetcher: Fetcher): Fetcher {
  return async (input, init) => {
    const target = input instanceof Request ? input.url : String(input);
    if (new URL(target).origin !== origin)
      throw unsent("The workflow client tried to reach another host.");
    return fetcher(input, { ...init, redirect: "manual" });
  };
}

export interface ComfySdkOptions {
  destination?: WorkflowDestination;
  fetcher?: Fetcher;
  connect?: Connect;
  /** The process environment the SDK reads; `process.env` where there is one. */
  env?: Record<string, string | undefined>;
  portableUploads?: boolean;
}

export class ComfySdkWorkflows implements WorkflowClient {
  private readonly destination: WorkflowDestination;
  private readonly fetcher: Fetcher;
  private readonly connect: Connect;
  private readonly portableUploads: boolean;
  private readonly env: Record<string, string | undefined>;
  constructor(options: ComfySdkOptions = {}) {
    this.portableUploads = options.portableUploads ?? false;
    this.destination = options.destination ?? DEFAULT_DESTINATION;
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.connect = options.connect ?? connectSdk;
    this.env = options.env ?? processEnv();
  }

  /** Comfy Cloud, or the deployment's own base URL. */
  private get base() {
    return this.destination.kind === "deployment"
      ? this.destination.url
      : CLOUD_BASE;
  }

  /** Whether a handle is a job on this client's deployment. */
  owns(value: string) {
    return (
      this.destination.kind === "deployment" &&
      deploymentJobId(value, this.base) !== undefined
    );
  }

  /**
   * The SDK client for one visitor key, or a refusal before anything is sent.
   * The SDK falls back to COMFY_API_KEY for a blank key and follows
   * COMFY_BASE_URL wherever it points, so a key must be a Comfy key and the
   * operator's environment must not move the client: Comfy Cloud, or this
   * client's own deployment, set per construction (`withBaseUrl`).
   */
  private client(key: string) {
    if (this.destination.kind === "local")
      throw notConfigured(this.destination);
    if (!isComfyKey(key.trim()))
      throw unsent("Workflows run with a Comfy key.");
    if (this.env.COMFY_BASE_URL?.trim())
      throw unsent(
        "COMFY_BASE_URL is set on this server and would send the run elsewhere; unset it, and name a deployment in GENOBI_DEPLOYMENT_URL instead.",
      );
    const origin = new URL(this.base).origin;
    return this.destination.kind === "deployment"
      ? this.connect(key, destinationFetch(origin, this.fetcher), this.base)
      : this.connect(key, destinationFetch(origin, this.fetcher));
  }

  /** Upload only: no generation is submitted or retried. */
  async upload(
    bytes: Uint8Array,
    contentType: string,
    key?: string,
  ): Promise<object> {
    if (!key) throw unsent("Connect a Comfy key before uploading.");
    const assets = this.client(key).assets;
    if (!assets) throw unsent("This client cannot upload inputs.");
    try {
      return await assets
        .fromBytes(bytes, {
          filename: `genobi-${crypto.randomUUID()}.${({ "video/webm": "webm", "audio/wav": "wav", "audio/flac": "flac", "audio/mpeg": "mp3", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[contentType] ?? "bin"}`,
          contentType,
        })
        .asReference(AbortSignal.timeout(90_000));
    } catch {
      throw unsent("The deployment input upload failed.");
    }
  }

  /**
   * FLUX Klein's official filename and the older Cloud alias differ. Resolve
   * against this account's actual UNETLoader combo before a paid submission,
   * never by retrying after a failed job. Other workflows keep their templates.
   */
  private async kleinCloudValues(
    template: WorkflowTemplate,
    key: string,
  ): Promise<Record<string, unknown>> {
    let info: Awaited<ReturnType<typeof readComfyCloudInfo>>;
    try {
      info = await readComfyCloudInfo(key, this.fetcher);
    } catch {
      throw unsent(
        "Could not check Comfy Cloud's FLUX 3 Klein models. Verify Cloud API access in Settings, or choose BFL API.",
      );
    }
    // Read the actual model slot: the supplied Base edit graph uses node 59,
    // while Base T2I and Distilled use 18:1. Never substitute Distilled weights
    // for Base: their sampler parameters are different.
    const slotPath = template.slots.unet_name?.path;
    const separator = slotPath?.indexOf(".") ?? -1;
    const nodeId = separator > 0 ? slotPath!.slice(0, separator) : "";
    const inputName = separator > 0 ? slotPath!.slice(separator + 1) : "";
    const preferred = template.graph[nodeId]?.inputs[inputName];
    const options = comboOptions(info, "UNETLoader", inputName);
    const candidates = [
      preferred,
      ...(template.id === "flux-3-klein-t2i"
        ? ["flux3_image_klein_sd_int8_convrot.safetensors"]
        : []),
    ];
    const selected = candidates.find(
      (name): name is string =>
        typeof name === "string" && Boolean(options?.includes(name)),
    );
    if (!selected)
      throw unsent(
        "Comfy Cloud does not list the FLUX 3 Klein diffusion model for this workflow in UNETLoader. Check the Cloud workflow inventory or choose BFL API.",
      );
    const graph = structuredClone(template.graph);
    graph[nodeId].inputs[inputName] = selected;
    const check = inspectWorkflow(template, graph, info);
    if (check.missingNodes.length || check.missingModels.length)
      throw unsent(
        `This Comfy Cloud account lacks the Klein workflow's ${[
          ...check.missingNodes,
          ...check.missingModels,
        ].join(", ")}. Check the Cloud workflow inventory or choose BFL API.`,
      );
    return { unet_name: selected };
  }

  async run(
    template: WorkflowTemplate,
    values: Record<string, unknown>,
    key: string,
    { idempotencyKey, files = {} }: WorkflowRunOptions,
  ): Promise<string> {
    const client = this.client(key);
    // Resolve the loader before uploads, reservation's single provider POST,
    // or any GPU spend. A missing model is a known, unsent refusal.
    const resolvedValues =
      this.destination.kind === "cloud" &&
      template.id.startsWith("flux-3-klein-")
        ? { ...values, ...(await this.kleinCloudValues(template, key)) }
        : values;
    // Filled first: a graph that does not match its slots is refused unsent.
    // Cloud keeps the catalogue model names written in the graph; a local
    // ComfyUI's own files are filled by `server/comfy-local.ts`.
    const graph = await workflowAssetGraph(
      template,
      resolvedValues,
      files,
      this.portableUploads
        ? {
            fromBytes: (bytes, options) => ({
              asReference: async (signal) => {
                const low = new ComfyLow(this.base, key, {
                  fetch: destinationFetch(this.base, this.fetcher),
                  clientInfo: "genobi",
                });
                const asset = await low.postAssets(
                  new Blob([new Uint8Array(bytes)]),
                  options.contentType,
                  options.filename,
                  { signal },
                );
                if (
                  typeof asset.id !== "string" ||
                  !/^[a-zA-Z0-9-]{1,128}$/.test(asset.id)
                )
                  throw new Error("Invalid asset receipt");
                return { __type: "core/ASSET", info: { id: asset.id } };
              },
            }),
          }
        : client.assets,
    );
    let job: { id: string };
    try {
      // One call. The SDK re-sends only a 429 that says the queue is full,
      // which the server did not accept; nothing uncertain is retried.
      job = await client.submit(client.workflows.fromJson(graph) as never, {
        idempotencyKey,
        signal: AbortSignal.timeout(90_000),
      });
    } catch (error) {
      throw submitError(error);
    }
    return workflowHandle(job?.id, this.base);
  }

  async poll(
    handle: string,
    key: string,
    expected: WorkflowOutput = VIDEO_OUTPUT,
  ): Promise<ProviderResult> {
    const id = workflowJobId(handle, this.base);
    const client = this.client(key);
    let job: SdkJob;
    try {
      job = await client.jobs.get(id);
    } catch (error) {
      const failure = pollError(error);
      if (failure === "gone") return { id, status: "Task not found" };
      throw failure;
    }
    const status = workflowState(job.status);
    const value = job.progress?.value;
    const progress =
      typeof value === "number" && value >= 0 && value <= 1 ? value : undefined;
    if (status === "Error") {
      const error = runFailure(
        job.error,
        this.destination.kind === "deployment"
          ? "Comfy deployment"
          : "Comfy Cloud",
      );
      return error ? { id, status, error } : { id, status };
    }
    if (status !== "Ready")
      return progress === undefined ? { id, status } : { id, status, progress };
    const selected = selectWorkflowOutputs(job.outputs, expected);
    if (!selected.ok) return { id, status: "Error", error: selected.error };
    let links: { url: string }[];
    try {
      links = await Promise.all([
        selected.primary.getDownloadUrl(),
        ...selected.companions.map(({ output }) => output.getDownloadUrl()),
      ]);
    } catch (error) {
      const failure = pollError(error);
      if (failure === "gone") return { id, status: "Task not found" };
      throw failure;
    }
    try {
      const companions = selected.companions.map(
        ({ nodeId, label }, index) => ({
          nodeId,
          label,
          url: mediaUrl(links[index + 1].url).href,
        }),
      );
      return {
        id,
        status: "Ready",
        result: { sample: mediaUrl(links[0].url).href },
        ...(expected.companions?.length ? { companions } : {}),
      };
    } catch {
      throw new AppError(
        502,
        "The provider returned an unsupported delivery location.",
      );
    }
  }

  async download(url: string): Promise<Response> {
    let target: URL;
    try {
      target = mediaUrl(url);
    } catch {
      throw new AppError(
        502,
        "The provider returned an unsupported delivery location.",
      );
    }
    const response = await this.fetcher(target, {
      signal: AbortSignal.timeout(60_000),
      redirect: "manual",
    });
    if (response.status === 403 || response.status === 404)
      throw new AppError(
        410,
        "The provider’s result link expired before it could be saved.",
        "delivery_expired",
      );
    if (!response.ok || !response.body)
      throw new AppError(502, "The download failed. We will try again.");
    return response;
  }
}
