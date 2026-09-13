---
"blume": patch
---

Opt Cloudflare server builds out of Astro sessions with `session: false` instead of configuring an in-memory session driver. Blume never reads `Astro.session`; the driver only existed to keep `@astrojs/cloudflare` from declaring a `SESSION` KV binding, which Astro's opt-out now does directly.
