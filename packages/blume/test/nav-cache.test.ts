import { describe, expect, it } from "bun:test";

import { cachedNavSubtree } from "../src/components/layout/nav-cache.ts";
import type { CachedNavSubtree } from "../src/components/layout/nav-cache.ts";
import type { NavNode } from "../src/core/types.ts";

const group = (label: string): NavNode => ({
  children: [],
  display: "flat",
  kind: "group",
  label,
});

const subtree = (html: string): CachedNavSubtree => ({ html, icons: [] });

const htmlOf = async (entry: Promise<CachedNavSubtree>): Promise<string> => {
  const { html } = await entry;
  return html;
};

describe("cachedNavSubtree", () => {
  it("renders a subtree once per node and variant", async () => {
    const node = group("Guides");
    let renders = 0;
    const render = () => {
      renders += 1;
      return Promise.resolve(subtree(`<ul>${renders}</ul>`));
    };
    const variant = "n.1|Back|Deprecated";
    expect(await htmlOf(cachedNavSubtree(node, variant, render))).toBe(
      "<ul>1</ul>"
    );
    expect(await htmlOf(cachedNavSubtree(node, variant, render))).toBe(
      "<ul>1</ul>"
    );
    // Another variant of the same node (a different panel id, or another
    // locale's labels) is its own entry.
    expect(
      await htmlOf(cachedNavSubtree(node, "n.2|Back|Deprecated", render))
    ).toBe("<ul>2</ul>");
    // A different node object — a regenerated navigation — never hits.
    expect(
      await htmlOf(cachedNavSubtree(group("Guides"), variant, render))
    ).toBe("<ul>3</ul>");
    expect(renders).toBe(3);
  });

  it("keeps the sprite symbols a cached subtree references", async () => {
    // A page reusing the HTML never rendered those icons itself, so the
    // symbols ride along for it to register into its own sprite.
    const node = group("Reference");
    const icons: CachedNavSubtree["icons"] = [
      ["blume-i-chevron-right", { body: "<path/>", viewBox: "0 0 24 24" }],
    ];
    const render = () =>
      Promise.resolve({ html: '<use href="#blume-i-chevron-right"/>', icons });
    await cachedNavSubtree(node, "v", render);
    const hit = await cachedNavSubtree(node, "v", render);
    expect(hit.icons).toBe(icons);
  });

  it("shares one in-flight render between concurrent requests", async () => {
    const node = group("Reference");
    let renders = 0;
    const pending = Promise.withResolvers<CachedNavSubtree>();
    const render = () => {
      renders += 1;
      return pending.promise;
    };
    const first = cachedNavSubtree(node, "v", render);
    const second = cachedNavSubtree(node, "v", render);
    pending.resolve(subtree("<ul />"));
    const settled = await Promise.all([first, second]);
    expect(settled.map((entry) => entry.html)).toEqual(["<ul />", "<ul />"]);
    expect(renders).toBe(1);
  });

  it("always renders when disabled", async () => {
    const node = group("Concepts");
    let renders = 0;
    const render = () => {
      renders += 1;
      return Promise.resolve(subtree(`<ul>${renders}</ul>`));
    };
    expect(await htmlOf(cachedNavSubtree(node, "v", render, false))).toBe(
      "<ul>1</ul>"
    );
    expect(await htmlOf(cachedNavSubtree(node, "v", render, false))).toBe(
      "<ul>2</ul>"
    );
    // Disabled calls never populate the cache either.
    expect(await htmlOf(cachedNavSubtree(node, "v", render))).toBe(
      "<ul>3</ul>"
    );
  });
});
