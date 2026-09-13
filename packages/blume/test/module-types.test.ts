import { describe, expect, it } from "bun:test";

import { runtimeModuleDeclarations } from "../src/astro/module-types.ts";
import { RUNTIME_MODULE_FILES } from "../src/astro/runtime-modules.ts";

describe("runtimeModuleDeclarations", () => {
  const out = runtimeModuleDeclarations("../../../src/generated/examples.ts");

  it("types the blume:data module from the public BlumeData type", () => {
    expect(out).toContain('declare module "blume:data"');
    expect(out).toContain('import("blume").BlumeData');
  });

  it("declares the blume:ask module the header imports", () => {
    expect(out).toContain('declare module "blume:ask"');
  });

  it("declares every runtime data module the generated pages import", () => {
    for (const id of RUNTIME_MODULE_FILES.keys()) {
      expect(out).toContain(`declare module ${JSON.stringify(id)}`);
    }
    // Typed at the boundary so the endpoints need no casts under `blume check`.
    expect(out).toContain('import("blume/ai/mcp/data.ts").McpData');
    expect(out).toContain(
      'import("blume/search/documents.ts").SearchDocument[]'
    );
  });

  it("types blume:examples from the generated examples module at the given path", () => {
    // The declaration file lives under `.astro/integrations/blume/`, so the
    // integration hands in the path from there to `src/generated/examples.ts`.
    expect(out).toContain(
      'typeof import("../../../src/generated/examples.ts").examples'
    );
  });
});
