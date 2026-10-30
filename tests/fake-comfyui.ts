// A fake ComfyUI on a loopback port: the routes Genobi's local client uses,
// shaped as ComfyUI's server.py answers them. It records every request, so a
// test can say what was and was not sent.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { ApiGraph } from "../shared/comfy/slots";

export interface FakeComfyOptions {
  /** Node types `/object_info` lists, with combo options per input. */
  nodes: Record<string, Record<string, unknown[]>>;
  /** The output a finished run lists, per node id. */
  outputs?: Record<string, unknown>;
  /** The bytes `/view` serves. */
  media?: Uint8Array;
}

export interface FakeComfy {
  url: string;
  requests: { method: string; path: string; body: Buffer }[];
  prompts: { prompt: ApiGraph; client_id?: string; prompt_id?: string }[];
  /** What `/prompt` does next. */
  answer: "accept" | "node_error" | "lose" | "server_error";
  /** Where the accepted run is: queued, running, done or failed. */
  state: "pending" | "running" | "success" | "error" | "gone";
  close(): Promise<void>;
}

const read = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });

export async function fakeComfy(options: FakeComfyOptions): Promise<FakeComfy> {
  const fake = {
    requests: [],
    prompts: [],
    answer: "accept",
    state: "pending",
  } as unknown as FakeComfy;
  let promptId = "";
  const objectInfo = Object.fromEntries(
    Object.entries(options.nodes).map(([type, inputs]) => [
      type,
      {
        input: {
          required: Object.fromEntries(
            Object.entries(inputs).map(([name, list]) => [name, [list]]),
          ),
        },
      },
    ]),
  );
  const server: Server = createServer(async (request, response) => {
    const body = await read(request);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    fake.requests.push({
      method: request.method ?? "",
      path: url.pathname,
      body,
    });
    const json = (status: number, value: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/system_stats")
      return json(200, {
        system: {
          comfyui_version: "0.3.99",
          argv: ["/home/someone/ComfyUI/main.py"],
          python_version: "3.12",
        },
        devices: [],
      });
    if (url.pathname === "/object_info") return json(200, objectInfo);
    if (url.pathname === "/upload/image" && request.method === "POST") {
      const name = /filename="([^"]+)"/.exec(body.toString("latin1"))?.[1];
      return json(200, { name, subfolder: "genobi", type: "input" });
    }
    if (url.pathname === "/prompt" && request.method === "POST") {
      const sent = JSON.parse(body.toString());
      fake.prompts.push(sent);
      if (fake.answer === "lose") return void request.socket.destroy();
      if (fake.answer === "server_error") return json(500, {});
      if (fake.answer === "node_error")
        return json(400, {
          error: {
            type: "prompt_outputs_failed_validation",
            message: "Prompt outputs failed validation",
          },
          node_errors: {
            "18:1": {
              class_type: "UNETLoader",
              errors: [
                {
                  message: "Value not in list",
                  details: "unet_name: '/home/someone/models/x.safetensors'",
                },
              ],
            },
          },
        });
      promptId = sent.prompt_id ?? "4b4a1f9e-0000-4000-8000-000000000001";
      return json(200, { prompt_id: promptId, number: 1, node_errors: {} });
    }
    if (url.pathname === "/queue") {
      const item = [1, promptId, {}, {}, []];
      return json(200, {
        queue_running: fake.state === "running" ? [item] : [],
        queue_pending: fake.state === "pending" ? [item] : [],
      });
    }
    if (url.pathname.startsWith("/history/")) {
      const id = url.pathname.slice("/history/".length);
      if (id !== promptId || !["success", "error"].includes(fake.state))
        return json(200, {});
      return json(200, {
        [id]: {
          prompt: [],
          outputs: fake.state === "success" ? (options.outputs ?? {}) : {},
          status: {
            status_str: fake.state,
            completed: fake.state === "success",
            messages: [],
          },
        },
      });
    }
    if (url.pathname === "/view") {
      if (url.searchParams.get("type") !== "output" || !options.media)
        return json(404, {});
      response.writeHead(200, { "Content-Type": "image/png" });
      return void response.end(options.media);
    }
    json(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  fake.url = `http://127.0.0.1:${address.port}`;
  fake.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return fake;
}

/** Every node type and loader file a template's graph names, as object_info lists them. */
export function nodesFor(graph: ApiGraph, models: Record<string, string> = {}) {
  const nodes: Record<string, Record<string, unknown[]>> = {};
  for (const node of Object.values(graph)) {
    nodes[node.class_type] ??= {};
    for (const [input, value] of Object.entries(node.inputs))
      if (typeof value === "string" && /\.(safetensors|gguf)$/.test(value))
        nodes[node.class_type][input] = [
          ...(nodes[node.class_type][input] ?? []),
          value,
          ...Object.values(models),
        ];
  }
  return nodes;
}
