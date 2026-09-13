import { describe, expect, it } from "bun:test";

import {
  pageDirection,
  pageLocale,
} from "../src/components/layout/page-locale.ts";

const i18n = {
  defaultLocale: "en",
  locales: [
    { code: "en", dir: "ltr" as const },
    { code: "ar", dir: "rtl" as const },
  ],
};

describe("pageLocale", () => {
  it("prefers the page's own locale over what Astro resolved", () => {
    // The content catch-all passes the manifest's locale, which also covers
    // fallback pages Astro's URL-based resolution can't know about.
    expect(pageLocale(i18n, "ar", "en")).toBe("ar");
  });

  it("falls back to Astro.currentLocale for pages without one", () => {
    expect(pageLocale(i18n, undefined, "ar")).toBe("ar");
  });

  it("falls back to the site default when Astro resolved none", () => {
    // Under `prefixDefaultLocale: true` an unprefixed custom page has no
    // locale segment for Astro to resolve.
    expect(pageLocale(i18n)).toBe("en");
  });

  it("is `en` on a site without i18n", () => {
    expect(pageLocale(null)).toBe("en");
  });
});

describe("pageDirection", () => {
  it("reads the locale's configured direction", () => {
    expect(pageDirection(i18n, "ar")).toBe("rtl");
    expect(pageDirection(i18n, "en")).toBe("ltr");
  });

  it("defaults to ltr for an unknown locale or no i18n", () => {
    expect(pageDirection(i18n, "fr")).toBe("ltr");
    expect(pageDirection(null, "en")).toBe("ltr");
  });
});
