# Observability

How many people used the studio, and how many generations they ran. Nothing about what they made.

Everything for that question lives here:

| File                                                           | Role                                                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`rollup.ts`](rollup.ts)                                       | Aggregates each UTC day inside the lifecycle sweep, before any row is deleted.                 |
| [`stats.mjs`](stats.mjs)                                       | Reads the result. `npm run stats`, or `npm run stats -- --local`.                              |
| [`../migrations/0003_stats.sql`](../migrations/0003_stats.sql) | The `daily_stats` table. It stays in `migrations/` because D1 applies that directory in order. |

## What is measured

One row per UTC day, eight columns, and that is the whole schema:

`day`, `generations`, `sessions`, `ready`, `failed`, `drafts`, `upscales`, `spend_usd`

`sessions` counts distinct sessions with a generation record created that day; visits without a generation do not count. A visitor active on two days counts once per day, so the total is session-days rather than people — there are no accounts here to count people with.

## What is deliberately not measured

No prompt, no camera term, no description, no session id, no API key, no IP address, no country, no user agent. The app is a public demo run with the visitor's own provider key; counting how often it was used does not require recording what anyone asked it for. A test asserts the exact column list, so this table cannot quietly grow into something that mines its visitors.

## Why aggregate before deleting

Job and source records are eligible for deletion after 30 days. Quota eviction can remove media sooner, but keeps generation records, their outcomes and idempotency reservations until normal retention. A count computed only at read time would therefore reset every month. The sweep aggregates first and deletes second, which keeps the numbers and discards the detail — the same order that makes the privacy claim above true rather than merely intended.

`stats.mjs` takes the larger of each day's frozen row and its live rows, so output is current between sweeps rather than lagging by up to five minutes.

```
day               gens  sessions     ready    failed    drafts  upscales     spend
2026-09-20           3         2         2         1         1         1     $2.69

total                3         2         2         1         1         1     $2.69
```

## What Cloudflare already covers

Requests, errors, CPU time, bandwidth, D1 query counts and R2 storage and operations come from the platform. Visitor geography and traffic come from Web Analytics. None of that needs application code, and none of it is duplicated here.

What the platform cannot answer is the product question — how many _generations_, what they cost, how many were drafts — because that lives in this application's own records. That gap is the only reason this folder exists.

## Known gap

`wrangler.jsonc` carries an `observability` block with `head_sampling_rate: 0.1`, but the live deployment is Cloudflare Pages, whose configuration in `wrangler.pages.json` has none. That setting is therefore inactive for the hosted site, and 10% sampling would show little at this traffic level in any case. Moving the block to the Pages configuration and raising the rate is a deployment change, not an application one.
