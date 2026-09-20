---
"blume": patch
---

Write the Pagefind index files from the build itself instead of asking Pagefind to write them. Pagefind's service mode reports the files as written while the bytes are still buffered, and closing the backend right after could leave a truncated `pagefind-entry.json` or UI asset on a busy CI host, so search failed to load on the deployed site. The build now fetches the finished index and writes every file to disk before Pagefind shuts down.
