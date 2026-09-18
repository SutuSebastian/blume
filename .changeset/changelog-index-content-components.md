---
"blume": patch
---

Render callouts, steps, and every other Blume component inside changelog entries on the `/changelog` index. The index rendered each entry's MDX body without the component map the docs pages use, so a `:::info` directive or `<Steps>` in a release note failed the build (and the dev route) with "Expected component `Callout` to be defined".
