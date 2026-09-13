import { describe, expect, it } from "bun:test";

import {
  blumeIntegration,
  showBlumeErrorOverlay,
} from "../src/astro/integration.ts";
import type { Diagnostic } from "../src/core/types.ts";

interface OverlayPayload {
  err: { id?: string; message: string; plugin: string; stack: string };
  type: string;
}

/** The request fields the negotiation middleware reads (and the `url` it rewrites). */
interface DevRequest {
  headers: { accept?: string };
  method: string;
  url: string | undefined;
}

/** The response surface the middleware touches: header stamping only. */
interface DevResponse {
  setHeader: (name: string, value: string) => void;
}

type MiddlewareHandle = (
  req: DevRequest,
  res: DevResponse,
  next: () => void
) => void;

type MiddlewareStack = { handle: MiddlewareHandle; route: string }[];

/** The HMR channel a dev-server fixture exposes for the error overlay. */
interface OverlayChannelStub {
  send: (payload: OverlayPayload) => void;
}

interface DevServerStub {
  hot?: OverlayChannelStub;
  ws?: OverlayChannelStub;
}

/** Run `astro:server:setup` and return the resulting middleware stack. */
const serverSetup = (
  options: Partial<Parameters<typeof blumeIntegration>[0]> = {},
  server: DevServerStub = {}
): MiddlewareStack => {
  const stack: MiddlewareStack = [];
  // SAFETY: the hook only touches `server.middlewares.stack` and the ws/hot
  // overlay channel, all of which the fixture provides.
  blumeIntegration({
    contentRoutes: [],
    pages: [],
    ...options,
  }).hooks["astro:server:setup"]?.({
    server: { middlewares: { stack }, ...server },
  } as never);
  return stack;
};

/** The single middleware `astro:server:setup` registered. */
const handleOf = (stack: MiddlewareStack): MiddlewareHandle =>
  // SAFETY: the hook unshifts exactly one middleware into the empty fixture
  // stack, so index 0 is always present.
  stack[0]?.handle as MiddlewareHandle;

/** The markdown-negotiation handle is the only middleware in the stack. */
const markdownHandle = (contentRoutes: string[]): MiddlewareHandle =>
  handleOf(serverSetup({ contentRoutes }));

/** Headers a handle stamped on the response. */
interface CollectedHeaders {
  [name: string]: string;
}

/** Run a handle against a bare GET/HEAD request; returns the headers it set. */
const runHandle = (
  handle: MiddlewareHandle,
  url?: string,
  method = "GET"
): CollectedHeaders => {
  const headers: CollectedHeaders = {};
  handle(
    { headers: {}, method, url },
    {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
    },
    () => {
      // The middleware always chains; nothing to observe here.
    }
  );
  return headers;
};

/** The route fields `astro:config:setup` injects for a user page. */
interface InjectedPageRoute {
  entrypoint: string;
  pattern: string;
  prerender: boolean;
}

/** The `injectTypes` call `astro:config:done` makes. */
interface InjectedTypes {
  content: string;
  filename: string;
}

/** A project root + codegen dir pair for the config hooks. */
const CONFIG_ROOT = "file:///proj/.blume/";
const CODEGEN_DIR = new URL(".astro/integrations/blume/", CONFIG_ROOT);

/**
 * Run `astro:config:done` against a config rooted at {@link CONFIG_ROOT}, after
 * `astro:config:setup` when `withSetup` is set (so the integration has asked
 * Astro for its codegen dir), and return the injected types.
 */
const configDone = (withSetup: boolean): InjectedTypes | undefined => {
  const integration = blumeIntegration({ contentRoutes: [], pages: [] });
  if (withSetup) {
    // SAFETY: the setup hook only calls `createCodegenDir` and `injectRoute`,
    // both of which the fixture provides.
    integration.hooks["astro:config:setup"]?.({
      createCodegenDir: () => CODEGEN_DIR,
      injectRoute: () => {
        // No pages configured, so this is never reached.
      },
    } as never);
  }
  let injected: InjectedTypes | undefined;
  // SAFETY: the done hook only reads `config.root`/`config.srcDir` and calls
  // `injectTypes`, all of which the fixture provides.
  integration.hooks["astro:config:done"]?.({
    config: {
      root: new URL(CONFIG_ROOT),
      srcDir: new URL("src/", CONFIG_ROOT),
    },
    injectTypes: (types: InjectedTypes) => {
      injected = types;
      return new URL(types.filename, CODEGEN_DIR);
    },
  } as never);
  return injected;
};

describe("blumeIntegration astro:config:done", () => {
  it("injects the blume:* module declarations, typing examples from src/generated", () => {
    const injected = configDone(true);
    expect(injected?.filename).toBe("modules.d.ts");
    expect(injected?.content).toContain('declare module "blume:data"');
    // From `.astro/integrations/blume/` up to the project's `src/generated/`.
    expect(injected?.content).toContain(
      'typeof import("../../../src/generated/examples.ts").examples'
    );
  });

  it("falls back to Astro's codegen-dir convention without a setup run", () => {
    const injected = configDone(false);
    expect(injected?.content).toContain(
      'typeof import("../../../src/generated/examples.ts").examples'
    );
  });
});

describe("blumeIntegration astro:config:setup", () => {
  it("injects each user page route as a prerendered route", () => {
    const injected: InjectedPageRoute[] = [];
    // SAFETY: the hook only calls `createCodegenDir` and `injectRoute`, which
    // the fixture provides.
    blumeIntegration({
      contentRoutes: [],
      pages: [
        { entrypoint: "/abs/changelog.astro", pattern: "/changelog" },
        { entrypoint: "/abs/example.astro", pattern: "/examples/[slug]" },
      ],
    }).hooks["astro:config:setup"]?.({
      createCodegenDir: () => CODEGEN_DIR,
      injectRoute: (route: InjectedPageRoute) => injected.push(route),
    } as never);

    expect(injected).toEqual([
      {
        entrypoint: "/abs/changelog.astro",
        pattern: "/changelog",
        prerender: true,
      },
      {
        entrypoint: "/abs/example.astro",
        pattern: "/examples/[slug]",
        prerender: true,
      },
    ]);
  });
});

describe("blumeIntegration markdown negotiation", () => {
  it("rewrites a content route to its .md variant when markdown is preferred", () => {
    const handle = markdownHandle(["/guide"]);
    const req: DevRequest = {
      headers: { accept: "text/markdown" },
      method: "GET",
      url: "/guide",
    };
    const headers: CollectedHeaders = {};
    let nexted = false;
    handle(
      req,
      {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
        },
      },
      () => {
        nexted = true;
      }
    );

    expect(req.url).toBe("/guide.md");
    expect(headers.Vary).toBe("Accept");
    expect(nexted).toBe(true);
  });

  it("leaves the request untouched when the path is not a content route", () => {
    const handle = markdownHandle(["/guide"]);
    const req: DevRequest = {
      headers: { accept: "text/markdown" },
      method: "GET",
      url: "/not-a-page",
    };
    let headerSet = false;
    let nexted = false;
    handle(
      req,
      {
        setHeader: () => {
          headerSet = true;
        },
      },
      () => {
        nexted = true;
      }
    );

    expect(req.url).toBe("/not-a-page");
    expect(headerSet).toBe(false);
    expect(nexted).toBe(true);
  });

  it("does not negotiate when the client does not prefer markdown", () => {
    const handle = markdownHandle(["/guide"]);
    const req: DevRequest = {
      headers: { accept: "text/html" },
      method: "GET",
      url: "/guide",
    };
    let headerSet = false;
    let nexted = false;
    handle(
      req,
      {
        setHeader: () => {
          headerSet = true;
        },
      },
      () => {
        nexted = true;
      }
    );

    expect(req.url).toBe("/guide");
    expect(headerSet).toBe(false);
    expect(nexted).toBe(true);
  });
});

describe("blumeIntegration homepage Link header", () => {
  const LINK = '</llms.txt>; rel="describedby"; type="text/plain"';

  const handleWith = (): MiddlewareHandle =>
    handleOf(serverSetup({ contentRoutes: ["/"], homeLinkHeader: LINK }));

  it("stamps the Link header on homepage requests only", () => {
    const handle = handleWith();
    expect(runHandle(handle, "/").Link).toBe(LINK);
    expect(runHandle(handle, "/?draft=1").Link).toBe(LINK);
    expect(runHandle(handle, "/guide").Link).toBeUndefined();
    expect(runHandle(handle, "/", "POST").Link).toBeUndefined();
  });

  it("matches the root as Astro's base middleware rewrote it", () => {
    // Under a `deployment.base`, Astro's dev base middleware runs first and
    // rewrites `/<base>/` to `/`; the handler must not strip the base again.
    const handle = handleWith();
    expect(runHandle(handle, "/").Link).toBe(LINK);
    expect(runHandle(handle, "/base/").Link).toBeUndefined();
    expect(runHandle(handle, "/other/").Link).toBeUndefined();
  });

  it("stamps nothing on a request that carries no url", () => {
    // Node types `IncomingMessage#url` as optional; a url-less request can
    // never be the homepage.
    const handle = handleWith();
    expect(runHandle(handle).Link).toBeUndefined();
  });

  it("sends no Link header when none is configured", () => {
    const handle = handleOf(serverSetup({ contentRoutes: ["/"] }));
    expect(runHandle(handle, "/").Link).toBeUndefined();
  });
});

describe("showBlumeErrorOverlay", () => {
  it("pushes error diagnostics into the dev-server overlay channel", () => {
    let payload: OverlayPayload | undefined;
    serverSetup(
      {},
      {
        ws: {
          send: (p) => {
            payload = p;
          },
        },
      }
    );

    showBlumeErrorOverlay([
      {
        code: "BLUME_CONFIG_INVALID",
        docsUrl: "https://useblume.dev/custom",
        file: "blume.config.ts",
        line: 5,
        message: "bad config",
        severity: "error",
        suggestion: "set it right",
      },
    ]);

    expect(payload).toEqual({
      err: {
        id: "blume.config.ts",
        message:
          "Blume found 1 error(s):\n\n[BLUME_CONFIG_INVALID] bad config\n  at blume.config.ts:5\n  fix: set it right\n  docs: https://useblume.dev/custom",
        plugin: "blume",
        stack: "",
      },
      type: "error",
    });
  });

  it("filters out non-errors and omits absent location, fix, and docs", () => {
    let payload: OverlayPayload | undefined;
    serverSetup(
      {},
      {
        // Vite 6+ exposes the HMR channel as `.hot`; the overlay falls back to it.
        hot: {
          send: (p) => {
            payload = p;
          },
        },
      }
    );

    showBlumeErrorOverlay([
      { code: "BLUME_WARN", message: "just a warning", severity: "warning" },
      { code: "BLUME_UNMAPPED", message: "boom", severity: "error" },
    ]);

    expect(payload).toEqual({
      err: {
        // Asserts the overlay payload carries an explicit `id: undefined`;
        // null would change the equality check.
        // oxlint-disable-next-line sonarjs/no-undefined-assignment
        id: undefined,
        message: "Blume found 1 error(s):\n\n[BLUME_UNMAPPED] boom",
        plugin: "blume",
        stack: "",
      },
      type: "error",
    });
  });

  it("is a no-op when there are no error diagnostics", () => {
    let sent = false;
    serverSetup(
      {},
      {
        ws: {
          send: () => {
            sent = true;
          },
        },
      }
    );

    showBlumeErrorOverlay([
      { code: "BLUME_WARN", message: "warn", severity: "warning" },
    ]);

    expect(sent).toBe(false);
  });

  it("is a no-op when the dev server exposes no HMR channel", () => {
    serverSetup();
    const diagnostics: Diagnostic[] = [
      { code: "BLUME_UNMAPPED", message: "boom", severity: "error" },
    ];

    expect(() => showBlumeErrorOverlay(diagnostics)).not.toThrow();
  });

  it("shares the dev-server handle across module copies through globalThis", () => {
    // The CLI bundle and the copy of `blume/astro` Vite loads are separate
    // module instances on a published install; the handle the hook records
    // must be the one `showBlumeErrorOverlay` reads from either copy.
    const channel: OverlayChannelStub = {
      send: () => {
        // Presence is what matters here, not the payload.
      },
    };
    serverSetup({}, { hot: channel });
    const key = Symbol.for("blume.dev-server");
    // SAFETY: the registry lives on globalThis under that symbol; the
    // intersection only names the slot the test inspects.
    const host = globalThis as typeof globalThis & {
      [key]?: { overlay: DevServerStub | null };
    };
    expect(host[key]?.overlay?.hot).toBe(channel);
  });
});
