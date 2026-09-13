---
"blume": patch
---

Default `<html lang>` and `dir` in every document shell to the locale Astro resolves from the URL (`Astro.currentLocale`), then the site's default locale. A custom `pages/` page or a Scalar reference page under `/fr/` rendered as `lang="en"` unless it passed `locale` itself; the content catch-all still passes the manifest's locale, which also covers fallback pages.
