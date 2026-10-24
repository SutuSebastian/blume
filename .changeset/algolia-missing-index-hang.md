---
"blume": patch
---

Fix the Algolia search sync hanging the build when the configured index doesn't exist. `replaceAllObjects` starts by copying the index's settings into a temporary one, and a copy from a missing index never publishes, so the sync polled it for about an hour with no error until the CI platform killed the build. A missing index is now created by uploading the records straight into it, and every Algolia task the sync waits on is polled for about seven minutes at most, so a stuck one fails the build with `BLUME_SEARCH_SYNC_FAILED` instead of hanging it. Separately, an index whose settings were never set answers `null` for them, which crashed the sync after uploading the records with `Cannot read properties of null (reading 'map')`; unset settings now read as empty, and a never-set `attributeForDistinct` counts as unset.
