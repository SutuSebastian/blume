---
"blume": patch
---

Read the Vercel function bundle audit's imports with `es-module-lexer` instead of a text scan, so code samples inside the MCP data chunk (a page quoting `import { config } from 'dotenv'` or `await import('bcryptjs')`) no longer fail `blume build` as missing packages.
