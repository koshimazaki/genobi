import express from "express";
import {
  LOCAL_DEPLOY_INPUT_BYTES,
  validDeploymentFile,
} from "../shared/comfy/deploy-file";
import { randomUUID } from "node:crypto";
import { requireKey, AppError } from "./errors";
import { ComfySdkWorkflows } from "./comfy-sdk";
import { runCredential, type ServerKeys } from "./keys";
import type { WorkflowSettings } from "./workflow-settings";
import { deployInvalid } from "../shared/comfy/deploy-input";
import type { GenerateInput } from "../shared/types";
import type { RateBucket } from "../shared/limits";
import { parseWorkflowDestination } from "../shared/comfy/destination";

interface Uploaded {
  session: string;
  url: string;
  token: string;
  reference: object;
  expires: number;
}
/** Short-lived ownership tickets; input bytes and keys are never persisted. */
export class DeploymentAssets {
  private uploaded = new Map<string, Uploaded>();
  constructor(
    private settings: WorkflowSettings,
    private keys: ServerKeys,
    private fetcher?: typeof fetch,
  ) {}

  validate(input: GenerateInput, session: string, url: string) {
    for (const [token, id] of Object.entries(input.deploy?.assets ?? {}))
      this.asset(id, token, session, url);
  }
  private asset(id: string, token: string, session: string, url: string) {
    const asset = this.uploaded.get(id);
    if (
      !asset ||
      asset.session !== session ||
      asset.url !== url ||
      asset.token !== token ||
      asset.expires < Date.now()
    )
      throw deployInvalid(
        "Reattach the deployment input files in this session before quoting.",
      );
    return asset.reference;
  }
  values(
    values: Record<string, unknown>,
    input: GenerateInput,
    session: string,
    url: string,
  ) {
    const refs = new Map(
      Object.entries(input.deploy?.assets ?? {}).map(([token, id]) => [
        id,
        this.asset(id, token, session, url),
      ]),
    );
    return Object.fromEntries(
      Object.entries(values).map(([path, value]) => [
        path,
        typeof value === "string" && refs.has(value) ? refs.get(value) : value,
      ]),
    );
  }

  async stage(
    session: string,
    token: string,
    bytes: Uint8Array,
    contentType: string,
    byo?: string,
  ) {
    const deployment = this.settings.deployment(session);
    if (!deployment) throw deployInvalid("Register a deployment first.");
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length > LOCAL_DEPLOY_INPUT_BYTES ||
      !validDeploymentFile(token, contentType, bytes)
    )
      throw deployInvalid(
        "Choose a PNG/JPEG/WebP still, WebM take/depth or WAV/FLAC/MP3 track, under 150 MB.",
      );
    for (const [id, item] of this.uploaded)
      if (item.expires < Date.now()) this.uploaded.delete(id);
    if (
      this.uploaded.size >= 128 ||
      [...this.uploaded.values()].filter((a) => a.session === session).length >=
        32
    )
      throw new AppError(
        429,
        "Too many staged deployment inputs. Wait for older tickets to expire.",
      );
    const { key } = runCredential(
      this.keys,
      "video",
      "ltx-deploy-layout-to-video",
      byo,
      "deployment",
    );
    const client = new ComfySdkWorkflows({
      destination: parseWorkflowDestination("deployment", deployment.url),
      fetcher: this.fetcher,
    });
    const reference = await client.upload(bytes, contentType, key);
    const id = randomUUID();
    this.uploaded.set(id, {
      session,
      url: deployment.url,
      token,
      reference,
      expires: Date.now() + 2 * 3600_000,
    });
    return id;
  }

  router(limit: (bucket: RateBucket, id: string) => void) {
    const router = express.Router();
    router.post(
      "/deployment-assets/:token",
      express.raw({ type: () => true, limit: LOCAL_DEPLOY_INPUT_BYTES }),
      async (request, response) => {
        const session = response.locals.sessionId as string;
        limit("edit", session);
        const byo =
          request.headers["x-byo-key"] === undefined
            ? undefined
            : requireKey(request.headers["x-byo-key"]);
        const id = await this.stage(
          session,
          request.params.token,
          request.body,
          request.headers["content-type"] ?? "",
          byo,
        );
        response.status(201).json({ id });
      },
    );
    return router;
  }
}
