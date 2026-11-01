import { AppError } from "./errors";
import type { Fetcher, ProviderResult } from "../shared/provider";
import { fillSlots, type ApiGraph } from "../shared/comfy/slots";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import type { LocalModels } from "../shared/comfy/local-models";
import type { LocalComfyStatus } from "../shared/comfy/run-location";
import { inspectWorkflow, type ObjectInfo } from "../shared/comfy/readiness";
import { selectWorkflowOutputs } from "../shared/comfy/outputs";
import {
  FILE_NAME,
  safeSubfolder,
  localOutputFiles,
  localOutputUrl,
} from "./comfy-local-files";
import {
  localJobId,
  unsent,
  VIDEO_OUTPUT,
  type WorkflowClient,
  type WorkflowFile,
  type WorkflowOutput,
  type WorkflowRunOptions,
  type WorkflowTemplate,
} from "../shared/comfy/workflow";

/**
 * The `workflow` route on a ComfyUI running on this machine, over ComfyUI's
 * own HTTP API (`server.py` in comfyanonymous/ComfyUI): `GET /object_info` and
 * `/system_stats` to find it and its node types, `POST /upload/image` for an
 * input file, `POST /prompt` once, then `GET /queue`, `/history/{id}` and
 * `/view` for the result. The SDK client cannot do this: it reads a deployment
 * URL only from the process-wide `COMFY_BASE_URL`.
 *
 * No key ever goes to the local ComfyUI. Every request has a fixed timeout and
 * never follows a redirect; a submission whose answer is lost is "could not be
 * confirmed" and is never sent again. Refusals name node classes and slots,
 * never ComfyUI's own text, which can carry local paths and file names.
 */
export const DEFAULT_LOCAL_URL = "http://127.0.0.1:8188";
const TIMEOUT = {
  detect: 2_000,
  read: 10_000,
  info: 30_000,
  upload: 60_000,
  submit: 30_000,
  view: 120_000,
};
const PROMPT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLASS = /^[A-Za-z0-9_]{1,64}$/;
const EXTENSION: Record<WorkflowFile["contentType"], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

const noAnswer = () =>
  unsent(
    "No local ComfyUI answered at the run location's address. Start ComfyUI, or switch the run location to Comfy Cloud.",
  );
const unconfirmedLocal = () =>
  new AppError(
    502,
    "The local ComfyUI did not confirm the run. Check its queue before trying again.",
    "submission_unknown",
  );
const unreachable = () =>
  new AppError(
    502,
    "The local ComfyUI did not answer. This job will be checked again.",
  );
const badLocation = () =>
  new AppError(502, "The provider returned an unsupported delivery location.");
/** Only a refused connection proves a request never reached ComfyUI. */
const refusedConnection = (error: unknown) =>
  (error as { cause?: { code?: unknown } })?.cause?.code === "ECONNREFUSED";

/** A refusal ComfyUI stated: node classes only, never its messages. */
function rejectedLocally(body: unknown): AppError {
  const nodes = (body as { node_errors?: unknown } | null)?.node_errors;
  const classes =
    nodes && typeof nodes === "object"
      ? Object.values(nodes).flatMap((node) => {
          const type = (node as { class_type?: unknown } | null)?.class_type;
          return typeof type === "string" && CLASS.test(type) ? [type] : [];
        })
      : [];
  return new AppError(
    502,
    classes.length
      ? `The local ComfyUI refused this workflow at ${[...new Set(classes)].join(", ")}.`
      : "The local ComfyUI refused this workflow.",
    "workflow_rejected",
  );
}

export interface LocalComfyOptions {
  /** http on 127.0.0.1 or localhost only; checked again here. */
  url?: string;
  /** Model files by template and slot, already read by `parseLocalModels`. */
  models?: LocalModels;
  fetcher?: Fetcher;
}

export class LocalComfyWorkflows implements WorkflowClient {
  readonly base: string;
  private readonly models: LocalModels;
  private readonly fetcher: Fetcher;
  constructor(options: LocalComfyOptions = {}) {
    const destination = parseWorkflowDestination(
      "local",
      options.url ?? DEFAULT_LOCAL_URL,
    );
    if (destination.kind !== "local") throw badLocation();
    this.base = destination.url;
    this.models = options.models ?? {};
    this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
  }

  private call(path: string, timeout: number, init: RequestInit = {}) {
    return this.fetcher(`${this.base}${path}`, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
  }

  /** A read whose failure is retryable: a poll, never a submission. */
  private async read<T>(path: string, timeout = TIMEOUT.read): Promise<T> {
    let response: Response;
    try {
      response = await this.call(path, timeout);
    } catch {
      throw unreachable();
    }
    if (!response.ok) throw unreachable();
    try {
      return (await response.json()) as T;
    } catch {
      throw unreachable();
    }
  }

  /** Whether a ComfyUI answers, and its version. Free; reads `/system_stats` only. */
  async status(): Promise<LocalComfyStatus> {
    try {
      const response = await this.call("/system_stats", TIMEOUT.detect);
      if (!response.ok) return { reachable: false, version: null };
      const body = (await response.json()) as {
        system?: { comfyui_version?: unknown };
      };
      const version = body?.system?.comfyui_version;
      return {
        reachable: true,
        version:
          typeof version === "string" && /^[0-9A-Za-z.+-]{1,32}$/.test(version)
            ? version
            : null,
      };
    } catch {
      return { reachable: false, version: null };
    }
  }

  /** The node types and model lists the local ComfyUI has, or a refusal. */
  private async objectInfo(): Promise<ObjectInfo> {
    try {
      const info = await this.read<ObjectInfo>("/object_info", TIMEOUT.info);
      if (!info || typeof info !== "object") throw noAnswer();
      return info;
    } catch {
      throw noAnswer();
    }
  }

  /** The values a run fills: the template's own, then the local model map. */
  private valuesFor(
    template: WorkflowTemplate,
    values: Record<string, unknown>,
  ) {
    // Runtime variants share the registered template's model configuration,
    // but may remove a loader (Klein editing omits the text-only upsampler).
    // Klein Base edits use a distinct image-conditioned graph but share the
    // diffusion/encoder/VAE configuration of its registered Base T2I template.
    // Otherwise GENOBI_KLEIN_BASE_MODEL works for stills but silently stops
    // working as soon as a person drops a reference image.
    const modelId =
      template.id === "flux-3-klein-base-edit"
        ? "flux-3-klein-base-t2i"
        : template.id;
    const overrides = Object.fromEntries(
      Object.entries(this.models[modelId] ?? {}).filter(
        ([slot]) => template.slots[slot]?.kind === "model",
      ),
    );
    return { ...values, ...overrides };
  }

  /** What a filled graph needs that this ComfyUI lacks: node types, and model slots. */
  missing(template: WorkflowTemplate, graph: ApiGraph, info: ObjectInfo) {
    const check = inspectWorkflow(template, graph, info);
    return { nodes: check.missingNodes, models: check.missingModels };
  }

  /**
   * Detection for the studio and agents: whether each template could run
   * here. Free: `/object_info` only, nothing submitted.
   */
  async check(templates: WorkflowTemplate[]) {
    let info: ObjectInfo;
    try {
      info = await this.objectInfo();
    } catch {
      return { reachable: false, templates: {} };
    }
    return {
      reachable: true,
      templates: Object.fromEntries(
        templates.map((template) => {
          const { nodes, models } = this.missing(
            template,
            fillSlots(
              template.graph,
              template.slots,
              this.models[template.id] ?? {},
            ),
            info,
          );
          return [template.id, { missingNodes: nodes, missingModels: models }];
        }),
      ),
    };
  }

  private async upload(file: WorkflowFile, name: string): Promise<string> {
    const form = new FormData();
    form.append(
      "image",
      new Blob([file.bytes as Uint8Array<ArrayBuffer>], {
        type: file.contentType,
      }),
      name,
    );
    form.append("type", "input");
    form.append("subfolder", "genobi");
    form.append("overwrite", "true");
    let body: { name?: unknown; subfolder?: unknown; type?: unknown };
    try {
      const response = await this.call("/upload/image", TIMEOUT.upload, {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error("refused");
      body = await response.json();
    } catch {
      throw unsent("The local ComfyUI did not accept an input file.");
    }
    const subfolder = typeof body?.subfolder === "string" ? body.subfolder : "";
    if (
      typeof body?.name !== "string" ||
      !FILE_NAME.test(body.name) ||
      !safeSubfolder(subfolder) ||
      body.type !== "input"
    )
      throw unsent("The local ComfyUI did not accept an input file.");
    return subfolder ? `${subfolder}/${body.name}` : body.name;
  }

  async run(
    template: WorkflowTemplate,
    values: Record<string, unknown>,
    _key: string,
    { idempotencyKey, files = {} }: WorkflowRunOptions,
  ): Promise<string> {
    const filled = this.valuesFor(template, values);
    // Files only for the template's image and video slots, named by the job.
    for (const slot of Object.keys(files)) {
      const kind = template.slots[slot]?.kind;
      if (kind !== "image" && kind !== "video")
        throw unsent("This workflow does not take that input file.");
    }
    if (!PROMPT_ID.test(idempotencyKey))
      throw unsent("This run has no usable id.");
    // Filled once with placeholders, so a mismatch is refused before any read.
    const placeholders = Object.fromEntries(
      Object.keys(files).map((slot) => [slot, "genobi/pending"]),
    );
    const check = fillSlots(template.graph, template.slots, {
      ...filled,
      ...placeholders,
    });
    const info = await this.objectInfo();
    const { nodes, models } = this.missing(template, check, info);
    if (nodes.length)
      throw unsent(
        `The local ComfyUI lacks the node types this workflow needs: ${nodes.filter((n) => CLASS.test(n)).join(", ")}. Install them, or switch the run location to Comfy Cloud.`,
      );
    if (models.length)
      throw unsent(
        `The local ComfyUI does not list the model file for ${models.join(", ")}. Put the file in its models folder, or name it in GENOBI_LOCAL_MODELS.`,
      );
    for (const [slot, file] of Object.entries(files))
      filled[slot] = await this.upload(
        file,
        `genobi-${idempotencyKey}-${slot}.${EXTENSION[file.contentType]}`,
      );
    const graph = fillSlots(template.graph, template.slots, filled);
    let response: Response;
    try {
      // One call; ComfyUI takes a client-chosen UUID as prompt_id where it
      // supports one and mints its own otherwise. Its answer is what counts.
      response = await this.call("/prompt", TIMEOUT.submit, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: graph,
          client_id: "genobi",
          ...(UUID.test(idempotencyKey) ? { prompt_id: idempotencyKey } : {}),
        }),
      });
    } catch (error) {
      if (refusedConnection(error)) throw noAnswer();
      throw unconfirmedLocal();
    }
    if (response.status === 400)
      throw rejectedLocally(await response.json().catch(() => null));
    if (response.status > 400 && response.status < 500)
      throw new AppError(
        502,
        "The local ComfyUI refused the request.",
        `provider_${response.status}`,
      );
    if (!response.ok) throw unconfirmedLocal();
    let id: unknown;
    try {
      id = ((await response.json()) as { prompt_id?: unknown })?.prompt_id;
    } catch {
      throw unconfirmedLocal();
    }
    if (typeof id !== "string" || !PROMPT_ID.test(id)) throw unconfirmedLocal();
    return `${this.base}/history/${id}`;
  }

  /** Whether a handle or media URL is this ComfyUI's. */
  owns(value: string) {
    return value.startsWith(`${this.base}/`);
  }

  async poll(
    handle: string,
    _key: string,
    expected: WorkflowOutput = VIDEO_OUTPUT,
  ): Promise<ProviderResult> {
    const id = localJobId(handle);
    if (!id || handle !== `${this.base}/history/${id}`) throw badLocation();
    // The queue first: a run only ever moves from the queue into history.
    const queue = await this.read<{
      queue_running?: unknown[];
      queue_pending?: unknown[];
    }>("/queue");
    const holds = (list: unknown) =>
      Array.isArray(list) &&
      list.some((item) => Array.isArray(item) && item[1] === id);
    if (holds(queue?.queue_running)) return { id, status: "Generating" };
    if (holds(queue?.queue_pending)) return { id, status: "Pending" };
    const history = await this.read<Record<string, unknown>>(
      `/history/${encodeURIComponent(id)}`,
    );
    const entry = history?.[id] as
      | { status?: { status_str?: unknown }; outputs?: Record<string, unknown> }
      | undefined;
    if (!entry) return { id, status: "Task not found" };
    if (entry.status?.status_str === "error") return { id, status: "Error" };
    const outputs = entry.outputs ?? {};
    const selected = selectWorkflowOutputs(localOutputFiles(outputs), expected);
    if (!selected.ok) return { id, status: "Error", error: selected.error };
    return {
      id,
      status: "Ready",
      result: { sample: localOutputUrl(this.base, selected.primary.file) },
      ...(expected.companions?.length
        ? {
            companions: selected.companions.map(
              ({ nodeId, label, output }) => ({
                nodeId,
                label,
                url: localOutputUrl(this.base, output.file),
              }),
            ),
          }
        : {}),
    };
  }

  async download(url: string): Promise<Response> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw badLocation();
    }
    const params = [...target.searchParams.keys()].sort().join();
    if (
      `${target.origin}${target.pathname}` !== `${this.base}/view` ||
      params !== "filename,subfolder,type" ||
      target.searchParams.get("type") !== "output" ||
      !FILE_NAME.test(target.searchParams.get("filename") ?? "") ||
      !safeSubfolder(target.searchParams.get("subfolder") ?? "")
    )
      throw badLocation();
    let response: Response;
    try {
      response = await this.call(`/view${target.search}`, TIMEOUT.view);
    } catch {
      throw unreachable();
    }
    if (response.status === 404)
      throw new AppError(
        410,
        "The local ComfyUI no longer has this output.",
        "delivery_expired",
      );
    if (!response.ok || !response.body)
      throw new AppError(502, "The download failed. We will try again.");
    return response;
  }
}
