import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import type { LoaderContext } from "astro/loaders";
import { dirname, join } from "pathe";

import {
  evictStaleIncluders,
  withIncludeRefresh,
} from "../src/astro/include-refresh.ts";

/** One stored entry, as the scoped store enumerates it. */
type DataEntry = ReturnType<LoaderContext["store"]["entries"]>[number][1];

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

const fixture = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "blume-include-refresh-"));
  dirs.push(root);
  await Promise.all(
    Object.entries(files).map(async ([rel, content]) => {
      const abs = join(root, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    })
  );
  return root;
};

/**
 * A fake loader context over a real root: a store seeded with `entries`, an
 * in-memory meta store, and a transparent digest so assertions can read the
 * partial text back out of it.
 */
const fakeContext = (root: string, entries: DataEntry[]) => {
  const store = new Map<string, DataEntry>(
    entries.map((entry) => [entry.id, entry])
  );
  const meta = new Map<string, string>();
  // SAFETY: the wrapper reads only `entries` and `delete` from the scoped
  // store; the fake provides those two members.
  const scopedStore: LoaderContext["store"] = {
    delete: (key: string) => {
      store.delete(key);
    },
    entries: () => [...store.entries()],
  } as never;
  // SAFETY: the wrapper touches only the store above, `meta`, `config.root`,
  // and `generateDigest`; the fake provides each of them.
  const context: LoaderContext = {
    config: { root: pathToFileURL(`${root}/`) },
    generateDigest: (input: Parameters<LoaderContext["generateDigest"]>[0]) =>
      `digest(${String(input).trim()})`,
    meta: {
      delete: (key: string) => {
        meta.delete(key);
      },
      get: (key: string) => meta.get(key),
      has: (key: string) => meta.has(key),
      set: (key: string, value: string) => {
        meta.set(key, value);
      },
    },
    store: scopedStore,
  } as never;
  return { context, meta, store };
};

const page = (id: string, filePath?: string): DataEntry => ({
  data: {},
  digest: "raw",
  filePath,
  id,
});

describe("evictStaleIncluders", () => {
  it("evicts an includer when its partials changed since the recorded digest", async () => {
    const root = await fixture({ "docs/_s.md": "Tip v1.\n" });
    const graphPath = join(root, "includes.json");
    await writeFile(
      graphPath,
      JSON.stringify({
        [join(root, "docs", "_s.md")]: [join(root, "docs", "index.md")],
      })
    );
    const { context, meta, store } = fakeContext(root, [
      page("index.md", "docs/index.md"),
    ]);

    // No digest recorded yet (a store carried over from before the graph
    // knew the page): evict once and record the current state.
    expect(evictStaleIncluders(context, graphPath)).toEqual(["index.md"]);
    expect(store.has("index.md")).toBe(false);
    expect(meta.get("blume:include-state:index.md")).toBe("digest(Tip v1.)");

    // The loader re-renders and re-stores it; an unchanged partial leaves it.
    store.set("index.md", page("index.md", "docs/index.md"));
    expect(evictStaleIncluders(context, graphPath)).toEqual([]);
    expect(store.has("index.md")).toBe(true);

    // An edit to the partial evicts it again and records the new state.
    await writeFile(join(root, "docs", "_s.md"), "Tip v2.\n");
    expect(evictStaleIncluders(context, graphPath)).toEqual(["index.md"]);
    expect(meta.get("blume:include-state:index.md")).toBe("digest(Tip v2.)");
  });

  it("treats a deleted partial as a change", async () => {
    const root = await fixture({ "docs/_s.md": "Tip.\n" });
    const partial = join(root, "docs", "_s.md");
    const graphPath = join(root, "includes.json");
    await writeFile(
      graphPath,
      JSON.stringify({ [partial]: [join(root, "docs", "index.md")] })
    );
    const { context, meta, store } = fakeContext(root, [
      page("index.md", "docs/index.md"),
    ]);
    evictStaleIncluders(context, graphPath);
    store.set("index.md", page("index.md", "docs/index.md"));
    await unlink(partial);
    expect(evictStaleIncluders(context, graphPath)).toEqual(["index.md"]);
    expect(meta.get("blume:include-state:index.md")).toBe(
      `digest(missing:${partial})`
    );
  });

  it("leaves include-free, file-less, and unknown-graph stores alone", async () => {
    const root = await fixture({ "docs/_s.md": "Tip.\n" });
    const graphPath = join(root, "includes.json");
    const entries = [
      page("plain.md", "docs/plain.md"),
      page("virtual"),
      page("index.md", "docs/index.md"),
    ];
    // No graph file yet (first run): nothing to compare against.
    const first = fakeContext(root, entries);
    expect(evictStaleIncluders(first.context, graphPath)).toEqual([]);
    expect(first.store.size).toBe(3);

    // A graph naming only index.md evicts that one and no other.
    await writeFile(
      graphPath,
      JSON.stringify({
        [join(root, "docs", "_s.md")]: [join(root, "docs", "index.md")],
      })
    );
    const second = fakeContext(root, entries);
    expect(evictStaleIncluders(second.context, graphPath)).toEqual([
      "index.md",
    ]);
    expect([...second.store.keys()]).toEqual(["plain.md", "virtual"]);

    // A malformed graph reads as empty rather than throwing into the sync.
    await writeFile(graphPath, "{not json");
    const third = fakeContext(root, entries);
    expect(evictStaleIncluders(third.context, graphPath)).toEqual([]);
  });
});

describe("withIncludeRefresh", () => {
  it("evicts stale includers, then runs the wrapped loader on the same context", async () => {
    const root = await fixture({ "docs/_s.md": "Tip.\n" });
    const graphPath = join(root, "includes.json");
    await writeFile(
      graphPath,
      JSON.stringify({
        [join(root, "docs", "_s.md")]: [join(root, "docs", "index.md")],
      })
    );
    const { context, store } = fakeContext(root, [
      page("index.md", "docs/index.md"),
    ]);
    let seenAtLoad: string[] | undefined;
    let loadedWith: LoaderContext | undefined;
    const loader = withIncludeRefresh(
      {
        load: (inner: LoaderContext) => {
          loadedWith = inner;
          seenAtLoad = inner.store.entries().map(([id]) => id);
          return Promise.resolve();
        },
        name: "glob-loader",
      },
      graphPath
    );
    expect(loader.name).toBe("glob-loader");
    await loader.load(context);
    // The glob loader sees no entry for the page and renders it afresh.
    expect(seenAtLoad).toEqual([]);
    expect(loadedWith).toBe(context);
    expect(store.size).toBe(0);
  });
});
