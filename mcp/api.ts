import {
  AGENT_MARK_HEADER,
  GENOBI_CLIENT_HEADER,
  AGENT_RUN_GRANT,
  AGENT_RUN_HEADER,
} from "../shared/agent-session-events";

/**
 * The MCP server's only way into Genobi: the local studio server's API on a
 * loopback address. It holds no key and no job state of its own; the session
 * cookie is kept so successive calls see the same jobs and quotes.
 */
export const DEFAULT_URL = "http://127.0.0.1:4317";

export function studioUrl(value = DEFAULT_URL): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("GENOBI_URL is not a valid local studio URL.");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "GENOBI_URL must be the local studio, for example http://127.0.0.1:4317",
    );
  return url;
}

/** The studio answered with an error: nothing ran beyond what it reports. */
export class StudioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(code && code !== "request_failed" ? `${message} (${code})` : message);
  }
}

/** Nothing reached the studio: the connection was refused. */
export class StudioUnreachable extends Error {}

/**
 * A request may have reached the studio, but no readable answer came back. For
 * a paid write the outcome is unknown, so the caller must not retry it blindly.
 */
export class StudioNoAnswer extends Error {}

/** Only the studio's own words, bounded: never request headers or bodies. */
function studioMessage(body: unknown, status: number) {
  const { error, code } = (body ?? {}) as { error?: unknown; code?: unknown };
  const message =
    typeof error === "string" && error.trim()
      ? // Control characters are stripped on purpose, as the server's sanitisers do.
        // eslint-disable-next-line no-control-regex
        error.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 300)
      : `Genobi answered ${status}.`;
  return new StudioError(
    message,
    status,
    typeof code === "string" && /^[a-z_]{1,40}$/.test(code) ? code : undefined,
  );
}

const refused = (error: unknown) =>
  (error as { cause?: { code?: unknown } })?.cause?.code === "ECONNREFUSED";

export class GenobiApi {
  private session = "";
  /** The one session handshake in flight, shared by every first request. */
  private handshake?: Promise<void>;
  /** Local-file tools remain unavailable to a restricted studio-started session. */
  get agentSession() {
    return this.agent;
  }
  constructor(
    readonly base: URL,
    private fetcher: typeof fetch = fetch,
    /**
     * Started by the studio for a project prompt (GENOBI_AGENT_SESSION=1):
     * every request says so, and the studio refuses it anything paid.
     */
    private agent = false,
    /**
     * The session's grant (`GENOBI_AGENT_RUN`), sent with the mark so the
     * studio knows which agent session this server belongs to: its picked
     * reads, its settings, and its quotes as steps the person approves.
     */
    private grant?: string,
    /** Private CLI connection identity, persisted before sending any request. */
    initialSession?: string,
    /**
     * "cli" from the terminal adapter, "mcp" from the MCP server: said on
     * every request so the studio can say where a take came from; grants nothing.
     */
    private client?: "cli" | "mcp",
  ) {
    if (initialSession !== undefined) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          initialSession,
        )
      )
        throw new Error("Invalid studio session identity.");
      this.session = initialSession;
    }
    if (grant !== undefined && !AGENT_RUN_GRANT.test(grant))
      this.grant = undefined;
  }

  private notRunning() {
    return new StudioUnreachable(
      `Genobi is not running at ${this.base.origin}. Start it with \`npm run dev\` in the camera-director folder.`,
    );
  }

  /**
   * A fresh connection has no session yet. Without this, requests sent at
   * once would each get a new session from the studio, and the client would
   * keep only the last cookie: what the others made would be out of reach.
   * So the first requests wait for one shared `GET /api/health` and its
   * cookie. A health answer without a cookie still counts as done; a
   * connection that fails leaves no handshake behind, so the next call tries
   * again, and a write that waited on it was never sent.
   */
  private startSession() {
    this.handshake ??= this.fetcher(new URL("/api/health", this.base), {
      method: "GET",
      redirect: "error",
      headers: this.mark({ Accept: "application/json" }),
    }).then(
      (response) => {
        this.keepSession(response);
      },
      (error: unknown) => {
        this.handshake = undefined;
        throw error;
      },
    );
    return this.handshake.catch(() => {
      throw this.notRunning();
    });
  }

  /** An agent session's server marks every request it sends, handshake included. */
  private mark(headers: Record<string, string>) {
    const said = this.client
      ? { ...headers, [GENOBI_CLIENT_HEADER]: this.client }
      : headers;
    if (!this.agent) return said;
    return {
      ...said,
      [AGENT_MARK_HEADER]: "1",
      ...(this.grant ? { [AGENT_RUN_HEADER]: this.grant } : {}),
    };
  }

  private keepSession(response: Response) {
    const cookie = response.headers
      .getSetCookie?.()
      .find((c) => c.startsWith("camera_session="));
    const id = cookie?.slice(15).split(";")[0];
    if (id && /^[0-9a-f-]{36}$/.test(id)) this.session = id;
  }

  private async send<T>(
    path: `/api/${string}`,
    init: {
      method: "GET" | "POST";
      body?: string | Uint8Array<ArrayBuffer>;
      headers?: HeadersInit;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    if (!this.session) {
      // An optional activity write can be cancelled even while the shared handshake waits.
      const handshake = this.startSession();
      if (init.signal)
        await Promise.race([
          handshake,
          new Promise<never>((_, reject) => {
            const stop = () =>
              reject(new StudioNoAnswer("Activity connection timed out."));
            if (init.signal!.aborted) stop();
            else init.signal!.addEventListener("abort", stop, { once: true });
          }),
        ]);
      else await handshake;
    }
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.base), {
        method: init.method,
        redirect: "error",
        body: init.body,
        signal: init.signal,
        headers: {
          Accept: "application/json",
          ...init.headers,
          ...this.mark({}),
          ...(this.session ? { Cookie: `camera_session=${this.session}` } : {}),
        },
      });
    } catch (error) {
      // A read is safe to call again, so any failure reads as "not running".
      // A write may have been sent before the connection broke; only a refused
      // connection proves it was not.
      if (init.method === "GET" || refused(error)) throw this.notRunning();
      throw new StudioNoAnswer(
        `The connection to Genobi at ${this.base.origin} broke before it answered.`,
      );
    }
    this.keepSession(response);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (response.ok && init.method === "POST")
        throw new StudioNoAnswer(
          `Genobi accepted the request but its answer could not be read.`,
        );
      body = {};
    }
    if (!response.ok) throw studioMessage(body, response.status);
    return body as T;
  }

  get<T>(path: `/api/${string}`): Promise<T> {
    return this.send<T>(path, { method: "GET" });
  }

  /**
   * A finished clip or still from the studio, in this session, for hashing.
   * Refused past `limit` bytes; never a write.
   */
  async bytes(
    path: `/api/${string}`,
    limit: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    if (!this.session) await this.startSession();
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.base), {
        method: "GET",
        redirect: "error",
        headers: this.mark(
          this.session ? { Cookie: `camera_session=${this.session}` } : {},
        ),
      });
    } catch {
      throw this.notRunning();
    }
    if (!response.ok)
      throw new StudioError(
        `Genobi answered ${response.status}.`,
        response.status,
      );
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > limit) {
      await response.body?.cancel();
      throw new Error(`The media is over ${limit} bytes.`);
    }
    const reader = response.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new Error(`The media is over ${limit} bytes.`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  /** Optional activity must not hold a tool forever if the studio is unavailable. */
  activity(body: unknown) {
    return this.send("/api/activity", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", "X-Genobi-MCP": "1" },
      signal: AbortSignal.timeout(3000),
    });
  }

  /**
   * The person's messages to this agent session from their studio (Box
   * 1.8), each collected once. Only a studio-started session, with its mark
   * and grant, has any; a failure answers none, so a tool's own answer never
   * waits long on it.
   */
  async messages(): Promise<{ text: string }[]> {
    if (!this.agent || !this.grant) return [];
    try {
      const body = await this.send<{ messages?: unknown }>(
        "/api/agent/run/messages",
        {
          method: "POST",
          body: "{}",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        },
      );
      return Array.isArray(body?.messages)
        ? (body.messages as { text?: unknown }[])
            .filter((m) => typeof m?.text === "string")
            .map((m) => ({ text: (m.text as string).slice(0, 12000) }))
        : [];
    } catch {
      return [];
    }
  }

  /** JSON to the studio, with the same session and loopback-only base. */
  post<T>(
    path: `/api/${string}`,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<T> {
    return this.send<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  /** Raw bytes to the studio (an upload), with the same session. */
  postBytes<T>(
    path: `/api/${string}`,
    body: Uint8Array<ArrayBuffer>,
    contentType: string,
  ): Promise<T> {
    return this.send<T>(path, {
      method: "POST",
      body,
      headers: { "Content-Type": contentType },
    });
  }
}
