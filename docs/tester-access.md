---
tags: [cloudflare, comfy, backend]
summary: Operator-enabled reviewer access on the hosted studio, an access code from the submission unlocking a capped number of Comfy Deploy runs paid by the operator's workspace.
---

# Tester access for reviewers

The two featured workflows, **Comfy Deploy · layout-to-video** and **Comfy
Deploy · akuspace**, run only on a Comfy deployment with Genobi's custom nodes
([deployment guide](comfy-deploy.md)). A reviewer without a key from the
operator's Comfy workspace cannot run them. Tester access lets the operator
hand out one access code with a submission. The code unlocks a fixed number of
runs on the operator's own deployment, and the operator's workspace pays for
them.

It is **off by default**. Nothing in the repository enables it, and with no
secrets set the hosted studio behaves exactly as before: `/api/health` answers
`testerAccess: false` and `/api/tester/*` answers 404.

## What stays private

- **The access code goes in the submission form only.** It never goes in this
  repository, a doc, an issue, a commit or any public asset. The examples
  below use placeholders.
- **The operator's Comfy key and endpoint are Pages secrets.** They live in the
  Worker's environment. The key never reaches the browser; it is forwarded only
  to the configured `*.run.comfy.app` endpoint, and only on the four
  deployment routes (staging inputs, quote, submit, poll). The endpoint does
  reach the browser: see [known caveats](#known-caveats).
- **D1 never holds the code.** The run counter is keyed by a SHA-256 of the
  code and holds a count and two timestamps. Neither the code nor the unlock
  token is written to any row, and neither is logged.
- **The browser keeps the code nowhere.** The field sends it once and clears
  it. The page then holds a short-lived signed token in page memory, as it
  holds a visitor key (`src/usePageKey.ts`): a refresh, a navigation or
  closing the tab forgets it.

## Enable it

Run these from a clean checkout. Each command prompts for its value, so the
value does not enter shell history. The Pages project is `genobi`.

```sh
npx wrangler pages secret put TESTER_ACCESS_CODE   --project-name genobi
npx wrangler pages secret put TESTER_TOKEN_SECRET  --project-name genobi
npx wrangler pages secret put TESTER_COMFY_KEY     --project-name genobi
npx wrangler pages secret put TESTER_DEPLOYMENT_URL --project-name genobi
# Optional; 10 when unset.
npx wrangler pages secret put TESTER_RUN_CAP       --project-name genobi
```

| Secret                  | Value                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `TESTER_ACCESS_CODE`    | The code for the submission form. At least 12 characters; use a random one.                |
| `TESTER_TOKEN_SECRET`   | At least 32 random characters, for example `openssl rand -base64 48`. Signs unlock tokens. |
| `TESTER_COMFY_KEY`      | A Comfy API key (`comfyui-…`) from the workspace that owns the deployment.                 |
| `TESTER_DEPLOYMENT_URL` | The deployment's `https://<name>.run.comfy.app` endpoint.                                  |
| `TESTER_RUN_CAP`        | How many runs the code may reserve, 0 to 1000. Defaults to 10.                             |

Tester access turns on only when the first four are all set and valid; a short
code, a short token secret, a key that is not a Comfy key or an endpoint that is
not a `*.run.comfy.app` origin leaves it off. Secrets apply to the next
deployment, so redeploy (`npm run deploy:pages`)
and then check `https://genobi.pages.dev/api/health` for `testerAccess: true`.

The migration `0011_tester_runs.sql` must be applied before that deployment:
`npm run deploy:pages` refuses while it is pending and prints the
`npx wrangler d1 migrations apply flux-studio-lite --remote --config wrangler.pages.json`
command to run first. The migration is additive.

## What it costs at most

Each reserved run is one job on the deployment, billed by Comfy to the
deployment's workspace as GPU time. With the rates in
[costs and scale to zero](comfy-deploy.md#costs-and-scale-to-zero) (RTX PRO 6000
at $3.49 an hour, checked 30 October 2026), a typical run is under a dollar and
a run can last at most the plan's job ceiling (30 minutes on Standard/Creator,
about $1.75). So the most the code can spend on compute is
**`TESTER_RUN_CAP` × one run's GPU time**, about $17.50 at the default cap of 10
in the worst case, plus any cold start and the deployment's standing storage.
The workspace's own balance is the final ceiling: topping up ten dollars and no
more bounds the spend whatever the cap says. Keep the deployment at
`--min 0 --max 1`, so it scales to zero between runs.

## Top up, change the cap, revoke

- **Top up** the operator's Comfy workspace in Comfy's billing settings. Nothing
  in Genobi needs to change.
- **More runs for the same code:** raise `TESTER_RUN_CAP` and redeploy. The
  count already used is kept.
- **A fresh allowance:** set a new `TESTER_ACCESS_CODE`. A new code has its own
  counter starting at zero, and every token issued for the old code stops
  working at once.
- **Revoke:** delete the code and redeploy:

  ```sh
  npx wrangler pages secret delete TESTER_ACCESS_CODE --project-name genobi
  ```

  The unlock route disappears, health reports `testerAccess: false`, and every
  outstanding token is refused. Deleting `TESTER_COMFY_KEY` instead has the same
  effect; rotate that key in Comfy as well if it may have been exposed.

## What a reviewer sees

1. Open [the hosted studio](https://genobi.pages.dev) and Settings → Studio
   setup. With no key of their own connected, a field reads **Enter the access
   code from the submission**.
2. **Unlock test runs** sends the code once. On success the field says how
   many runs are left, in words ("Ten test runs left."), and the session's
   generation setup switches to the test deployment. Camera's LTX menu then
   offers the two Comfy Deploy workflows.
3. Each run is quoted and asks for confirmation before anything is submitted,
   as for any deployment run. Only the two deploy workflows run on the code;
   any other model is refused until the reviewer connects a key of their own.
4. At the cap the quote is refused with **Test runs used up.**
5. A wrong code answers "Access code not accepted." with no further detail.
   Unlock attempts are limited to five a minute per address and thirty a minute
   across the site (`testerUnlockPerIp`, `testerUnlockGlobal` in
   `shared/limits.ts`).

The token lasts two hours and is bound to the browser session that unlocked it.
After it expires, or after a refresh, enter the code again; the count is kept on
the server, not in the browser. Connecting the reviewer's own Comfy key
replaces the token.

## How the cap is enforced

`worker/tester.ts` holds the whole mechanism; `worker/index.ts` swaps a token
in the key slot for the operator's key on the deployment routes only, and
treats it as no key everywhere else (balance, uploads, chains, Cloud checks).
The quote and the submission both refuse unless the plan is one of the two
deploy workflows on `TESTER_DEPLOYMENT_URL` and a run is left. The run is
counted inside the same D1 transaction that spends the quote and persists the
idempotency reservation (`spendQuoteAndReserve` in `worker/quotes.ts`): the
quote is claimed only while the count is below the cap, and the count rises
only when this request's job row went in. Two concurrent submissions for the
last run therefore reserve one job between them. A submission refused before
anything reached the deployment returns its run; an uncertain submission keeps
it, because it may have been charged, and is never retried automatically.

## What is recorded

Counts only, following the [observability policy](https://github.com/koshimazaki/Genobi/blob/main/observability/README.md):

- `tester_runs`: one row per code, the code's SHA-256, how many runs it has
  reserved, and when the row was created and last changed. It is not swept, so
  the cap holds for the life of the code.
- The jobs themselves are ordinary session jobs, retained and aggregated into
  `daily_stats` like any other run. No row marks which reviewer ran them.

Nothing logs the code, the token or the operator's key. The Worker writes no
request headers or bodies to its logs.

## Known caveats

- **The deployment URL reaches the browser.** Unlocking saves
  `TESTER_DEPLOYMENT_URL` as the session's deployment, and
  `GET /api/settings/run-location` returns it (`deployment.url` and its name)
  with the rest of the session's run location. That is harmless: the endpoint refuses
  a call without a Comfy key from the owning workspace, and that key stays in
  the Worker.
- **The quote shows $0 to the tester.** The reviewer pays nothing, but the
  operator's workspace is billed for the GPU time. The figure is cosmetic;
  a reviewer may wonder why a paid run reads as free.
