import { describe, expect, it } from "bun:test";

import { apiNamePhrase } from "../src/core/api-name.ts";

describe("apiNamePhrase", () => {
  it("appends API to a bare name", () => {
    expect(apiNamePhrase("Petstore")).toBe("Petstore API");
  });

  it("leaves a name that already says API or APIs alone", () => {
    expect(apiNamePhrase("Petstore API")).toBe("Petstore API");
    expect(apiNamePhrase("Payments APIs")).toBe("Payments APIs");
    expect(apiNamePhrase("petstore api")).toBe("petstore api");
  });

  it("recognizes API anywhere in the name, not only at the end", () => {
    expect(apiNamePhrase("Petstore API v2")).toBe("Petstore API v2");
    expect(apiNamePhrase("Acme API (beta)")).toBe("Acme API (beta)");
    expect(apiNamePhrase("API Reference")).toBe("API Reference");
  });

  it("treats OpenAPI and AsyncAPI as product names, not API names", () => {
    expect(apiNamePhrase("OpenAPI")).toBe("OpenAPI API");
    expect(apiNamePhrase("Orders AsyncAPI")).toBe("Orders AsyncAPI API");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(apiNamePhrase("Pets API ")).toBe("Pets API");
    expect(apiNamePhrase("Pets API\n")).toBe("Pets API");
    expect(apiNamePhrase(" Pets ")).toBe("Pets API");
  });
});
