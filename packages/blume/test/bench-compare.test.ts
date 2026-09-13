import { describe, expect, it } from "bun:test";

import {
  compare,
  formatTable,
  fromHyperfine,
  fromMitata,
  regressions,
} from "../bench/compare.ts";
import type { Measurement } from "../bench/compare.ts";

const measurement = (
  name: string,
  median: number,
  extra: Partial<Measurement> = {}
): Measurement => ({ median, min: median, name, ...extra });

describe("fromHyperfine", () => {
  it("converts seconds to milliseconds and sorts by command name", () => {
    const json = JSON.stringify({
      results: [
        { command: "candidate", median: 4.5, min: 4.4 },
        { command: "baseline", median: 4, min: 3.9 },
      ],
    });
    expect(fromHyperfine(json)).toEqual([
      { median: 4000, min: 3900, name: "baseline" },
      { median: 4500, min: 4400, name: "candidate" },
    ]);
  });
});

describe("fromMitata", () => {
  it("reads the JSON on the last stdout line and converts nanoseconds", () => {
    const json = JSON.stringify({
      benchmarks: [
        {
          runs: [
            {
              name: "scanProject (150 pages)",
              stats: { min: 2e6, p50: 3e6 },
            },
          ],
        },
        {
          runs: [{ name: "frontmatter", stats: { min: 1e4, p50: 2e4 } }],
        },
      ],
    });
    expect(fromMitata(`[blume] some log line\n${json}\n`)).toEqual([
      { median: 0.02, min: 0.01, name: "frontmatter" },
      { median: 3, min: 2, name: "scanProject (150 pages)" },
    ]);
  });
});

describe("compare", () => {
  it("pairs by name and leaves the ratio null without a baseline", () => {
    const rows = compare(
      [measurement("build", 1200), measurement("new", 10)],
      [measurement("build", 1000)]
    );
    expect(rows).toEqual([
      {
        baseline: measurement("build", 1000),
        candidate: measurement("build", 1200),
        name: "build",
        ratio: 1.2,
      },
      {
        baseline: null,
        candidate: measurement("new", 10),
        name: "new",
        ratio: null,
      },
    ]);
  });
});

describe("regressions", () => {
  it("flags only rows slower than the threshold", () => {
    const rows = compare(
      [measurement("a", 1210), measurement("b", 1190), measurement("c", 5)],
      [measurement("a", 1000), measurement("b", 1000)]
    );
    expect(regressions(rows, 20).map((row) => row.name)).toEqual(["a"]);
    expect(regressions(rows, 25)).toEqual([]);
  });
});

describe("formatTable", () => {
  it("renders durations, changes, and a regression marker", () => {
    const rows = compare(
      [
        measurement("build", 1500),
        measurement("scan", 2.5),
        measurement("new", 0.0125),
      ],
      [measurement("build", 1000), measurement("scan", 2.6)]
    );
    expect(formatTable(rows, 20)).toBe(
      [
        "| Benchmark | Baseline | Candidate | Change |",
        "| --- | ---: | ---: | ---: |",
        "| build | 1.00 s | 1.50 s | +50.0% ⚠️ |",
        "| scan | 2.60 ms | 2.50 ms | -3.8% |",
        "| new | — | 12.50 µs | no baseline |",
      ].join("\n")
    );
  });
});
