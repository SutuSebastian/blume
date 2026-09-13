---
"blume": patch
---

Write the deploy artifacts from the integration's `astro:build:done` hook instead of after `astro build` returns: the search index and hosted-provider sync, `llms.txt`, `sitemap.xml`, `robots.txt`, `agent-readability.json`, the `.well-known` discovery files, Agent Skills, and the platform `_redirects`/`_headers` files now land in the directory Astro reports as its client output during the build. `blume build` output is unchanged. An ejected app keeps producing all of them from plain `astro build` — its config tells the hook to scan the project — so `blume eject` no longer warns that they are lost.
