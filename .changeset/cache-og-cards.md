---
"blume": patch
---

Cache rendered OG cards between builds. Each card is stored under `node_modules/.cache/blume/og`, keyed by everything that decides its pixels (title, description, branding, palette, fonts, and the Blume version), so a rebuild renders only the cards whose inputs changed and reads the rest back from disk. The build log reports how many cards were reused, and cards no page asks for any more are pruned after each build.
