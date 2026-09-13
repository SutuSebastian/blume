/**
 * In-process benchmarks of Blume's hot paths, on mitata (Bun's recommended
 * microbenchmark tool): the core scan that every command starts with, the
 * build-time surfaces derived from it (search documents, agent Markdown, LLM
 * files), and the per-page Markdown/MDX compile and Shiki highlight. They run
 * against a synthetic fixture (see `fixture.ts`) so numbers are comparable
 * across checkouts.
 *
 *   bun bench/core.bench.ts            # mitata's table
 *   bun bench/core.bench.ts --json     # mitata's JSON, for `run.ts`
 */
import { parseArgs } from "node:util";

import { bench, run } from "mitata";
import { markdownToHtml, mdxToJs } from "satteri";

import { buildLlmsFiles } from "../src/ai/llms.ts";
import { buildRawMarkdown } from "../src/ai/markdown.ts";
import matter from "../src/core/frontmatter.ts";
import { packageRoot } from "../src/core/package-root.ts";
import { scanProject } from "../src/core/project-graph.ts";
import {
  blumeMarkdownProcessor,
  blumeMdxProcessor,
  highlightCode,
} from "../src/markdown/index.ts";
import { buildSearchDocuments } from "../src/search/documents.ts";
import { createFixture, pageSource } from "./fixture.ts";

const { values } = parseArgs({
  options: {
    json: { default: false, type: "boolean" },
    pages: { default: "150", type: "string" },
  },
});
const pages = Number(values.pages);

const fixture = await createFixture({ packageRoot: packageRoot(), pages });
try {
  const project = await scanProject(fixture.root, { mode: "build" });
  // Page 0 is plain Markdown, page 1 is MDX (see `fixture.ts`).
  const markdownPage = pageSource(0, pages);
  const mdxPage = pageSource(1, pages);
  const markdownOptions = blumeMarkdownProcessor().options;
  const mdxOptions = blumeMdxProcessor().options;
  const snippet = [
    `import { defineConfig } from "blume";`,
    "",
    "export default defineConfig({",
    `  deployment: { site: "https://bench.example.com" },`,
    "  theme: { accent: 'violet' },",
    "});",
  ].join("\n");

  bench(`scanProject (${pages} pages)`, () =>
    scanProject(fixture.root, { mode: "build" }));
  bench("buildSearchDocuments", () => buildSearchDocuments(project));
  bench("buildRawMarkdown", () => buildRawMarkdown(project));
  bench("buildLlmsFiles", () => buildLlmsFiles(project));
  bench("frontmatter (one page)", () => matter(mdxPage));
  bench("markdownToHtml (one .md page)", () =>
    markdownToHtml(markdownPage, markdownOptions));
  bench("mdxToJs (one .mdx page)", () => mdxToJs(mdxPage, mdxOptions));
  bench("highlightCode (one ts fence)", () => highlightCode(snippet, "ts"));

  if (values.json) {
    // Mitata prints the JSON report with one console.log. On a pipe that can
    // exceed the kernel buffer, and the process exits before the reader
    // drains it, truncating the report — so collect it and flush it with an
    // awaited write instead.
    let report = "";
    await run({
      // The stats are enough; the raw samples run to tens of megabytes.
      format: { json: { debug: false, samples: false } },
      print: (text) => {
        report += text;
      },
    });
    await Bun.write(Bun.stdout, `${report}\n`);
  } else {
    await run();
  }
} finally {
  await fixture.cleanup();
}
