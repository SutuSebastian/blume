/**
 * Result parsing and comparison shared by the benchmark runner: normalize
 * hyperfine (the `blume build` wall clock) and mitata (in-process hot paths)
 * output and the build's output measurements (`output.ts`) to one shape, pair
 * a candidate run with a baseline, and flag any benchmark whose median slowed
 * — or whose output grew — by more than its threshold.
 */

/**
 * What a measurement counts. Timings (`ms`, the default) vary run to run and
 * are gated by the runner's threshold; `bytes` and `count` come out of a
 * build's output and are deterministic for the same code, so they are gated
 * far tighter (see {@link regressions}).
 */
export type Unit = "bytes" | "count" | "ms";

/** One measured benchmark, in milliseconds unless `unit` says otherwise. */
export interface Measurement {
  name: string;
  /** Median of the samples. The compared statistic: robust to a stray outlier. */
  median: number;
  min: number;
  unit?: Unit;
}

/**
 * The most a deterministic measurement (bytes, a count) may grow before it
 * counts as a regression. Output sizes don't jitter, so this only has to
 * absorb a deliberate small addition — a page growing by more than this is
 * what the gate exists to catch. A tighter `--threshold` still applies.
 */
export const DETERMINISTIC_THRESHOLD_PERCENT = 5;

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

/**
 * `candidate / baseline`, defined at a zero baseline: still zero is unchanged,
 * anything above it is an unbounded regression (a warm rebuild that rendered
 * cards after one that rendered none).
 */
const ratio = (candidate: number, baseline: number): number => {
  if (baseline === 0) {
    return candidate === 0 ? 1 : Number.POSITIVE_INFINITY;
  }
  return candidate / baseline;
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
      ratio: base ? ratio(measurement.median, base.median) : null,
    };
  });

/** The growth a measurement may show before it regresses, in percent. */
const allowance = (row: Comparison, thresholdPercent: number): number =>
  (row.candidate.unit ?? "ms") === "ms"
    ? thresholdPercent
    : Math.min(thresholdPercent, DETERMINISTIC_THRESHOLD_PERCENT);

/**
 * The comparisons that regressed: timings slower than `thresholdPercent`,
 * output sizes and counts grown past {@link DETERMINISTIC_THRESHOLD_PERCENT}.
 */
export const regressions = (
  rows: Comparison[],
  thresholdPercent: number
): Comparison[] =>
  rows.filter(
    (row) =>
      row.ratio !== null &&
      row.ratio > 1 + allowance(row, thresholdPercent) / 100
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

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${bytes} B`;
};

const formatValue = (measurement: Measurement): string => {
  switch (measurement.unit) {
    case "bytes": {
      return formatBytes(measurement.median);
    }
    case "count": {
      return String(measurement.median);
    }
    default: {
      return formatDuration(measurement.median);
    }
  }
};

const formatChange = (change: number | null): string => {
  if (change === null) {
    return "no baseline";
  }
  if (change === Number.POSITIVE_INFINITY) {
    return "+∞";
  }
  const percent = (change - 1) * 100;
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
        row.baseline ? formatValue(row.baseline) : "—",
        formatValue(row.candidate),
        `${formatChange(row.ratio)}${slow.has(row) ? " ⚠️" : ""}`,
      ]
        .map((cell) => `| ${cell} `)
        .join("")
        .concat("|")
    ),
  ];
  return lines.join("\n");
};
