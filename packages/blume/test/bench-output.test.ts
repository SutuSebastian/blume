import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import {
  outputBytes,
  outputMeasurements,
  parseOgTally,
} from "../bench/output.ts";

describe("parseOgTally", () => {
  it("reads the build's card tally line", () => {
    expect(
      parseOgTally(
        "[blume] ℹ OG cards: 1401 reused from the cache, 0 rendered\n[build] Complete!"
      )
    ).toEqual({ rendered: 0, reused: 1401 });
  });

  it("is null for a build that logs no tally", () => {
    expect(parseOgTally("[build] Complete!")).toBeNull();
  });
});

describe("build output measurements", () => {
  let dist: string;

  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), "blume-bench-output-"));
    await mkdir(join(dist, "guides", "page-1"), { recursive: true });
    await mkdir(join(dist, "og"), { recursive: true });
    await writeFile(join(dist, "index.html"), "x".repeat(100));
    await writeFile(
      join(dist, "guides", "page-1", "index.html"),
      "y".repeat(250)
    );
    await writeFile(join(dist, "guides", "page-1.md"), "z".repeat(40));
    await writeFile(join(dist, "og", "index.png"), Buffer.alloc(1000));
  });

  afterEach(async () => {
    await rm(dist, { force: true, recursive: true });
  });

  it("sums every file and the HTML files alone", async () => {
    expect(await outputBytes(dist)).toEqual({ html: 350, total: 1390 });
  });

  it("measures the sample page, all HTML, dist, and the warm card tally", async () => {
    const measurements = await outputMeasurements({
      distDir: dist,
      log: "OG cards: 2 reused from the cache, 0 rendered",
      pages: 2,
      samplePage: "guides/page-1/index.html",
    });
    expect(measurements).toEqual([
      {
        median: 250,
        min: 250,
        name: "page HTML (one content page)",
        unit: "bytes",
      },
      { median: 350, min: 350, name: "HTML output (2 pages)", unit: "bytes" },
      { median: 1390, min: 1390, name: "dist output (2 pages)", unit: "bytes" },
      {
        median: 0,
        min: 0,
        name: "OG cards rendered on a warm rebuild",
        unit: "count",
      },
    ]);
  });

  it("omits the card row for a build without a tally line", async () => {
    const measurements = await outputMeasurements({
      distDir: dist,
      log: "[build] Complete!",
      pages: 2,
      samplePage: "guides/page-1/index.html",
    });
    expect(measurements.map((entry) => entry.name)).toEqual([
      "page HTML (one content page)",
      "HTML output (2 pages)",
      "dist output (2 pages)",
    ]);
  });
});
