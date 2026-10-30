// Is Comfy Router switched on for this Comfy key? Router is not generally
// available yet, and a caller it has not enabled is refused `403` with
// `error_type: not_enabled` (router-openapi.yaml, RouterErrorType). This asks
// only Router's free catalogue reads, which generate and charge nothing:
// GET /v2/models and GET /v2/models/{provider}/{model} for each Router model
// Genobi runs. Usage: node scripts/check-router.mjs, with the key saved in the
// studio (the Keychain, macOS) or set as COMFY_API_KEY, which wins.
//
// What it cannot see: the queued submit can also answer `not_enabled` for a
// credential that carries no Comfy workspace. Only a paid submission shows
// that, and this script never makes one.
import { comfyKey } from "./lib/comfy-key.mjs";
import { checkRouter, validKey } from "./lib/router-check.mjs";

const { key, source } = await comfyKey();
if (!validKey(key)) {
  console.error(
    "No Comfy key: save one in the studio's key dialog, or set COMFY_API_KEY (it starts with comfyui-).",
  );
  process.exit(2);
}
console.log(`Key from ${source}.`);
const { reads, code, line } = await checkRouter(key);
for (const r of reads)
  console.log(
    `${String(r.status).padStart(3)} ${r.path}${r.type ? `  ${r.type}` : ""}`,
  );
console.log(line);
process.exit(code);
