import { describe, expect, it } from "bun:test";

import {
  createIconSprite,
  iconSpriteFor,
  iconSymbolId,
  referencedIconSymbols,
  registerIconSymbol,
  renderIconSprite,
} from "../src/components/icon-sprite.ts";

const arrow = { body: '<path d="M5 12h14"/>', viewBox: "0 0 24 24" };

describe("icon sprite registry", () => {
  it("lives on the request locals and is created once", () => {
    const locals = {};
    expect(iconSpriteFor(locals)).toBeUndefined();
    const sprite = createIconSprite(locals);
    expect(iconSpriteFor(locals)).toBe(sprite);
    // A second shell in the same request joins the registry.
    expect(createIconSprite(locals)).toBe(sprite);
  });

  it("registers a symbol once under a safe id", () => {
    const sprite = createIconSprite({});
    expect(registerIconSymbol(sprite, "arrow-right", arrow)).toBe(
      "blume-i-arrow-right"
    );
    expect(registerIconSymbol(sprite, "arrow-right", arrow)).toBe(
      "blume-i-arrow-right"
    );
    expect(sprite.symbols.size).toBe(1);
    expect(iconSymbolId("simple-icons:GitHub")).toBe(
      "blume-i-simple-icons-github"
    );
    expect(iconSymbolId("weird name/here")).toBe("blume-i-weird-name-here");
  });

  it("renders every symbol once, or nothing for an icon-free page", () => {
    const sprite = createIconSprite({});
    expect(renderIconSprite(sprite)).toBe("");
    registerIconSymbol(sprite, "arrow-right", arrow);
    registerIconSymbol(sprite, "check", {
      body: '<path d="M20 6 9 17l-5-5"/>',
      viewBox: "0 0 24 24",
    });
    expect(renderIconSprite(sprite)).toBe(
      '<svg aria-hidden="true" hidden xmlns="http://www.w3.org/2000/svg"><symbol id="blume-i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol><symbol id="blume-i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol></svg>'
    );
  });

  it("lists the sprite symbols a fragment references, deduped", () => {
    const html =
      '<a><svg><use href="#blume-i-chevron-right"></use></svg></a><svg><use href="#blume-i-chevron-right"/></svg><svg><use href="#blume-i-book"/></svg><a href="#not-a-symbol">x</a>';
    expect(referencedIconSymbols(html)).toEqual([
      "blume-i-chevron-right",
      "blume-i-book",
    ]);
    expect(referencedIconSymbols("<p>no icons</p>")).toEqual([]);
  });
});
