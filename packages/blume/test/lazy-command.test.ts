import { describe, expect, it } from "bun:test";

import { parseArgs } from "citty";
import type { CommandContext, CommandDef } from "citty";
import { join } from "pathe";

import { commandMeta } from "../src/cli/command-meta.ts";
import { lazyCommand } from "../src/cli/lazy-command.ts";

const CLI_DIR = join(import.meta.dir, "..", "src", "cli");
const META = join(CLI_DIR, "command-meta.ts");
const COMMANDS = join(CLI_DIR, "commands");

const context: CommandContext = {
  args: parseArgs([], {}),
  cmd: {},
  rawArgs: [],
};

const meta = { description: "A fixture.", name: "fixture" };

/** A loader that counts its calls so the tests can see when the import ran. */
const loader = (fixture: CommandDef) => {
  const calls = { count: 0 };
  const load = () => {
    calls.count += 1;
    return Promise.resolve({ fixture });
  };
  return { calls, load };
};

describe("lazyCommand", () => {
  it("exposes meta without loading the command", () => {
    const { calls, load } = loader({});
    const command = lazyCommand(meta, load, "fixture");
    expect(command.meta).toBe(meta);
    expect(calls.count).toBe(0);
  });

  it("loads the command once its args are resolved", async () => {
    const args = { flag: { type: "boolean" } } as const;
    const { calls, load } = loader({ args });
    const command = lazyCommand(meta, load, "fixture");
    expect(calls.count).toBe(0);
    expect(command.args).toBeFunction();
    // SAFETY: `lazyCommand` always returns `args` as a thunk (asserted above).
    const resolve = command.args as () => Promise<typeof args>;
    expect(await resolve()).toBe(args);
    expect(calls.count).toBe(1);
  });

  it("forwards setup, run, and cleanup to the loaded command", async () => {
    const seen: string[] = [];
    const { load } = loader({
      cleanup: () => {
        seen.push("cleanup");
      },
      run: () => {
        seen.push("run");
      },
      setup: () => {
        seen.push("setup");
      },
    });
    const command = lazyCommand(meta, load, "fixture");
    await command.setup?.(context);
    await command.run?.(context);
    await command.cleanup?.(context);
    expect(seen).toEqual(["setup", "run", "cleanup"]);
  });

  it("tolerates a command without hooks", async () => {
    const { load } = loader({});
    const command = lazyCommand(meta, load, "fixture");
    await expect(command.setup?.(context)).resolves.toBeUndefined();
    await expect(command.run?.(context)).resolves.toBeUndefined();
    await expect(command.cleanup?.(context)).resolves.toBeUndefined();
  });
});

describe("command registry", () => {
  // `lazyCommand` hands citty the loaded `args` as-is (see the SAFETY note
  // there), which is only sound while every command declares its args as a
  // plain object. This walks the real command modules to keep that true, and
  // checks each one reads its `meta` from the shared table. It runs in a
  // subprocess: importing the commands here would pull their whole dependency
  // graphs into this process (and into the coverage report) for one check.
  it("declares every command's args as a plain object and shares its meta", async () => {
    const script = `
      const { commandMeta } = await import(${JSON.stringify(META)});
      const report = {};
      for (const [name, meta] of Object.entries(commandMeta)) {
        const module = await import(${JSON.stringify(COMMANDS)} + "/" + name + ".ts");
        const command = Object.values(module).find((value) => value.meta === meta);
        report[name] = command === undefined ? "missing" : Object.prototype.toString.call(command.args);
      }
      console.log(JSON.stringify(report));
    `;
    const proc = Bun.spawn([process.execPath, "-e", script], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stderr, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
      new Response(proc.stdout).text(),
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const report: Record<string, string> = JSON.parse(stdout);
    expect(Object.keys(report).toSorted()).toEqual(
      Object.keys(commandMeta).toSorted()
    );
    for (const [name, args] of Object.entries(report)) {
      expect(args, `${name}`).toBe("[object Object]");
    }
  }, 30_000);
});
