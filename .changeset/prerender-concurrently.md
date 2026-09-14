---
"blume": patch
---

Prerender pages concurrently. The build now renders up to eight pages at once (one per available CPU below that), so the main thread renders the next page while a page's OG card renders on a native thread and its HTML is written to disk, instead of idling behind each page's off-thread work. A 1,400-page site's route generation phase runs in roughly half the time.
