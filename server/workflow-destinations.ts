import { ComfySdkWorkflows } from "./comfy-sdk";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import type { ProviderResult } from "../shared/provider";
import {
  notConfigured,
  type DestinationKind,
} from "../shared/comfy/destination";
import type {
  WorkflowClient,
  WorkflowOutput,
  WorkflowRunOptions,
  WorkflowTemplate,
} from "../shared/comfy/workflow";
import type { LocalComfyWorkflows } from "./comfy-local";

/** A client that can say which handles and result URLs are its own. */
export type OwningClient = WorkflowClient & { owns(value: string): boolean };

/** The clients beside Comfy Cloud, each optional. */
export interface OtherDestinations {
  local?: LocalComfyWorkflows;
  fetcher?: typeof fetch;
  /** The server's Comfy API deployment (`GENOBI_DEPLOYMENT_URL`). */
  deployment?: OwningClient;
}

/**
 * One `WorkflowClient` over the run locations: a run goes where its take says
 * (`options.location`), and a poll or download goes to the client whose
 * address the stored handle names. A handle never picks the address: the
 * local client accepts only its own base, the deployment client only its own
 * origin, the Cloud client only Comfy Cloud. A signed result link no client owns is fetched without a key.
 */
export class WorkflowDestinations implements WorkflowClient {
  private readonly others: OtherDestinations;
  constructor(
    private readonly cloud: WorkflowClient,
    others: LocalComfyWorkflows | OtherDestinations = {},
  ) {
    // The earlier form passed the local client alone.
    this.others = "owns" in others ? { local: others } : others;
  }

  private owner(value: string): WorkflowClient {
    const { local, deployment } = this.others;
    if (local?.owns(value)) return local;
    if (deployment?.owns(value)) return deployment;
    try {
      const url = new URL(value);
      const dynamic = this.deployment(url.origin);
      if (dynamic.owns(value)) return dynamic;
    } catch {
      /* Other URLs belong to Cloud or signed storage; never authenticate them here. */
    }
    return this.cloud;
  }

  async run(
    template: WorkflowTemplate,
    values: Record<string, unknown>,
    key: string,
    options: WorkflowRunOptions,
  ): Promise<string> {
    const location = options.location ?? "cloud";
    const client = options.deployment
      ? this.deployment(options.deployment.url)
      : this.client(location);
    if (!client) throw notConfigured({ kind: location });
    return client.run(template, values, key, options);
  }

  /** The client a run at this location goes to, or undefined when unset. */
  private client(location: DestinationKind): WorkflowClient | undefined {
    return location === "cloud"
      ? this.cloud
      : location === "local"
        ? this.others.local
        : location === "deployment"
          ? this.others.deployment
          : undefined; // A retired location (`isRetiredLocation`): no client.
  }

  /** Whether this server has a client for the location (`GENOBI_DEPLOYMENT_URL`). */
  serves(
    location: DestinationKind,
    deployment?: { url: string; name: string },
  ) {
    return Boolean(
      deployment ? this.deployment(deployment.url) : this.client(location),
    );
  }

  private deployment(url: string) {
    return new ComfySdkWorkflows({
      destination: parseWorkflowDestination("deployment", url),
      fetcher: this.others.fetcher,
    });
  }

  poll(
    handle: string,
    key: string,
    output?: WorkflowOutput,
  ): Promise<ProviderResult> {
    return this.owner(handle).poll(handle, key, output);
  }

  download(url: string, key?: string): Promise<Response> {
    return this.owner(url).download(url, key);
  }
}
