---
"blume": patch
---

Declare the `blume:*` virtual modules through Astro's `injectTypes` hook instead of a generated `src/env.d.ts`. The declarations now live under `.astro/integrations/blume/` and are referenced from Astro's own `types.d.ts`, so every project that mounts the integration — the hidden runtime and an ejected app alike — gets them without a hand-written file. A project `tsconfig.json` no longer needs `.blume/src/env.d.ts` in its `include`.
