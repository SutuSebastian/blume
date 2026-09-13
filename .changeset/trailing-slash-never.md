---
"blume": patch
---

Set Astro's `trailingSlash: "never"` in the generated config instead of hand-splicing a trailing-slash redirect into the Vercel routing config. Blume already treats the slashless URL as the one address for a page (canonicals, sitemap, hreflang), so Astro now enforces it too: `blume dev` answers `/guide/` with a 404 that names the setting, an on-demand server route redirects to `/guide`, and the Vercel adapter emits the same 308 route from the config that Blume used to splice by hand. Prerendered pages on static hosts are served exactly as before.
