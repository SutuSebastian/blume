import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import { commandMeta } from "../src/cli/command-meta.ts";

const CLI = join(import.meta.dir, "..", "src", "cli", "index.ts");
const GUARD = "unselected command module was loaded";
const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/**
 * Run the source CLI under a Bun preload plugin that throws when any module in
 * `src/cli/commands/` other than `selected` is loaded. `selected: undefined`
 * rejects every command module — for the paths (root usage, a bare `blume`,
 * an unknown name) that must not load any of them.
 */
const guardedCli = async (selected?: string, ...args: string[]) => {
  const root = await mkdtemp(join(tmpdir(), "blume-cli-lazy-"));
  dirs.push(root);
  const allowed = selected === undefined ? "" : `(?!${selected}\\.ts$)`;
  const preload = join(root, "preload.ts");
  await writeFile(
    preload,
    [
      "Bun.plugin({",
      '  name: "reject-unselected-commands",',
      "  setup(build) {",
      `    build.onLoad({ filter: /[/\\\\]commands[/\\\\]${allowed}[^/\\\\]+\\.ts$/ }, (args) => {`,
      `      throw new Error(${JSON.stringify(GUARD)} + ": " + args.path);`,
      "    });",
      "  },",
      "});",
      "",
    ].join("\n")
  );
  const proc = Bun.spawn(
    [process.execPath, "--preload", preload, CLI, ...args],
    { cwd: root, stderr: "pipe", stdout: "pipe" }
  );
  const [exitCode, stderr, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
    new Response(proc.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
};

describe("lazy CLI commands", () => {
  it("runs a selected command without loading the other command modules", async () => {
    const result = await guardedCli("eval", "eval", "--agent", "copilot");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --agent "copilot"');
    expect(result.stderr).not.toContain(GUARD);
  }, 30_000);

  it("renders a selected command's help without loading the others", async () => {
    const result = await guardedCli("eval", "eval", "--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Test the docs");
    expect(result.stdout).toContain("--threshold");
    expect(result.stderr).not.toContain(GUARD);
  }, 30_000);

  it("keeps preview independent of the dev command graph", async () => {
    const result = await guardedCli("preview", "preview", "--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(commandMeta.preview.description);
    expect(result.stdout).toContain("--host");
    expect(result.stderr).not.toContain(GUARD);
  }, 30_000);

  it("renders root usage from static meta without loading any command", async () => {
    const result = await guardedCli(undefined, "--help");
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(GUARD);
    for (const meta of Object.values(commandMeta)) {
      expect(result.stdout).toContain(meta.name);
      expect(result.stdout).toContain(meta.description);
    }
  }, 30_000);

  it("reports a missing command without loading any command", async () => {
    const result = await guardedCli();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No command specified");
    expect(result.stderr).not.toContain(GUARD);
    expect(result.stdout).toContain("COMMANDS");
  }, 30_000);

  it("reports an unknown command without loading any command", async () => {
    const result = await guardedCli(undefined, "typo");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).not.toContain(GUARD);
  }, 30_000);
});
