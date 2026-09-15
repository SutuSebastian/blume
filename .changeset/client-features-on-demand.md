---
"blume": minor
---

Bundle Mermaid and the EPUB generator only for sites that use them. Both were dynamic imports, so they never loaded on a page that didn't need them, but they were still built on every `blume build` — over 3 MB of client chunks (ELK, Cytoscape, KaTeX, every diagram type) that most sites never serve, and most of the client build's memory. The generated runtime now decides at generation time whether any page has a mermaid fence and whether `export.epub` is on, and leaves the libraries out of the module graph otherwise; the dev server also stops pre-bundling them for sites that don't need them.
