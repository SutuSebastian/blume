---
"blume": minor
---

Leave collapsed sidebar sections out of the page. In `group` and `page` display modes, a section that isn't open on the current page no longer ships its rows in that page's HTML; the empty disclosure or panel fetches a prerendered fragment on first open (prefetched on hover or focus, and kept for the visit), so a large site's pages carry only the open section instead of every section on every page. Group ids are now stable across tab-scoped views of the sidebar.
