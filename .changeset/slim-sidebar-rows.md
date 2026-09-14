---
"blume": patch
---

Shrink the sidebar's per-page cost. Every page's HTML carries the whole sidebar, so on a large site the sidebar was most of every page: each row now renders as a single theme utility class (`blume-nav-link`) instead of a dozen Tailwind classes, a bare row drops its inner spans, and groups that don't contain the current page are rendered once per build and reused across pages. A 1,400-page site's pages go from about 570 kB to under 190 kB each, and the build's HTML output shrinks and renders accordingly.
