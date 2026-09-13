---
"blume": patch
---

Read provider secrets through Astro's `getSecret()` from `astro:env/server` instead of `process.env`: the Ask AI endpoint's provider key (and the AI Gateway key, now passed to the gateway provider explicitly), the Mixedbread search endpoint's key, and `<GithubInfo>`'s `GITHUB_TOKEN`. Each adapter supplies secrets its own way, so a Cloudflare deployment's Worker bindings now reach these endpoints the same as environment variables do on Node and Vercel.
