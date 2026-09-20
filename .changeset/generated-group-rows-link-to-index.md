---
"blume": patch
---

A generated sidebar group whose folder has an `index` page now links its row to that page, the way an explicit sidebar group's `root` already did. Clicking the section name in the sidebar opens the section's landing page instead of only toggling the disclosure, in every display mode. The index page keeps its own row beneath the header; set `sidebar.hidden: true` on it to drop the duplicate label, and the header stays the link to it.
