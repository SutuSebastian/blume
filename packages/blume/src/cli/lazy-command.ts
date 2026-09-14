import type { ArgsDef, CommandDef, CommandMeta } from "citty";

/**
 * Wrap a command so its module is imported only when citty needs its `args`
 * or runs it. `meta` stays static (from `command-meta.ts`), so rendering root
 * usage, matching an unknown name, and `blume <cmd> --help` for *another*
 * command never touch this one's dependency graph.
 *
 * `load` imports the command's module and `key` names its export, so the call
 * site stays a plain `() => import("./commands/x.ts")`.
 *
 * Only `args`, `setup`, `run`, and `cleanup` are forwarded: no Blume command
 * declares `default`, `plugins`, or nested `subCommands`.
 */
export const lazyCommand = <Args extends ArgsDef, Key extends string>(
  meta: CommandMeta,
  load: () => Promise<Record<Key, CommandDef<Args>>>,
  key: Key
): CommandDef<Args> => {
  const command = async () => {
    const module = await load();
    return module[key];
  };
  return {
    args: async () => {
      const { args } = await command();
      // SAFETY: every Blume command passes `args` to `defineCommand` as a plain
      // object literal (the "command registry" test checks it); citty's
      // `Resolvable` widening is the only reason the type also admits a thunk
      // or a promise here.
      return args as Args;
    },
    cleanup: async (context) => {
      const loaded = await command();
      await loaded.cleanup?.(context);
    },
    meta,
    run: async (context) => {
      const loaded = await command();
      await loaded.run?.(context);
    },
    setup: async (context) => {
      const loaded = await command();
      await loaded.setup?.(context);
    },
  };
};
