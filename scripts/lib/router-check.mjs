// The Router enablement check behind scripts/check-router.mjs.
export const ROUTER_BASE = "https://api.comfy.org";
/** The Router models Genobi's registry runs (`shared/registry.ts`). */
export const MODELS = [
  "ltx/ltx-2-5-fast",
  "ltx/ltx-2-5-pro",
  "bfl/flux-3-video",
  "bfl/flux-3-image",
  "bfl/video-upscale-v1",
  "minimax/minimax-h3",
];

/** A key's shape, checked before it is sent anywhere. Never printed. */
export function validKey(key) {
  return (
    typeof key === "string" &&
    key.startsWith("comfyui-") &&
    key.length >= 16 &&
    key.length <= 512 &&
    !/[\s\x00-\x1f\x7f]/.test(key)
  );
}

async function errorType(response) {
  const header = response.headers.get("x-comfy-error-type");
  if (header) return header;
  try {
    const body = await response.json();
    return typeof body?.error_type === "string" ? body.error_type : null;
  } catch {
    return null;
  }
}

/** One free read: the path, its status, and Router's error bucket if any. */
async function read(path, key, fetcher) {
  try {
    const response = await fetcher(`${ROUTER_BASE}${path}`, {
      headers: { "X-API-Key": key, accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const type = response.ok ? null : await errorType(response);
    if (response.ok) await response.body?.cancel();
    return { path, status: response.status, type };
  } catch {
    return { path, status: 0, type: "unreachable" };
  }
}

/** The verdict over every read: not_enabled anywhere decides it. */
export function verdict(reads) {
  if (reads.some((r) => r.type === "not_enabled"))
    return {
      code: 1,
      line: "NOT ENABLED: Comfy Router refused this key with not_enabled. Router is not switched on for it yet; Router runs will fail until Comfy enables it.",
    };
  if (reads.every((r) => r.status === 200))
    return {
      code: 0,
      line: "ENABLED for the catalogue: every free Router read answered 200 and none said not_enabled. A paid submit is the only full proof.",
    };
  return {
    code: 2,
    line: "INCONCLUSIVE: no not_enabled, but not every read succeeded (see above). Check the key and try again.",
  };
}

export async function checkRouter(key, fetcher = fetch) {
  const reads = [];
  for (const path of [
    "/v2/models?limit=1",
    ...MODELS.map((m) => `/v2/models/${m}`),
  ])
    reads.push(await read(path, key, fetcher));
  return { reads, ...verdict(reads) };
}
