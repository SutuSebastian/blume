---
"blume": patch
---

Keep the dev server up across page adds, removes, and folder renames. `blume dev` used to stop and recreate the Astro server on every route-set change; it now asks Astro's content layer to re-sync (`refreshContent`) and republishes the Markdown-negotiation routes in memory, so the generated config no longer changes with content and Astro never restarts in place for it. A moved page answers under its new route within a second, and editing an `<include>` partial re-syncs the store the same way instead of touching page mtimes.
