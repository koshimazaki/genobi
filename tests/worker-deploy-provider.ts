import { Response as MFResponse } from "miniflare";
export const deploymentRequests: {
  host: string;
  method: string;
  path: string;
  authorised: boolean;
  body?: Record<string, unknown>;
}[] = [];
export const deploymentFault = { uncertain: false };
const wav = new Uint8Array(16044);
const view = new DataView(wav.buffer);
for (const [at, text] of [
  [0, "RIFF"],
  [8, "WAVE"],
  [12, "fmt "],
  [36, "data"],
] as const)
  wav.set(new TextEncoder().encode(text), at);
view.setUint32(4, wav.length - 8, true);
view.setUint32(16, 16, true);
view.setUint16(20, 1, true);
view.setUint16(22, 1, true);
view.setUint32(24, 8000, true);
view.setUint32(28, 16000, true);
view.setUint16(32, 2, true);
view.setUint16(34, 16, true);
view.setUint32(40, 16000, true);
export async function fakeDeployment(
  request: Pick<Request, "url" | "method" | "headers" | "json">,
  clip: Uint8Array,
) {
  const url = new URL(request.url);
  if (url.hostname === "deployment-delivery.bfl.ai")
    return new MFResponse(url.pathname.endsWith("wav") ? wav : clip, {
      headers: {
        "content-length": String(
          url.pathname.endsWith("wav") ? wav.length : clip.length,
        ),
      },
    });
  if (!url.hostname.endsWith(".run.comfy.app")) return undefined;
  const body =
    request.method === "POST" && url.pathname === "/api/v2/jobs"
      ? ((await request.json()) as Record<string, unknown>)
      : undefined;
  deploymentRequests.push({
    host: url.hostname,
    method: request.method,
    path: url.pathname,
    authorised:
      request.headers.get("authorization") ===
      "Bearer comfyui-deployment-test-key",
    ...(body ? { body } : {}),
  });
  if (url.pathname.includes("/by-hash/"))
    return new MFResponse(null, { status: 404 });
  if (url.pathname === "/api/v2/assets")
    return MFResponse.json(
      { id: crypto.randomUUID(), hash: "a".repeat(64) },
      { status: 201 },
    );
  const job = (status: string, outputs: object[] = []) => ({
    id: "deployed-1",
    status,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    expires_at: null,
    queue_position: null,
    progress: null,
    outputs,
    error: null,
    urls: { self: "/api/v2/jobs/deployed-1", events: "", cancel: "" },
  });
  if (url.pathname === "/api/v2/jobs")
    return deploymentFault.uncertain
      ? new MFResponse("unconfirmed", { status: 503 })
      : MFResponse.json(job("queued"), { status: 201 });
  if (url.pathname === "/api/v2/jobs/deployed-1")
    return MFResponse.json(
      job("succeeded", [
        {
          id: "video",
          node_id: "75",
          name: "video.mp4",
          type: "video",
          content_type: "video/mp4",
          size_bytes: clip.length,
        },
        {
          id: "audio",
          node_id: "13",
          name: "wet.wav",
          type: "audio",
          content_type: "audio/wav",
          size_bytes: wav.length,
        },
      ]),
    );
  if (/\/assets\/(video|audio)\/content/.test(url.pathname))
    return new MFResponse(null, {
      status: 302,
      headers: {
        Location: `https://deployment-delivery.bfl.ai/${url.pathname.includes("audio") ? "wet.wav" : "clip.mp4"}`,
      },
    });
  return new MFResponse("not found", { status: 404 });
}
