---
"blume": patch
---

Show Blume's config and content errors in the browser error overlay during `blume dev` on published installs. The dev-server handle was a module-level variable, and the CLI bundle and the copy of the integration Vite loads are separate module instances, so the overlay only ever worked inside the Blume repository itself. The handle now lives on `globalThis`, like the runtime data registry.
