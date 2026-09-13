/**
 * Result parsing and comparison shared by the benchmark runner: normalize
 * hyperfine (the `blume build` wall clock) and mitata (in-process hot paths)
 * output to one shape, pair a candidate run with a baseline, and flag any
 * benchmark whose median slowed by more than the threshold.
 */

/** One measured benchmark, in milliseconds. */
export interface Measurement {
  name: string;
  /** Median of the samples. The compared statistic: robust to a stray outlier. */
  median: number;
  min: number;
}

/** A candidate measurement beside its baseline, when the baseline has one. */
export interface Comparison {
  name: string;
  candidate: Measurement;
  baseline: Measurement | null;
  /** `candidate.median / baseline.median`; null without a baseline. */
  ratio: number | null;
}

interface HyperfineResult {
  command: string;
  median: number;
  min: number;
}

interface MitataRun {
  name: string;
  stats: { min: number; p50: number };
}

/** Sort by name so reports are stable regardless of tool output order. */
const byName = (measurements: Measurement[]): Measurement[] =>
  measurements.toSorted((a, b) => a.name.localeCompare(b.name));

/**
 * The measurements in a hyperfine `--export-json` file, named by command (or
 * `--command-name`); seconds become milliseconds.
 */
export const fromHyperfine = (json: string): Measurement[] => {
  // SAFETY: hyperfine's export schema — `results[]` with per-command timing
  // in seconds — has been stable since 1.0.
  const { results } = JSON.parse(json) as { results: HyperfineResult[] };
  return byName(
    results.map((result) => ({
      median: result.median * 1000,
      min: result.min * 1000,
      name: result.command,
    }))
  );
};

/**
 * The measurements in mitata's `format: "json"` output; nanoseconds become
 * milliseconds. Mitata prints the JSON as the last line of stdout, after any
 * other output the benchmarked code logged, so only that line is parsed.
 */
export const fromMitata = (stdout: string): Measurement[] => {
  const line = stdout.trim().split("\n").at(-1) ?? "";
  // SAFETY: mitata's JSON format nests `benchmarks[].runs[]`, each run
  // carrying `name` and nanosecond `stats`.
  const { benchmarks } = JSON.parse(line) as {
    benchmarks: { runs: MitataRun[] }[];
  };
  return byName(
    benchmarks.flatMap((benchmark) =>
      benchmark.runs.map((run) => ({
        median: run.stats.p50 / 1e6,
        min: run.stats.min / 1e6,
        name: run.name,
      }))
    )
  );
};

/** Pair every candidate measurement with the same-named baseline one. */
export const compare = (
  candidate: Measurement[],
  baseline: Measurement[]
): Comparison[] =>
  candidate.map((measurement) => {
    const base =
      baseline.find((entry) => entry.name === measurement.name) ?? null;
    return {
      baseline: base,
      candidate: measurement,
      name: measurement.name,
      ratio: base ? measurement.median / base.median : null,
    };
  });

/** The comparisons that slowed by more than `thresholdPercent`. */
export const regressions = (
  rows: Comparison[],
  thresholdPercent: number
): Comparison[] =>
  rows.filter(
    (row) => row.ratio !== null && row.ratio > 1 + thresholdPercent / 100
  );

const formatDuration = (ms: number): string => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  if (ms >= 1) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${(ms * 1000).toFixed(2)} µs`;
};

const formatChange = (ratio: number | null): string => {
  if (ratio === null) {
    return "no baseline";
  }
  const percent = (ratio - 1) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
};

/** A Markdown table of the comparison, with regressions marked. */
export const formatTable = (
  rows: Comparison[],
  thresholdPercent: number
): string => {
  const slow = new Set(regressions(rows, thresholdPercent));
  const lines = [
    "| Benchmark | Baseline | Candidate | Change |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map((row) =>
      [
        row.name,
        row.baseline ? formatDuration(row.baseline.median) : "—",
        formatDuration(row.candidate.median),
        `${formatChange(row.ratio)}${slow.has(row) ? " ⚠️" : ""}`,
      ]
        .map((cell) => `| ${cell} `)
        .join("")
        .concat("|")
    ),
  ];
  return lines.join("\n");
};
