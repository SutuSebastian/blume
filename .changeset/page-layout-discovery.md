---
"blume": patch
---

Advertise the agent-discovery head links from `PageLayout`, so a landing page, the generated 404, or any other custom page built on it carries the same `describedby` links (`llms.txt`, `agent-readability.json`) and `rel="ai-catalog"` / `rel="ard"` manifest pair the docs pages do. Both `PageLayout` and `RootLayout` now default `discovery` from the `blume:data` snapshot, so a custom page that never passes the prop is covered instead of silently dropping out of the "every page's head" promise.
