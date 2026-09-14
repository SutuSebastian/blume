import { describe, expect, it } from "bun:test";

import { hasMermaidFence } from "../src/markdown/mermaid.ts";

describe("hasMermaidFence", () => {
  it("finds a mermaid fence opener at the start of a line", () => {
    expect(
      hasMermaidFence("# Title\n\n```mermaid\ngraph TD; A-->B\n```\n")
    ).toBe(true);
    expect(hasMermaidFence("~~~mermaid\nflowchart LR\n~~~")).toBe(true);
    // Indented (inside a <Steps> item) and long fences count too.
    expect(hasMermaidFence("  ````mermaid\n  pie\n  ````")).toBe(true);
  });

  it("ignores other fences and the word elsewhere", () => {
    expect(hasMermaidFence("```ts\nconst mermaid = 1;\n```\n")).toBe(false);
    expect(
      hasMermaidFence("Mermaid diagrams: see ```mermaidish``` fences")
    ).toBe(false);
    expect(hasMermaidFence("")).toBe(false);
  });
});
