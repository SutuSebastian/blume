import { describe, expect, it } from "bun:test";

import {
  apiNotFoundResponse,
  buildNavigation,
  buildPage,
  buildPagesIndex,
  createSearchHandler,
  jsonResponse,
  navigationResponse,
  pageParams,
  pageResponse,
  pagesIndexResponse,
} from "../src/ai/api/handlers.ts";
import {
  API_BASE,
  API_NAVIGATION_PATH,
  API_PAGE_PATH,
  API_PAGES_PATH,
  API_SEARCH_PATH,
  OPENAPI_PATH,
  pageJsonPath,
  pageParam,
} from "../src/ai/api/paths.ts";
import {
  PROBLEM_TYPE,
  problem,
  problemResponse,
} from "../src/ai/api/problem.ts";
import type { McpData } from "../src/ai/mcp/data.ts";

const DATA: McpData = {
  base: "",
  documents: [
    {
      content:
        "Install Blume with your package manager, then run the dev server to preview the docs.",
      contentType: "doc",
      description: "How to install Blume",
      facets: { status: "stable" },
      locale: "en",
      route: "/guides/install",
      title: "Installation",
    },
    {
      content:
        "Configure themes, navigation, and search in blume.config.ts to customize the site.",
      contentType: "rfc",
      description: "Configuration reference",
      locale: "en",
      route: "/guides/config",
      title: "Configuration",
    },
    {
      content: "Welcome to the docs.",
      contentType: "doc",
      description: "",
      locale: "en",
      route: "/",
      title: "Home",
    },
  ],
  name: "Test Docs",
  navigation: {
    featured: [],
    selectors: [],
    sidebar: [
      {
        kind: "page",
        label: "Installation",
        pageId: "guides/install",
        route: "/guides/install",
      },
    ],
    tabs: [{ label: "Guides", path: "/guides/install" }],
  },
  pages: {
    "/": "# Home\n\nWelcome to the docs.",
    "/guides/config":
      "---\ntitle: Configuration\n---\n# Configuration\n\nConfigure it.",
    "/guides/install":
      "---\ntitle: Installation\n---\n# Installation\n\nInstall it.",
  },
  routes: [
    {
      contentType: "doc",
      indexable: true,
      lastModified: null,
      locale: "en",
      route: "/",
      title: "Home",
      version: "",
    },
    {
      contentType: "doc",
      description: "How to install Blume",
      facets: { status: "stable" },
      indexable: true,
      lastModified: "2024-01-02",
      locale: "en",
      route: "/guides/install",
      title: "Installation",
      version: "",
    },
    {
      contentType: "rfc",
      description: "Configuration reference",
      indexable: true,
      lastModified: null,
      locale: "en",
      route: "/guides/config",
      title: "Configuration",
      version: "",
    },
    {
      contentType: "doc",
      indexable: false,
      lastModified: null,
      locale: "en",
      route: "/landing",
      title: "Landing (no Markdown)",
      version: "",
    },
  ],
  site: "https://docs.example.com",
  version: "1.2.3",
};

/** A local snapshot: no site, served under a base path. */
const LOCAL: McpData = { ...DATA, base: "/docs", site: null };

/** A versioned snapshot, so entries carry `version`. */
const VERSIONED: McpData = { ...DATA, archivedVersions: ["v1"] };

const get = (path: string): Request =>
  new Request(`https://docs.example.com${path}`);

interface SearchBody {
  count: number;
  query: string;
  results: { route: string }[];
}

const routes = (body: SearchBody): string[] =>
  body.results.map((hit) => hit.route);

describe("paths", () => {
  it("nests the docs API under /api/docs beside the Ask endpoint", () => {
    expect(API_BASE).toBe("/api/docs");
    expect(API_PAGES_PATH).toBe("/api/docs/pages.json");
    expect(API_PAGE_PATH).toBe("/api/docs/pages/{route}.json");
    expect(API_NAVIGATION_PATH).toBe("/api/docs/navigation.json");
    expect(API_SEARCH_PATH).toBe("/api/docs/search");
    expect(OPENAPI_PATH).toBe("/openapi.json");
  });
});

describe("problem details", () => {
  it("carries the RFC 9457 members and defaults the type to about:blank", () => {
    const body = problem({
      code: "X",
      detail: "d",
      resolution: "r",
      status: 404,
      title: "t",
    });
    expect(body).toStrictEqual({
      code: "X",
      detail: "d",
      resolution: "r",
      status: 404,
      title: "t",
      type: "about:blank",
    });
    expect(
      problem({
        code: "X",
        detail: "d",
        instance: "/x",
        links: [{ href: "/", label: "Home" }],
        resolution: "r",
        status: 400,
        title: "t",
        type: "https://example.com/problems/x",
      })
    ).toMatchObject({
      instance: "/x",
      links: [{ href: "/", label: "Home" }],
      type: "https://example.com/problems/x",
    });
  });

  it("serves a problem with its status and media type", async () => {
    const response = problemResponse({
      code: "GONE",
      detail: "d",
      resolution: "r",
      status: 410,
      title: "t",
    });
    expect(response.status).toBe(410);
    expect(response.headers.get("content-type")).toBe(
      `${PROBLEM_TYPE}; charset=utf-8`
    );
    expect(await response.json()).toMatchObject({ code: "GONE", status: 410 });
  });

  it("jsonResponse pretty-prints with a trailing newline and a status", async () => {
    const response = jsonResponse(DATA.navigation, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(await response.text()).toBe(
      `${JSON.stringify(DATA.navigation, null, 2)}\n`
    );
    expect(jsonResponse(DATA.navigation).status).toBe(200);
  });
});

describe("page index", () => {
  it("lists every route with its rendered, Markdown, and JSON URLs", () => {
    const index = buildPagesIndex(DATA);
    expect(index.count).toBe(4);
    expect(index.generator).toBe("blume@1.2.3");
    expect(index.site).toBe("https://docs.example.com");
    expect(index.pages[0]).toStrictEqual({
      contentType: "doc",
      json: "https://docs.example.com/api/docs/pages/index.json",
      lastModified: null,
      locale: "en",
      markdownUrl: "https://docs.example.com/index.md",
      route: "/",
      title: "Home",
      url: "https://docs.example.com/",
    });
    expect(index.pages[1]).toStrictEqual({
      contentType: "doc",
      description: "How to install Blume",
      facets: { status: "stable" },
      json: "https://docs.example.com/api/docs/pages/guides/install.json",
      lastModified: "2024-01-02",
      locale: "en",
      markdownUrl: "https://docs.example.com/guides/install.md",
      route: "/guides/install",
      title: "Installation",
      url: "https://docs.example.com/guides/install",
    });
  });

  it("keeps URLs root-relative under the base path without a site", () => {
    const [home, install] = buildPagesIndex(LOCAL).pages;
    expect(home?.url).toBe("/docs");
    expect(home?.json).toBe("/docs/api/docs/pages/index.json");
    expect(install?.markdownUrl).toBe("/docs/guides/install.md");
  });

  it("stamps the version on a versioned site only", () => {
    expect(buildPagesIndex(DATA).pages[0]).not.toHaveProperty("version");
    expect(buildPagesIndex(VERSIONED).pages[0]?.version).toBe("");
  });

  it("serves the index as JSON", async () => {
    const response = pagesIndexResponse(DATA);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(4);
  });
});

describe("page documents", () => {
  it("derives the path segment from the route, index for home", () => {
    expect(pageParam("/")).toBe("index");
    expect(pageParam("/guides/install")).toBe("guides/install");
    expect(pageJsonPath("/")).toBe("/api/docs/pages/index.json");
    expect(pageJsonPath("/guides/install")).toBe(
      "/api/docs/pages/guides/install.json"
    );
  });

  it("emits one static path per route that has Markdown", () => {
    expect(pageParams(DATA)).toStrictEqual([
      { params: { route: "index" }, props: { route: "/" } },
      {
        params: { route: "guides/install" },
        props: { route: "/guides/install" },
      },
      {
        params: { route: "guides/config" },
        props: { route: "/guides/config" },
      },
    ]);
  });

  it("returns the index entry plus the Markdown body", () => {
    expect(buildPage(DATA, "/guides/config")).toMatchObject({
      contentType: "rfc",
      markdown:
        "---\ntitle: Configuration\n---\n# Configuration\n\nConfigure it.",
      route: "/guides/config",
    });
    expect(buildPage(DATA, "/nope")).toBeNull();
    // A listed route without Markdown has no JSON twin either.
    expect(buildPage(DATA, "/landing")).toBeNull();
  });

  it("serves a page, or a problem document for an unknown route", async () => {
    const found = pageResponse(DATA, "/guides/install");
    expect(found.status).toBe(200);
    const page = await found.json();
    expect(page.title).toBe("Installation");

    const missing = pageResponse(DATA, "/nope");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toBe(
      `${PROBLEM_TYPE}; charset=utf-8`
    );
    expect(await missing.json()).toStrictEqual({
      code: "PAGE_NOT_FOUND",
      detail: 'No documentation page has the route "/nope".',
      instance: "https://docs.example.com/api/docs/pages/nope.json",
      resolution:
        "List every page at https://docs.example.com/api/docs/pages.json, or discover the API through https://docs.example.com/openapi.json.",
      status: 404,
      title: "Page not found",
      type: "about:blank",
    });
  });
});

describe("navigation", () => {
  it("serves the default navigation tree", async () => {
    expect(buildNavigation(DATA)).toBe(DATA.navigation);
    const response = navigationResponse(DATA);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tabs).toStrictEqual([
      { label: "Guides", path: "/guides/install" },
    ]);
  });
});

describe("search endpoint", () => {
  const search = createSearchHandler(DATA);

  /** The parsed body of a search request. */
  const searchBody = async (path: string): Promise<SearchBody> => {
    const response = await search(get(path));
    const body: SearchBody = await response.json();
    return body;
  };

  it("rejects a missing or blank query with a problem document", async () => {
    for (const path of ["/api/docs/search", "/api/docs/search?q=%20"]) {
      // Sequential on purpose: each iteration asserts on its own response.
      // oxlint-disable-next-line no-await-in-loop
      const response = await search(get(path));
      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toBe(
        `${PROBLEM_TYPE}; charset=utf-8`
      );
      // oxlint-disable-next-line no-await-in-loop
      expect(await response.json()).toMatchObject({
        code: "MISSING_QUERY",
        instance: "/api/docs/search",
        resolution:
          "Repeat the request with ?q=<search terms>, e.g. https://docs.example.com/api/docs/search?q=install.",
        status: 400,
      });
    }
  });

  it("returns ranked hits with the query echoed back", async () => {
    const response = await search(get("/api/docs/search?q=install"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8"
    );
    const body = await response.json();
    expect(body.query).toBe("install");
    expect(body.count).toBe(body.results.length);
    expect(body.results[0]).toMatchObject({
      excerpt: "How to install Blume",
      route: "/guides/install",
      title: "Installation",
      url: "https://docs.example.com/guides/install",
    });
  });

  it("honors limit, content types (comma-separated or repeated), and facet filters", async () => {
    const limited = await searchBody("/api/docs/search?q=docs&limit=1");
    expect(limited.results).toHaveLength(1);

    const rfc = await searchBody(
      "/api/docs/search?q=configure&contentTypes=rfc,blog"
    );
    expect(routes(rfc)).toStrictEqual(["/guides/config"]);
    const repeated = await searchBody(
      "/api/docs/search?q=configure&contentTypes=rfc&contentTypes=blog"
    );
    expect(repeated.results).toHaveLength(1);

    const faceted = await searchBody(
      "/api/docs/search?q=docs&filters[status]=stable"
    );
    expect(routes(faceted)).toStrictEqual(["/guides/install"]);
    // A malformed filter key is ignored, not an error.
    const loose = await searchBody("/api/docs/search?q=install&filters[]=x");
    expect(loose.count).toBeGreaterThan(0);
  });

  it("scopes by locale and passes version through", async () => {
    const french = await searchBody("/api/docs/search?q=install&locale=fr");
    expect(french.results).toStrictEqual([]);
    // Unversioned site: `version` is accepted and ignored.
    const versioned = await searchBody(
      "/api/docs/search?q=install&locale=en&version=v9"
    );
    expect(versioned.count).toBeGreaterThan(0);
  });
});

describe("API catch-all", () => {
  it("answers an unknown API route with absolute recovery links", async () => {
    const response = apiNotFoundResponse(get("/api/nope?x=1"), {
      base: "",
      site: "https://docs.example.com",
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      `${PROBLEM_TYPE}; charset=utf-8`
    );
    expect(await response.json()).toStrictEqual({
      code: "API_ROUTE_NOT_FOUND",
      detail: "No API route exists at /api/nope.",
      instance: "/api/nope",
      links: [
        {
          href: "https://docs.example.com/openapi.json",
          label: "OpenAPI description",
        },
        {
          href: "https://docs.example.com/api/docs/pages.json",
          label: "Page index",
        },
      ],
      resolution:
        "Discover the available operations through the OpenAPI description at https://docs.example.com/openapi.json, or list every page at https://docs.example.com/api/docs/pages.json.",
      status: 404,
      title: "API route not found",
      type: "about:blank",
    });
  });

  it("keeps links root-relative under the base path without a site", async () => {
    const body = await apiNotFoundResponse(get("/docs/api/nope"), {
      base: "/docs",
      site: null,
    }).json();
    expect(body.links).toStrictEqual([
      { href: "/docs/openapi.json", label: "OpenAPI description" },
      { href: "/docs/api/docs/pages.json", label: "Page index" },
    ]);
  });
});
