// Pages binds ASSETS without a config entry, so `wrangler types` run against
// wrangler.pages.json does not declare it (docs/cloudflare.md).
interface Env {
  ASSETS: Fetcher;
}
