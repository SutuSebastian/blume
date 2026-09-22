---
"blume": patch
---

Advertise the agent-discovery head links from every page shell, not just the docs pages: a landing page, the generated 404, or any other custom page built on `PageLayout`, and the API-reference pages `ReferenceLayout` renders, now carry the same `describedby` links (`llms.txt`, `agent-readability.json`) and `rel="ai-catalog"` / `rel="ard"` manifest pair. All three layouts default `discovery` from the `blume:data` snapshot, so a custom page that never passes the prop is covered instead of silently dropping out of the "every page's head" promise; `discovery={null}` still drops the links for one page. A `PageLayout` homepage also advertises its `/index.md` Markdown mirror as a `text/markdown` alternate, matching the homepage HTTP `Link` header. The block lives in one shared `DiscoveryLinks` partial.
