import { describe, expect, it } from "bun:test";

import { cachedNavHtml } from "../src/components/layout/nav-cache.ts";
import type { NavNode } from "../src/core/types.ts";

const group = (label: string): NavNode => ({
  children: [],
  display: "flat",
  kind: "group",
  label,
});

describe("cachedNavHtml", () => {
  it("renders a subtree once per node and variant", async () => {
    const node = group("Guides");
    let renders = 0;
    const render = () => {
      renders += 1;
      return Promise.resolve(`<ul>${renders}</ul>`);
    };
    expect(await cachedNavHtml(node, "n.1|Back|Deprecated", render)).toBe(
      "<ul>1</ul>"
    );
    expect(await cachedNavHtml(node, "n.1|Back|Deprecated", render)).toBe(
      "<ul>1</ul>"
    );
    // Another variant of the same node (a different panel id, or another
    // locale's labels) is its own entry.
    expect(await cachedNavHtml(node, "n.2|Back|Deprecated", render)).toBe(
      "<ul>2</ul>"
    );
    // A different node object — a regenerated navigation — never hits.
    expect(
      await cachedNavHtml(group("Guides"), "n.1|Back|Deprecated", render)
    ).toBe("<ul>3</ul>");
    expect(renders).toBe(3);
  });

  it("shares one in-flight render between concurrent requests", async () => {
    const node = group("Reference");
    let renders = 0;
    const pending = Promise.withResolvers<string>();
    const render = () => {
      renders += 1;
      return pending.promise;
    };
    const first = cachedNavHtml(node, "v", render);
    const second = cachedNavHtml(node, "v", render);
    pending.resolve("<ul />");
    expect(await Promise.all([first, second])).toEqual(["<ul />", "<ul />"]);
    expect(renders).toBe(1);
  });

  it("always renders when disabled", async () => {
    const node = group("Concepts");
    let renders = 0;
    const render = () => {
      renders += 1;
      return Promise.resolve(`<ul>${renders}</ul>`);
    };
    expect(await cachedNavHtml(node, "v", render, false)).toBe("<ul>1</ul>");
    expect(await cachedNavHtml(node, "v", render, false)).toBe("<ul>2</ul>");
    // Disabled calls never populate the cache either.
    expect(await cachedNavHtml(node, "v", render)).toBe("<ul>3</ul>");
  });
});
