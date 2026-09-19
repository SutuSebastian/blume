import { describe, expect, it } from "bun:test";

import { z } from "zod";

import type { AdapterDescriptor } from "../src/core/adapter.ts";
import { adapterDescriptorSchema } from "../src/core/adapter.ts";

const optionsSchema = z.strictObject({
  key: z.string().min(1),
  region: z.string().default("us"),
});

const schema = adapterDescriptorSchema("example", optionsSchema);

const valid: AdapterDescriptor<"example", { key: string }> = {
  kind: "example",
  options: { key: "abc" },
  requiredSecrets: ["EXAMPLE_TOKEN"],
  runtimeDeps: ["example-sdk"],
};

describe("adapterDescriptorSchema", () => {
  it("accepts a descriptor and applies the option schema's defaults", () => {
    const parsed = schema.parse(valid);
    expect(parsed).toStrictEqual({
      kind: "example",
      options: { key: "abc", region: "us" },
      requiredSecrets: ["EXAMPLE_TOKEN"],
      runtimeDeps: ["example-sdk"],
    });
  });

  it("rejects a descriptor of another kind", () => {
    const result = schema.safeParse({ ...valid, kind: "other" });
    expect(result.success).toBeFalsy();
  });

  it("rejects a bare { kind, options } missing the contract arrays", () => {
    const result = schema.safeParse({
      kind: "example",
      options: { key: "abc" },
    });
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toStrictEqual(["requiredSecrets", "runtimeDeps"]);
  });

  it("reports an option failure at options.<key>", () => {
    const result = schema.safeParse({ ...valid, options: { key: "" } });
    const paths = result.success
      ? []
      : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toStrictEqual(["options.key"]);
  });

  it("rejects unknown descriptor fields", () => {
    const result = schema.safeParse({ ...valid, extra: true });
    expect(result.success).toBeFalsy();
  });
});
