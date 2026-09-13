import { afterAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";

import { updatePackageScripts } from "../src/cli/eject-scripts.ts";

const dirs: string[] = [];

const makeRoot = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "blume-eject-scripts-"));
  dirs.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

/** The package.json fields these tests write and read back. */
interface TestPackageManifest {
  dependencies?: Record<string, string>;
  name?: string;
  scripts?: Record<string, string>;
}

const readPkg = async (root: string): Promise<TestPackageManifest> =>
  JSON.parse(await readFile(join(root, "package.json"), "utf-8"));

describe("updatePackageScripts", () => {
  it("rewrites the Blume scripts to run Astro directly", async () => {
    const root = await makeRoot();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "docs",
        scripts: { build: "blume build", dev: "blume dev" },
      })
    );
    await updatePackageScripts(root);
    const pkg = await readPkg(root);
    expect(pkg.scripts).toEqual({
      build: "astro build",
      dev: "astro dev",
      preview: "astro preview",
    });
  });

  it("preserves unrelated scripts and fields", async () => {
    const root = await makeRoot();
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: { blume: "^1.0.0" },
        name: "docs",
        scripts: { dev: "blume dev", lint: "eslint ." },
      })
    );
    await updatePackageScripts(root);
    const pkg = await readPkg(root);
    expect(pkg.dependencies).toEqual({ blume: "^1.0.0" });
    expect(pkg.scripts?.lint).toBe("eslint .");
    expect(pkg.scripts?.dev).toBe("astro dev");
  });

  it("adds a scripts block when the package.json has none", async () => {
    const root = await makeRoot();
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "d" }));
    await updatePackageScripts(root);
    const pkg = await readPkg(root);
    expect(pkg.scripts).toEqual({
      build: "astro build",
      dev: "astro dev",
      preview: "astro preview",
    });
  });

  it("leaves a project without a readable package.json alone", async () => {
    const root = await makeRoot();
    await updatePackageScripts(root);
    expect(existsSync(join(root, "package.json"))).toBe(false);

    await writeFile(join(root, "package.json"), "not json");
    await updatePackageScripts(root);
    expect(await readFile(join(root, "package.json"), "utf-8")).toBe(
      "not json"
    );
  });
});
