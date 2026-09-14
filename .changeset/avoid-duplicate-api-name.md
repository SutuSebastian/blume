---
"blume": patch
---

Stop repeating `API` in generated descriptions when the name already says it. API reference overview and operation meta descriptions no longer turn a spec titled `Example API` (or `Payments APIs`, `Example API v2`) into `Example API API`, and the generated `/openapi.json` title no longer doubles the word for a site titled the same way.
