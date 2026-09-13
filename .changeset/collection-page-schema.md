---
"blume": patch
---

Declare Blume's page front-matter schema on the generated content collections, so `entry.data` in the runtime is typed and normalized the same way the scan's page metadata is. Custom front-matter keys pass through, and a page the scan already dropped as invalid resolves to defaults instead of failing Astro's content sync.
