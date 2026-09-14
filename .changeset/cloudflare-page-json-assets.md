---
"blume": patch
---

Serve the prerendered per-page JSON documents on Cloudflare server builds whose requests run through the Worker: the wrapper answers them from the asset binding (conditional revalidations included) instead of letting Astro hand them to the `/api/` catch-all, and `.json` files stay on the static path under a deployment base or the coarse worker-first fallback.
