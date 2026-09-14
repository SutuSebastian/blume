import path from "node:path";

import type { BuildConfig } from "bun";

import pkg from "../package.json" with { type: "json" };

interface Manifest {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const manifest: Manifest = pkg;

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.resolve(root, "src");

/**
 * `Bun.build` options for the Node CLI bundle, shared by `build.ts` and the
 * test that checks the published layout keeps each command's dependency graph
 * out of the entry.
 *
 * Dependencies, peers, and optional deps are the consumer's to resolve — never
 * bundle them in. Everything else (Blume's own src) is bundled.
 *
 * `splitting` is what preserves the entry's lazy `import()` boundaries: without
 * it Bun folds every command into one file and hoists their external imports
 * (astro, the MCP SDK, typescript…) to the top, so every invocation loads
 * everything. The chunks are named under `cli/` so the whole bundle stays in
 * `dist/cli/` next to the entry rather than scattering across `dist/`.
 */
export const cliBundleOptions = (outdir: string): BuildConfig => ({
  // Make dist/cli/index.js independently executable; harmless when the bin
  // launcher imports it (Node/Bun strip a leading shebang from loaded modules).
  banner: "#!/usr/bin/env node",
  entrypoints: [path.resolve(srcDir, "cli/index.ts")],
  external: [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ],
  format: "esm",
  naming: { chunk: "cli/chunk-[hash].[ext]" },
  outdir,
  // Mirror the src/ tree so the entry lands at <outdir>/cli/index.js.
  root: srcDir,
  sourcemap: "linked",
  splitting: true,
  target: "node",
});
