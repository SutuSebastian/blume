import { describe, expect, it } from "bun:test";

import {
  ICON_SPRITE_SLOT,
  onRequest,
  spliceIconSprite,
} from "../src/components/icon-sprite-middleware.ts";
import {
  createIconSprite,
  registerIconSymbol,
} from "../src/components/icon-sprite.ts";
import type { IconSpriteLocals } from "../src/components/icon-sprite.ts";

const arrow = { body: '<path d="M5 12h14"/>', viewBox: "0 0 24 24" };

/** The middleware's inputs: a request whose shell may have kept a registry. */
const run = (locals: IconSpriteLocals, body: string): Promise<Response> => {
  // SAFETY: the middleware reads only `locals` from its context; the rest of
  // Astro's APIContext is irrelevant to it.
  const context = { locals } as Parameters<typeof onRequest>[0];
  const next = () =>
    Promise.resolve(
      new Response(body, { headers: { "content-type": "text/html" } })
    );
  return Promise.resolve(onRequest(context, next)).then((result) =>
    result instanceof Response ? result : new Response(String(result))
  );
};

describe("spliceIconSprite", () => {
  it("replaces the slot with the sprite, or with nothing", () => {
    const sprite = createIconSprite({});
    registerIconSymbol(sprite, "arrow-right", arrow);
    const html = `<body><svg><use href="#blume-i-arrow-right"/></svg>${ICON_SPRITE_SLOT}</body>`;
    expect(spliceIconSprite(html, sprite)).toBe(
      '<body><svg><use href="#blume-i-arrow-right"/></svg><svg aria-hidden="true" hidden xmlns="http://www.w3.org/2000/svg"><symbol id="blume-i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14"/></symbol></svg></body>'
    );
    expect(spliceIconSprite(html)).toBe(
      '<body><svg><use href="#blume-i-arrow-right"/></svg></body>'
    );
    expect(spliceIconSprite("<body></body>", sprite)).toBe("<body></body>");
  });
});

describe("icon sprite middleware", () => {
  it("splices the finished sprite into a page whose shell kept a registry", async () => {
    const locals: IconSpriteLocals = {};
    const sprite = createIconSprite(locals);
    registerIconSymbol(sprite, "check", arrow);
    const response = await run(locals, `<body>${ICON_SPRITE_SLOT}</body>`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(await response.text()).toContain('<symbol id="blume-i-check"');
  });

  it("passes a request without a registry through untouched", async () => {
    const body = `<body>${ICON_SPRITE_SLOT}</body>`;
    const response = await run({}, body);
    expect(await response.text()).toBe(body);
  });
});
