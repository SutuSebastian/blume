---
"blume": patch
---

Improve Ask AI grounding for conversational follow-ups and long structured pages. A bare follow-up ("Why?", "And then?") retrieves from the earlier user turn, a short follow-up keeps that turn's best match in view behind its own, and a question that names its subject always leads. Excerpts now keep whole Markdown sections — heading, list, and code fence intact — chosen by how well they cover the question rather than by length, and pages are parsed once per endpoint instead of per request. A closing code fence must now be bare, as CommonMark requires, so a same-length fence line with an info string inside an open block no longer ends it.
