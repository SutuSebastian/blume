/**
 * The benchmark runner: `bun run bench [--base <git ref>]`.
 *
 * Measures this checkout — `blume build` over a synthetic docs project with
 * hyperfine (Bun's recommended CLI benchmark tool), with the build caches
 * warm and again with them cleared before every run; what that build wrote
 * (page and total HTML bytes, `dist/` size, cards a warm rebuild rendered —
 * see `output.ts`); plus the in-process hot paths in `core.bench.ts` — and,
 * with `--base`, the same for a second checkout of that ref, then fails when
 * a median slowed, or an output grew, by more than its threshold. Both sides
 * run on the same machine back to back, so the comparison is insensitive to
 * how fast that machine is on the day; this is what CI runs against the
 * merge base (`.github/workflows/bench.yml`).
 *
 * The baseline checkout is a throwaway `git worktree` (installed and built
 * like the candidate) and is removed afterwards; an interrupted run may leave
 * one behind — `git worktree prune` clears it. Needs `hyperfine` on PATH.
 */
import { existsSync } from "node:fs";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";

import { $ } from "bun";
import { dirname, join } from "pathe";

import { packageRoot } from "../src/core/package-root.ts";
import {
  compare,
  DETERMINISTIC_THRESHOLD_PERCENT,
  formatTable,
  fromHyperfine,
  fromMitata,
  regressions,
} from "./compare.ts";
import type { Measurement } from "./compare.ts";
import { createFixture, SAMPLE_PAGE_HTML } from "./fixture.ts";
import { outputMeasurements } from "./output.ts";

const { values } = parseArgs({
  options: {
    /** A git ref to A/B against; omit to measure this checkout alone. */
    base: { type: "string" },
    /** Which suite to run: `build` (timings and output), `core`, or both by default. */
    only: { type: "string" },
    /** Pages in the synthetic fixture. */
    pages: { default: "150", type: "string" },
    /** Timed `blume build` runs per side (after one warmup). */
    runs: { default: "5", type: "string" },
    /** Fail when a median is slower than the baseline by more than this. */
    threshold: { default: "20", type: "string" },
  },
});

const pages = Number(values.pages);
const runs = Number(values.runs);
const threshold = Number(values.threshold);
const { only } = values;
if (only !== undefined && only !== "build" && only !== "core") {
  console.error(`--only must be "build" or "core" (got "${only}").`);
  process.exit(1);
}

/** One checkout under measurement. */
interface Side {
  label: "baseline" | "candidate";
  /** The `packages/blume` directory of that checkout. */
  pkg: string;
}

const candidate: Side = { label: "candidate", pkg: packageRoot() };
const repoRoot = dirname(dirname(candidate.pkg));

const log = (message: string): void => {
  console.error(`\n[bench] ${message}`);
};

/** Check out `ref` as a detached worktree and install it. */
const checkoutBaseline = async (
  ref: string
): Promise<{ side: Side; dir: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "blume-bench-base-"));
  log(`Checking out baseline ${ref} into ${dir}`);
  await $`git worktree add --detach ${dir} ${ref}`.cwd(repoRoot);
  await $`bun install --frozen-lockfile`.cwd(dir);
  return { dir, side: { label: "baseline", pkg: join(dir, "packages/blume") } };
};

const removeBaseline = async (dir: string): Promise<void> => {
  await $`git worktree remove --force ${dir}`.cwd(repoRoot).nothrow();
  await rm(dir, { force: true, recursive: true });
};

/**
 * The build caches a warm run reuses, cleared before every cold run: the
 * rendered OG cards and Astro's content store. Astro's downloaded font files
 * (a sibling under `.blume/.cache/astro`) stay: clearing them would put
 * Google Fonts on the timed path, and network jitter is not a regression.
 */
const CACHE_PATHS = [
  "node_modules/.cache/blume/og",
  ".blume/.cache/astro/data-store.json",
];

/** `cd` into a fixture and run its checkout's CLI bundle, the way it ships. */
const buildCommand = (root: string, pkg: string): string =>
  `cd ${$.escape(root)} && node ${$.escape(join(pkg, "bin/blume.mjs"))} build`;

/**
 * One more warm `blume build` per side after the timed runs, for what the
 * build writes rather than how long it takes (see `output.ts`).
 */
const measureOutput = async (
  side: Side,
  root: string
): Promise<Measurement[]> => {
  log(`Measuring the ${side.label} build output`);
  const result = await $`sh -c ${buildCommand(root, side.pkg)}`
    .env({ ...process.env, NO_COLOR: "1" })
    .quiet();
  return outputMeasurements({
    distDir: join(root, "dist"),
    log: `${result.stdout}${result.stderr}`,
    pages,
    samplePage: SAMPLE_PAGE_HTML,
  });
};

/**
 * `blume build` wall clock per side — warm, then with the caches cleared
 * before every run — in one hyperfine session, followed by the output
 * measurements of a final warm build.
 */
const benchBuild = async (
  sides: Side[]
): Promise<Record<Side["label"], Measurement[]>> => {
  const fixtures = await Promise.all(
    sides.map((side) => createFixture({ packageRoot: side.pkg, pages }))
  );
  const scratch = await mkdtemp(join(tmpdir(), "blume-bench-hyperfine-"));
  const exportPath = join(scratch, "results.json");
  try {
    const modes = [
      { label: "warm caches", prepare: "true" },
      {
        label: "cold caches",
        prepare: `rm -rf ${CACHE_PATHS.map((path) => $.escape(path)).join(" ")}`,
      },
    ];
    // hyperfine pairs each `--prepare` with the command at the same position.
    const commands = modes.flatMap((mode) =>
      sides.flatMap((side, index) => [
        "--command-name",
        `${side.label} | ${mode.label}`,
        "--prepare",
        mode.prepare,
        buildCommand(fixtures[index]?.root ?? "", side.pkg),
      ])
    );
    log(
      `Timing \`blume build\` over ${pages} pages, warm and cold caches (1 warmup + ${runs} runs per side and mode)`
    );
    await $`hyperfine --warmup 1 --runs ${runs} --export-json ${exportPath} ${commands}`.env(
      { ...process.env, NO_COLOR: "1" }
    );
    const results = fromHyperfine(await Bun.file(exportPath).text());
    const pick = (label: Side["label"]): Measurement[] =>
      modes.flatMap((mode) =>
        results
          .filter((result) => result.name === `${label} | ${mode.label}`)
          .map((result) => ({
            ...result,
            name: `blume build (${pages} pages, ${mode.label})`,
          }))
      );
    const output: Record<Side["label"], Measurement[]> = {
      baseline: [],
      candidate: [],
    };
    // One side at a time: two builds at once would contend for the CPU.
    const collectOutput = async (queue: number[]): Promise<void> => {
      const [index, ...rest] = queue;
      const side = index === undefined ? undefined : sides[index];
      if (index === undefined || !side) {
        return;
      }
      output[side.label] = await measureOutput(
        side,
        fixtures[index]?.root ?? ""
      );
      await collectOutput(rest);
    };
    await collectOutput(sides.map((_, index) => index));
    return {
      baseline: [...pick("baseline"), ...output.baseline],
      candidate: [...pick("candidate"), ...output.candidate],
    };
  } finally {
    await Promise.all([
      ...fixtures.map((fixture) => fixture.cleanup()),
      rm(scratch, { force: true, recursive: true }),
    ]);
  }
};

/** The mitata suite of one side; empty when that checkout predates it. */
const benchCore = async (side: Side): Promise<Measurement[]> => {
  const script = join(side.pkg, "bench/core.bench.ts");
  if (!existsSync(script)) {
    log(`${side.label} has no bench/core.bench.ts; skipping its core suite`);
    return [];
  }
  log(`Running the core suite for the ${side.label}`);
  const proc = Bun.spawn(["bun", script, "--json", "--pages", String(pages)], {
    cwd: side.pkg,
    stderr: "inherit",
    stdout: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `core.bench.ts exited with ${exitCode} for the ${side.label}`
    );
  }
  return fromMitata(stdout);
};

/** Build the Node CLI bundle of a side, so `blume build` runs what ships. */
const buildCli = async (side: Side): Promise<void> => {
  log(`Building the ${side.label} CLI`);
  await $`bun run build`.cwd(side.pkg);
};

const main = async (): Promise<number> => {
  let baseline: { side: Side; dir: string } | null = null;
  try {
    if (values.base) {
      baseline = await checkoutBaseline(values.base);
    }
    const sides = baseline ? [baseline.side, candidate] : [candidate];
    const results: Record<Side["label"], Measurement[]> = {
      baseline: [],
      candidate: [],
    };
    if (only !== "core") {
      await Promise.all(sides.map(buildCli));
      const build = await benchBuild(sides);
      results.baseline.push(...build.baseline);
      results.candidate.push(...build.candidate);
    }
    if (only !== "build") {
      // One side at a time: concurrent suites would contend for the CPU.
      const collectCore = async (queue: Side[]): Promise<void> => {
        const [side, ...rest] = queue;
        if (!side) {
          return;
        }
        results[side.label].push(...(await benchCore(side)));
        await collectCore(rest);
      };
      await collectCore(sides);
    }

    const rows = compare(results.candidate, results.baseline);
    const slow = regressions(rows, threshold);
    const table = formatTable(rows, threshold);
    let verdict = "No baseline given (pass --base <ref> to compare).";
    if (baseline) {
      verdict =
        slow.length === 0
          ? `No benchmark slowed by more than ${threshold}% (or output grew by more than ${DETERMINISTIC_THRESHOLD_PERCENT}%) against ${values.base}.`
          : `${slow.length} benchmark(s) regressed against ${values.base}: timings slower than ${threshold}% or output larger than ${DETERMINISTIC_THRESHOLD_PERCENT}%.`;
    }
    const report = `## Benchmarks\n\n${table}\n\n${verdict}\n`;
    console.log(`\n${report}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, report, "utf-8");
    }
    return slow.length === 0 ? 0 : 1;
  } finally {
    if (baseline) {
      await removeBaseline(baseline.dir);
    }
  }
};

process.exit(await main());
