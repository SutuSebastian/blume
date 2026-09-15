---
"blume": patch
---

Paint code-block language icons from the theme instead of inlining an SVG in every block. A block now carries `data-icon="<slug>"` and the theme masks the brand path onto it, with one rule per language the site's Markdown uses, so a page with twenty TypeScript blocks no longer repeats the same 1 kB logo twenty times. Set icons rendered by the Icon component are deduplicated the same way, through a per-page sprite.
