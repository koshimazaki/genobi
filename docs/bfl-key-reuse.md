---
tags: [studio, bfl, backend]
summary: Explicitly reuse a BFL Dashboard Keychain key in the local studio.
---

# Reuse a BFL Dashboard key

In local **Settings → BFL key**, Genobi checks whether BFL Dashboard has a
macOS Keychain entry. This lookup reads metadata only. If found, **Use BFL
Dashboard key** copies it into Genobi's existing BFL slot without displaying
the key or sending it to the browser. The Dashboard does not need to be running.

This is an explicit connection: compatible FLUX models and upscales then use
BFL credits. Comfy-only models keep Comfy. Opening Settings does not activate
the key, change the provider or authorize generation.

Genobi keeps its own Keychain copy. Replacing the Dashboard key later does not
silently change Genobi's key; use the action again to copy the replacement.
Removing it in Genobi leaves Dashboard's entry intact and does not reconnect
automatically. Existing runs block replacement by a different key until their
outputs are saved. An environment `BFL_API_KEY` continues to take precedence.

The default source service is `BFL Dashboard FLUX API Key`, using the current
user's account name. If Dashboard uses custom `BFL_KEYCHAIN_SERVICE` or
`BFL_KEYCHAIN_ACCOUNT`, give the Genobi server those same selectors. Non-macOS
and hosted clients retain their existing key-entry setup.

The local routes are `GET /api/keys/bfl/dashboard` (availability only) and
`PUT /api/keys/bfl/dashboard` (owner-triggered reuse). The latter shares the
normal slot lock, validation, in-flight guard and save/revision path. Marked
agent sessions cannot invoke it. No provider request is made by either route.
