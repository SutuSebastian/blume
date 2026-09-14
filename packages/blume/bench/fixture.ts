import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";

import { dirname, join } from "pathe";

/**
 * A synthetic docs project for the benchmarks: deterministic content (a seeded
 * generator, so every run and both sides of an A/B see identical bytes), sized
 * by page count, exercising the pipeline's typical per-page work — frontmatter,
 * headings, Shiki fences with meta, callout directives, tables, MDX components,
 * and internal links — under zero config plus a `deployment.site` (which turns
 * per-page OG cards on, so the build measures the whole pipeline).
 *
 * The project is created *inside* the package directory (`blume-bench-*`,
 * gitignored) with `node_modules/blume` linked back to it, exactly like the
 * e2e fixtures: the generated runtime resolves `blume/*` through that link, so
 * a fixture always benchmarks the checkout it lives in.
 */

const WORDS =
  "docs build render page config theme search index route sidebar heading fence callout table component island runtime static server adapter deploy cache asset image font locale version schema plugin markdown content graph manifest".split(
    " "
  );

const SECTIONS = ["getting-started", "guides", "reference", "concepts"];

/**
 * A Park–Miller generator: deterministic and dependency-free, and its state
 * stays below 2^47, so the arithmetic is exact in doubles. `seed` must be
 * positive.
 */
const MODULUS = 2_147_483_647;
const random = (seed: number): (() => number) => {
  let state = seed % MODULUS;
  return () => {
    state = (state * 48_271) % MODULUS;
    return state / MODULUS;
  };
};

const sentence = (next: () => number, words: number): string => {
  const picked = Array.from(
    { length: words },
    () => WORDS[Math.floor(next() * WORDS.length)]
  );
  const [first = "docs", ...rest] = picked;
  return `${first[0]?.toUpperCase()}${first.slice(1)} ${rest.join(" ")}.`;
};

const paragraph = (next: () => number): string =>
  Array.from({ length: 3 + Math.floor(next() * 3) }, () =>
    sentence(next, 8 + Math.floor(next() * 10))
  ).join(" ");

const codeFence = (index: number): string =>
  [
    `\`\`\`ts title="page-${index}.ts" {2}`,
    `import { defineConfig } from "blume";`,
    "",
    "export default defineConfig({",
    `  description: "Page ${index}",`,
    "});",
    "```",
  ].join("\n");

const table = (next: () => number): string =>
  [
    "| Option | Type | Default |",
    "| --- | --- | --- |",
    ...Array.from(
      { length: 4 },
      (_, row) =>
        `| \`${WORDS[Math.floor(next() * WORDS.length)]}\` | \`string\` | \`${row}\` |`
    ),
  ].join("\n");

const pageRoute = (index: number): string =>
  `/${SECTIONS[index % SECTIONS.length]}/page-${index}`;

/**
 * A representative content page's built HTML, relative to `dist/`: page 1 is
 * MDX (see `pageFile`) with the full complement of components, and its
 * sidebar lists every page, so its size tracks both per-page and per-site
 * markup costs.
 */
export const SAMPLE_PAGE_HTML = `${pageRoute(1).slice(1)}/index.html`;

const pageFile = (index: number, total: number): string => {
  const route = pageRoute(((index % total) + total) % total);
  return `docs${route}.${index % 5 === 0 ? "md" : "mdx"}`;
};

const mdxExtras = (index: number, next: () => number): string =>
  [
    "<Steps>",
    `  <Step title="Install">`,
    "",
    `    ${sentence(next, 10)}`,
    "",
    "    ```bash",
    "    npm i blume",
    "    ```",
    "",
    "  </Step>",
    `  <Step title="Configure">`,
    "",
    `    ${sentence(next, 10)}`,
    "",
    "  </Step>",
    "</Steps>",
    "",
    "<Tabs>",
    `  <Tab title="npm">`,
    "",
    "    ```bash",
    "    npm run build",
    "    ```",
    "",
    "  </Tab>",
    `  <Tab title="bun">`,
    "",
    "    ```bash",
    "    bun run build",
    "    ```",
    "",
    "  </Tab>",
    "</Tabs>",
    "",
    "<CardGroup cols={2}>",
    `  <Card title="Page ${index + 1}" href="${pageRoute(index + 1)}">${sentence(next, 6)}</Card>`,
    `  <Card title="Page ${index + 2}" href="${pageRoute(index + 2)}">${sentence(next, 6)}</Card>`,
    "</CardGroup>",
  ].join("\n");

/** The Markdown/MDX source of one synthetic page. */
export const pageSource = (index: number, total: number): string => {
  const next = random(index + 1);
  const mdx = index % 5 !== 0;
  const wrap = (index + 1) % total;
  const body = [
    "---",
    `title: Page ${index}`,
    `description: ${sentence(next, 12)}`,
    "---",
    "",
    paragraph(next),
    "",
    ":::note",
    sentence(next, 12),
    ":::",
    "",
    "## Overview",
    "",
    paragraph(next),
    "",
    `See [the next page](${pageRoute(wrap)}) and [the home page](/).`,
    "",
    codeFence(index),
    "",
    "## Options",
    "",
    table(next),
    "",
    "### Details",
    "",
    ...Array.from({ length: 4 }, () => `- ${sentence(next, 7)}`),
    "",
    ":::tip",
    sentence(next, 10),
    ":::",
    "",
    "## Usage",
    "",
    paragraph(next),
    "",
    mdx ? mdxExtras(index, next) : codeFence(index + total),
    "",
  ];
  return body.join("\n");
};

export interface Fixture {
  /** The project root: `blume build` runs here. */
  root: string;
  /** Remove the project. */
  cleanup: () => Promise<void>;
}

/**
 * Create a synthetic docs project with `pages` pages inside `packageRoot`
 * (the Blume checkout to benchmark).
 */
export const createFixture = async (options: {
  packageRoot: string;
  pages: number;
}): Promise<Fixture> => {
  const root = await mkdtemp(join(options.packageRoot, "blume-bench-"));
  const files: [string, string][] = [
    [
      "blume.config.ts",
      [
        `import { defineConfig } from "blume";`,
        "",
        "export default defineConfig({",
        `  deployment: { site: "https://bench.example.com" },`,
        "});",
        "",
      ].join("\n"),
    ],
    [
      "docs/index.mdx",
      [
        "---",
        "title: Benchmark fixture",
        "description: A synthetic documentation site.",
        "---",
        "",
        `This site has ${options.pages} generated pages.`,
        "",
      ].join("\n"),
    ],
    ...Array.from({ length: options.pages }, (_, index): [string, string] => [
      pageFile(index, options.pages),
      pageSource(index, options.pages),
    ]),
  ];
  await Promise.all(
    files.map(async ([relativePath, content]) => {
      const path = join(root, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf-8");
    })
  );
  await mkdir(join(root, "node_modules"), { recursive: true });
  await symlink(
    options.packageRoot,
    join(root, "node_modules/blume"),
    "junction"
  );
  return {
    cleanup: () => rm(root, { force: true, recursive: true }),
    root,
  };
};
