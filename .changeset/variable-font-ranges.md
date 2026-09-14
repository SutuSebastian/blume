---
"blume": patch
---

Load the curated Google fonts that ship as variable fonts (every preset except IBM Plex Mono, IBM Plex Serif, and Space Mono) as one weight range, so each page declares one `@font-face` per style instead of one per weight — the same font files, a quarter of the inline font CSS. A configured `"100..900"` range now reaches Astro in the form it understands; it previously loaded nothing for that weight.
