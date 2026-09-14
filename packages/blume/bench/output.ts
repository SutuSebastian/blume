/**
 * Deterministic measurements of a build's output: what a build wrote, rather
 * than how long it took. Byte counts and card tallies are identical from one
 * run to the next for the same code, so the runner gates them much tighter
 * than the timing benchmarks (see `regressions` in `compare.ts`) — a page
 * that grew is a regression the same way a build that slowed is.
 */
import { readdir, readFile, stat } from "node:fs/promises";

import { join } from "pathe";

import type { Measurement } from "./compare.ts";

/** The `OG cards: N reused from the cache, M rendered` line a build logs. */
export const parseOgTally = (
  log: string
): { rendered: number; reused: number } | null => {
  const match =
    /OG cards: (?<reused>\d+) reused from the cache, (?<rendered>\d+) rendered/u.exec(
      log
    );
  return match?.groups
    ? {
        rendered: Number(match.groups.rendered),
        reused: Number(match.groups.reused),
      }
    : null;
};

/** Byte totals of a directory tree: every file, and the `.html` files alone. */
export const outputBytes = async (
  dir: string
): Promise<{ html: number; total: number }> => {
  let html = 0;
  let total = 0;
  const walk = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
          return;
        }
        const { size } = await stat(path);
        total += size;
        if (entry.name.endsWith(".html")) {
          html += size;
        }
      })
    );
  };
  await walk(dir);
  return { html, total };
};

const size = (name: string, value: number): Measurement => ({
  median: value,
  min: value,
  name,
  unit: "bytes",
});

/**
 * The output measurements of one warm `blume build`: a representative content
 * page's HTML, all HTML, the whole `dist/`, and how many OG cards that
 * rebuild rendered rather than reused (zero, when the card cache works; the
 * row is omitted for a checkout whose build predates the tally line).
 */
export const outputMeasurements = async (options: {
  distDir: string;
  /** The build's console output, for the card tally. */
  log: string;
  /** Pages in the fixture, for the measurement names. */
  pages: number;
  /** A content page's HTML file, relative to `distDir`. */
  samplePage: string;
}): Promise<Measurement[]> => {
  const [sample, bytes] = await Promise.all([
    readFile(join(options.distDir, options.samplePage)),
    outputBytes(options.distDir),
  ]);
  const measurements = [
    size("page HTML (one content page)", sample.byteLength),
    size(`HTML output (${options.pages} pages)`, bytes.html),
    size(`dist output (${options.pages} pages)`, bytes.total),
  ];
  const tally = parseOgTally(options.log);
  if (tally) {
    measurements.push({
      median: tally.rendered,
      min: tally.rendered,
      name: "OG cards rendered on a warm rebuild",
      unit: "count",
    });
  }
  return measurements;
};
