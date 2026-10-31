---
tags: [workflows, comfy, agents, setup]
summary: Read-only Comfy Cloud node and model checks from Settings, HTTP, MCP and CLI, with explicit metadata and execution limits.
---

# Check Comfy Cloud workflows

In **Settings → Studio setup**, connect your Comfy key and choose **Check Comfy
Cloud workflows**. This reads the account's node catalogue once. Opening Settings,
listing templates, or changing models does not start a Cloud check. The action
does not upload media, submit a workflow, change the run location, or reserve a
generation quote.

The same read is available to external and studio-started agents:

```sh
genobi workflows --input '{"checkCloud":true}'
```

MCP: `genobi_workflows {"checkCloud":true}`. HTTP:
`GET /api/settings/workflows?check=cloud` returns the usual catalogue and a
`cloud` report. `checkLocal` remains the local ComfyUI check; choose one check
per tool call. The local MCP/CLI uses the studio's connected Comfy key. The
hosted HTTP route requires the visitor's transient `x-byo-key` header. It
does not make the loopback MCP server a remote hosted MCP service.

## What the result establishes

| Status                | Meaning                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `compatible`          | Every node class in the pinned graph is present and each declared model slot's value appears in its loader's choices. |
| `blocked`             | A graph node or a model slot's value is missing from the catalogue.                                                   |
| `unknown`             | A node schema or model choice list could not be inspected.                                                            |
| `deployment-required` | This template explicitly requires a custom Comfy deployment; matching Cloud metadata does not change its destination. |

The report names repository-defined node classes and model **slots**, never the
account's private model catalogue or paths. `checkedAt` records the metadata read,
not a successful model run. Missing or malformed upstream responses remain an
error, never an empty successful report. The UI clears its result when it detects
a changed page key or saved connection revision, and ignores an old response
after that change. Reopen Settings after replacing a saved key in another window
to refresh its connection state.

Metadata compatibility is a useful check before spending. It does **not** test
graph input types, uploaded file compatibility, model loading, GPU memory,
generated motion, reference adherence, sound quality, or an entire audiovisual
workflow. Runtime graph variants, such as Klein image editing, need their own
execution validation. A pinned graph's text-to-image result is not evidence for
every graph variant.

## Cloud, Router and deployments

- **Comfy Cloud** runs workflows against its managed catalogue. The current
  account's metadata is more useful than a historic inventory. User-installed
  custom node packs require another environment.
- **Comfy Router** calls a model directly and does not execute an arbitrary
  workflow. This Cloud check does not establish Router model availability.
- **Comfy API deployments** run the nodes and models in their pinned Build.
  Registering an endpoint does not prove its Build can execute a template.
  Check the Build and run the relevant qualification cases separately.

The simple AKUSPACE text-to-video template uses a core LoRA loader and an imported
LoRA. It is distinct from the aligned-reference and scene-acoustics deployment
graphs that need custom nodes. A successful check of the first cannot validate
the others.

## Implementation boundary

Both Express and the hosted Worker use `server/comfy-cloud-check.ts`. Discovery
uses the documented Cloud-specific `GET https://cloud.comfy.org/api/object_info`
with `X-API-Key`; execution remains on the existing SDK v2 client. The discovery
host is fixed, redirects are refused, the response has a 30-second deadline and
a 16 MiB streamed byte cap, and checks use the existing account-read rate limit.
Nothing caches or persists a credential or the account's raw catalogue.

The local adapter takes an explicit visitor key first, otherwise its Comfy key
slot. A supplied BFL or invalid key is rejected without silently switching
accounts. Hosted uses the supplied visitor key only. The reported catalogue is
scoped to templates offered by the current runtime. This read neither changes
the existing paid-action approval boundary nor adds background job completion.

## Sources and verification

The provider contract was checked on 31 October 2026:

- [Cloud-specific v1 discovery and authentication](https://docs.comfy.org/development/cloud/overview).
- [Object Info endpoint](https://docs.comfy.org/development/cloud/api-reference#object-info).
- [Portable API v2 surfaces and output lifetimes](https://docs.comfy.org/api-reference/v2/overview).
- [Custom nodes on Cloud](https://support.comfy.org/articles/6791455062-custom-nodes-on-cloud).

Fixture tests cover missing nodes/models, unknown schemas, deployment restrictions,
key selection, redirects, response bounds, account errors and both HTTP adapters.
They perform no authenticated Cloud request and submit no GPU job. A real account
check and the GPU qualification cases are separate evidence.
