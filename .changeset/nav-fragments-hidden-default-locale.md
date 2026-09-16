---
"blume": patch
---

Fix the grouped sidebar 404ing its deferred section fragments in `blume dev` on sites whose default locale is unprefixed (`i18n.hideDefaultLocalePrefix`, the default). Astro's i18n routing rejects any page URL that carries the default locale's code as a segment, so `/blume-nav/current/de/…` never resolved for a site with `defaultLocale: "de"`; those fragments now live under `default`, the same way the locale's pages drop the prefix.
