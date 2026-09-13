/**
 * The benchmark runner: `bun run bench [--base <git ref>]`.
 *
 * Measures this checkout — `blume build` over a synthetic docs project with
 * hyperfine (Bun's recommended CLI benchmark tool), plus the in-process hot
 * paths in `core.bench.ts` — and, with `--base`, the same for a second
 * checkout of that ref, then fails when a median slowed by more than the
 * threshold. Both sides run on the same machine back to back, so the
 * comparison is insensitive to how fast that machine is on the day; this is
 * what CI runs against the merge base (`.github/workflows/bench.yml`).
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
  formatTable,
  fromHyperfine,
  fromMitata,
  regressions,
} from "./compare.ts";
import type { Measurement } from "./compare.ts";
import { createFixture } from "./fixture.ts";

const { values } = parseArgs({
  options: {
    /** A git ref to A/B against; omit to measure this checkout alone. */
    base: { type: "string" },
    /** Which suite to run: `build`, `core`, or both by default. */
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

/** `blume build` wall clock per side, one hyperfine session for all sides. */
const benchBuild = async (
  sides: Side[]
): Promise<Record<Side["label"], Measurement[]>> => {
  const fixtures = await Promise.all(
    sides.map((side) => createFixture({ packageRoot: side.pkg, pages }))
  );
  const scratch = await mkdtemp(join(tmpdir(), "blume-bench-hyperfine-"));
  const exportPath = join(scratch, "results.json");
  try {
    const commands = sides.flatMap((side, index) => [
      "--command-name",
      side.label,
      `cd ${$.escape(fixtures[index]?.root ?? "")} && node ${$.escape(join(side.pkg, "bin/blume.mjs"))} build`,
    ]);
    log(
      `Timing \`blume build\` over ${pages} pages (1 warmup + ${runs} runs per side)`
    );
    await $`hyperfine --warmup 1 --runs ${runs} --export-json ${exportPath} ${commands}`.env(
      { ...process.env, NO_COLOR: "1" }
    );
    const results = fromHyperfine(await Bun.file(exportPath).text());
    const name = `blume build (${pages} pages)`;
    const pick = (label: Side["label"]): Measurement[] =>
      results
        .filter((result) => result.name === label)
        .map((result) => ({ ...result, name }));
    return { baseline: pick("baseline"), candidate: pick("candidate") };
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
          ? `No benchmark slowed by more than ${threshold}% against ${values.base}.`
          : `${slow.length} benchmark(s) slowed by more than ${threshold}% against ${values.base}.`;
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
