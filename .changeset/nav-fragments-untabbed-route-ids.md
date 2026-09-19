---
"blume": patch
---

Fix grouped sidebar sections 404ing on first open when header tabs are configured. On a page outside every tab, the sidebar hides the tab-owned sections, and that pruned view lost its groups' stable ids, so their deferred fragments were requested by a positional name no route serves. Untouched groups are now kept by identity (which also keeps their build-time render cache warm). A container that loses a nested tab section renders in full instead of deferring, since a shared fragment would show the section again.
