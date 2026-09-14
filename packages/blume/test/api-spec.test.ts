import { describe, expect, it } from "bun:test";

import { buildApiSpec } from "../src/ai/api/spec.ts";
import type { ApiSpecInput, Operation } from "../src/ai/api/spec.ts";

const FULL: ApiSpecInput = {
  agentReadability: true,
  base: "",
  description: "Docs for Acme.",
  llmsTxt: true,
  mcpRoute: "/mcp",
  name: "Acme",
  search: true,
  site: "https://docs.example.com",
  version: "1.2.3",
};

const MINIMAL: ApiSpecInput = {
  agentReadability: false,
  base: "",
  llmsTxt: false,
  mcpRoute: null,
  name: "Acme",
  search: false,
  site: null,
  version: "1.2.3",
};

/** Every operation in the document, keyed by `operationId`. */
const operations = (
  spec: ReturnType<typeof buildApiSpec>
): Record<string, Operation> =>
  Object.fromEntries(
    Object.values(spec.paths)
      .flatMap((item) => [item.get, item.post])
      .filter((operation) => operation !== undefined)
      .map((operation) => [operation.operationId, operation])
  );

describe("buildApiSpec", () => {
  it("does not repeat API when the site name already includes it", () => {
    const spec = buildApiSpec({ ...MINIMAL, name: "Acme API" });
    expect(spec.info.title).toBe("Acme API");
    expect(spec.info.description).toStartWith(
      "Read-only JSON API over the Acme API documentation."
    );
  });

  it("describes the whole agent-facing surface, one operationId per operation", () => {
    const spec = buildApiSpec(FULL);
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toMatchObject({
      title: "Acme API",
      version: "1.2.3",
      "x-generator": "blume@1.2.3",
    });
    expect(spec.servers).toStrictEqual([
      { description: "Acme", url: "https://docs.example.com" },
    ]);
    expect(spec.externalDocs).toStrictEqual({
      description: "Acme documentation",
      url: "https://docs.example.com/",
    });
    expect(spec.security).toStrictEqual([]);
    expect(Object.keys(spec.paths)).toStrictEqual([
      "/api/docs/pages.json",
      "/api/docs/pages/{route}.json",
      "/api/docs/navigation.json",
      "/api/docs/search",
      "/{route}.md",
      "/llms.txt",
      "/llms-full.txt",
      "/agent-readability.json",
      "/mcp",
    ]);
    const ops = operations(spec);
    expect(Object.keys(ops).toSorted()).toStrictEqual([
      "getAgentReadability",
      "getLlmsFullTxt",
      "getLlmsTxt",
      "getNavigation",
      "getPage",
      "getPageMarkdown",
      "listPages",
      "mcp",
      "searchDocs",
    ]);
    // Every operation is described, and every tag it uses is declared.
    const declared = new Set(spec.tags.map((tag) => tag.name));
    for (const operation of Object.values(ops)) {
      expect(operation.description).toBeTruthy();
      expect(operation.summary).toBeTruthy();
      expect(operation.tags).toHaveLength(1);
      expect(declared.has(operation.tags[0] ?? "")).toBe(true);
    }
    expect(spec.info.description).toContain(
      "Read-only JSON API over the Acme documentation: Docs for Acme."
    );
  });

  it("types the search parameters and the problem-details error shape", () => {
    const spec = buildApiSpec(FULL);
    const search = spec.paths["/api/docs/search"]?.get;
    expect(
      search?.parameters?.map((parameter) => parameter.name)
    ).toStrictEqual([
      "q",
      "limit",
      "contentTypes",
      "locale",
      "version",
      "filters",
    ]);
    expect(search?.parameters?.[0]?.required).toBe(true);
    expect(search?.parameters?.[5]?.style).toBe("deepObject");
    expect(Object.keys(search?.responses ?? {})).toStrictEqual([
      "200",
      "400",
      "default",
    ]);
    const { schemas } = spec.components;
    expect(schemas.Problem.required).toStrictEqual([
      "code",
      "detail",
      "resolution",
      "status",
      "title",
      "type",
    ]);
    expect(Object.keys(schemas).toSorted()).toStrictEqual([
      "JsonRpcRequest",
      "JsonRpcResponse",
      "NavLink",
      "NavNode",
      "NavSelector",
      "NavTab",
      "Navigation",
      "Page",
      "PageSummary",
      "PagesIndex",
      "Problem",
      "SearchHit",
      "SearchResponse",
    ]);
  });

  it("omits the surfaces a build does not serve", () => {
    const spec = buildApiSpec(MINIMAL);
    expect(Object.keys(spec.paths)).toStrictEqual([
      "/api/docs/pages.json",
      "/api/docs/pages/{route}.json",
      "/api/docs/navigation.json",
      "/{route}.md",
    ]);
    expect(spec.tags.map((tag) => tag.name)).toStrictEqual([
      "Pages",
      "Navigation",
      "Markdown",
    ]);
    expect(spec.servers).toStrictEqual([{ description: "Acme", url: "/" }]);
    expect(spec).not.toHaveProperty("externalDocs");
    expect(spec.info.description).toContain(
      "Read-only JSON API over the Acme documentation."
    );
  });

  it("layers deployment.base into the server URL, with or without a site", () => {
    expect(buildApiSpec({ ...MINIMAL, base: "/docs" }).servers).toStrictEqual([
      { description: "Acme", url: "/docs" },
    ]);
    const hosted = buildApiSpec({
      ...FULL,
      base: "/docs",
      site: "https://acme.com/",
    });
    expect(hosted.servers).toStrictEqual([
      { description: "Acme", url: "https://acme.com/docs" },
    ]);
    expect(hosted.externalDocs).toMatchObject({ url: "https://acme.com/docs" });
  });

  it("documents the MCP endpoint at its configured route", () => {
    const spec = buildApiSpec({ ...MINIMAL, mcpRoute: "/docs-mcp" });
    expect(Object.keys(spec.paths)).toContain("/docs-mcp");
    expect(operations(spec).mcp?.tags).toStrictEqual(["MCP"]);
  });
});
