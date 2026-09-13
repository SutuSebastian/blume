---
"blume": patch
---

Honor `Accept: text/markdown` and send the homepage agent-discovery `Link` header in `blume dev` when `deployment.base` is set. Astro's dev server rewrites the base off the URL before Blume's handler runs, so stripping it a second time left every request unmatched.
