---
"blume": patch
---

Add `ai.ask.headers` to send static request headers to the Ask AI provider on every backend (gateway, OpenRouter, and the OpenAI-compatible providers), so a shared LLM backend can identify the caller without an external endpoint or an eject.
