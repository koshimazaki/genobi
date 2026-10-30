import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ChainRecord } from "../shared/chain";
import type { QuoteRecord } from "../shared/quote";
import type { TakeStart } from "../shared/take";
import type { GenerateInput, Job, Source } from "../shared/types";
import type { PartPlan } from "../shared/upscale-parts";

export interface StoredJob extends Job {
  sessionId: string;
  idempotencyKey: string;
  providerId?: string;
  pollingUrl?: string;
  resultRemoteUrl?: string;
  companionDownloads?: { nodeId: string; label: string; url: string }[];
  lastPolledAt?: number;
  /** Private: input hashes stay out of public jobs. Absent on older runs. */
  take?: TakeStart;
}
export interface StoredSource extends Source {
  sessionId: string;
  filePath: string;
  /** Private, like a take's hashes: SHA-256 of an upload's bytes. */
  sha256?: string;
  /** Private lineage: the sources a derived file was made from. */
  derivedFrom?: string[];
  /** Private: the media tool that made a derived file. Absent on older ones. */
  operation?: MediaOperation;
}
/** The local media tools' operations (`server/media-tools.ts`). */
export type MediaOperation =
  "trim" | "frames" | "concat" | "crossfade" | "space";
export interface StoredQuote extends QuoteRecord {
  sessionId: string;
}
export interface StoredChain extends ChainRecord {
  sessionId: string;
}
/**
 * A split upscale (`server/upscale-parts.ts`): the source, the request every
 * part runs, the plan, each part's cut and quote, and the one confirmation.
 */
export interface StoredPartSet {
  id: string;
  sessionId: string;
  sourceId: string;
  /** The person's session, when the source is a clip they picked. */
  sourceSession?: string;
  input: GenerateInput;
  plan: PartPlan;
  parts: {
    sourceId: string;
    quoteId: string;
    /** The run that counts; a retry the person confirmed raises it. */
    attempt: number;
    /** Refused before anything was sent (budget, expired quote). */
    refused?: string;
    /** A retry's quote, until it is confirmed or replaced. */
    retry?: {
      quoteId: string;
      claimId?: string;
      /** The attempt before the claim, restored if nothing was reserved. */
      from?: number;
    };
  }[];
  /** The confirmation id covering every part. */
  quoteId: string;
  /** The length each full part was cut to; 19 s when absent. */
  partSeconds?: number;
  /** The request it is reused for (`requestKey`). */
  requestKey?: string;
  /** The person declined the agent's request; nothing of it can run. */
  declined?: true;
  /** An approved agent's set the server reads on its own until joined. */
  followed?: true;
  confirmation?: { quoteId: string; at: string };
  joinedSourceId?: string;
  joinError?: string;
  createdAt: string;
  updatedAt: string;
}
/** A session's run location and workflow choices (`server/workflow-settings.ts`). */
export interface StoredSettings {
  sessionId: string;
  location?: "local" | "cloud" | "both" | "deployment";
  deployment?: { url: string };
  /** Template id by workflow entry id. */
  workflows: Record<string, string>;
  updatedAt: string;
}
interface Data {
  jobs: StoredJob[];
  sources: StoredSource[];
  quotes: StoredQuote[];
  chains: StoredChain[];
  settings: StoredSettings[];
  partSets: StoredPartSet[];
}

// A single local process owns this file. The cloud adapter will use D1 transactions.
export class Store {
  data: Data = {
    jobs: [],
    sources: [],
    quotes: [],
    chains: [],
    settings: [],
    partSets: [],
  };
  private writes = Promise.resolve();
  constructor(readonly directory: string) {}

  async load() {
    await mkdir(path.join(this.directory, "media"), {
      recursive: true,
      mode: 0o700,
    });
    try {
      this.data = JSON.parse(
        await readFile(path.join(this.directory, "jobs.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // Files written before quotes or chains existed have none.
    this.data.quotes ??= [];
    this.data.chains ??= [];
    this.data.settings ??= [];
    this.data.partSets ??= [];
    // Never automatically repeat a submission whose acceptance was not recorded.
    for (const job of this.data.jobs) {
      if (job.status === "submitting") {
        job.status = "Error";
        job.error =
          "Submission was interrupted. Check your provider usage before starting another generation.";
      }
    }
    await this.save();
  }

  save(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    const write = this.writes
      .catch(() => {})
      .then(async () => {
        const temporary = path.join(this.directory, "jobs.json.tmp");
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await rename(temporary, path.join(this.directory, "jobs.json"));
      });
    this.writes = write;
    return write;
  }
}

export function publicJob(job: StoredJob): Job {
  const {
    imageReferences: _references,
    sessionId: _session,
    idempotencyKey: _request,
    providerId: _provider,
    pollingUrl: _poll,
    resultRemoteUrl: _result,
    companionDownloads: _downloads,
    lastPolledAt: _last,
    take: _take,
    deploy: _deploy,
    ...visible
  } = job;
  return visible;
}
export function publicSource(source: StoredSource): Source {
  const {
    sessionId: _session,
    filePath: _file,
    sha256: _hash,
    derivedFrom: _from,
    operation: _operation,
    ...visible
  } = source;
  return visible;
}
