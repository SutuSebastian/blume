---
"blume": patch
---

Keep `<include>`-bearing Markdown pages fresh through Astro's documented loader context instead of patching the content store's writes. The collection loader now records a digest of each including page's partials in the collection's meta store and evicts the page's entry when that digest changes, so Astro's glob loader re-renders it on the next sync exactly as it would a new file. Same behavior on a partial edit in dev and on a warm-cache production build; no more replaying the store's private import bookkeeping.
