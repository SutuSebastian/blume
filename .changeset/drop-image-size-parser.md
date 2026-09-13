---
"blume": patch
---

Drop the `image-size` dependency. Its ICNS, HEIF/AVIF, and JXL parsers can be driven into an infinite loop by a crafted file with a zero-sized box or entry, which would hang `blume audit` or a build, and no patched release exists. The audit's Open Graph image checks now read dimensions through sharp, the image optimizer the build already ships, which covers the same formats and rejects malformed input instead of looping on it. SVG logos for the header and the OG card are measured by a small root-tag parser with the same rules as before: explicit `width`/`height`, a `viewBox` fallback, and CSS units at 96dpi.
