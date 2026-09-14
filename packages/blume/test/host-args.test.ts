import { describe, expect, it } from "bun:test";

import { normalizeHost, normalizeHostArgs } from "../src/cli/host-args.ts";

describe("normalizeHostArgs", () => {
  it("rewrites a trailing bare --host to --host=", () => {
    expect(normalizeHostArgs(["dev", "--host"])).toEqual(["dev", "--host="]);
  });

  it("rewrites a bare --host that sits before another flag", () => {
    expect(normalizeHostArgs(["dev", "--host", "--open"])).toEqual([
      "dev",
      "--host=",
      "--open",
    ]);
    expect(normalizeHostArgs(["dev", "--host", "-p", "1"])).toEqual([
      "dev",
      "--host=",
      "-p",
      "1",
    ]);
  });

  it("leaves an explicit host value and unrelated args alone", () => {
    const argv = ["dev", "--host", "10.0.0.1", "--open", "--host=0.0.0.0"];
    expect(normalizeHostArgs(argv)).toEqual(argv);
  });
});

describe("normalizeHost", () => {
  it('maps a bare --host (parsed as "") to bind-all', () => {
    expect(normalizeHost("")).toBe(true);
  });

  it("keeps an explicit address", () => {
    expect(normalizeHost("10.0.0.1")).toBe("10.0.0.1");
  });

  it("defaults to localhost only when absent", () => {
    expect(normalizeHost()).toBe(false);
  });
});
