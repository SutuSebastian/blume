import { mkdir, writeFile } from "node:fs/promises";

import { dirname, join } from "pathe";

/**
 * Build a local Pagefind search index over the built site. Pagefind indexes
 * every rendered page except those whose `<html>` carries
 * `data-pagefind-ignore`, which Blume stamps on non-indexable pages
 * (search-excluded, or hidden without the opt-in), so those stay out.
 *
 * The index files are fetched with `getFiles()` and written here rather than
 * with Pagefind's `writeFiles()`: in service mode Pagefind acknowledges
 * `writeFiles()` once tokio has buffered the writes, not once they are on
 * disk, and `close()` kills the backend, so a loaded CI host can ship a
 * truncated `pagefind-entry.json` (Pagefind/pagefind#1271). Writing the bytes
 * ourselves puts them on disk before the backend goes away. Fixed upstream in
 * Pagefind/pagefind#1272; switch back to `writeFiles()` once a release ships
 * that fix.
 *
 * Returns the number of pages indexed.
 */
export const buildSearchIndex = async (outDir: string): Promise<number> => {
  const pagefind = await import("pagefind");

  const { index } = await pagefind.createIndex({});
  if (!index) {
    throw new Error("Failed to create Pagefind index.");
  }

  // These awaits are strictly ordered, not independent: the directory must be
  // indexed before its files are read, and the index closed only after.
  // oxlint-disable-next-line react-doctor/async-parallel
  const result = await index.addDirectory({ path: outDir });
  const { files } = await index.getFiles();
  await pagefind.close();

  const searchDir = join(outDir, "pagefind");
  const directories = new Set(
    files.map((file) => dirname(join(searchDir, file.path)))
  );
  await Promise.all(
    [...directories].map((directory) => mkdir(directory, { recursive: true }))
  );
  await Promise.all(
    files.map((file) => writeFile(join(searchDir, file.path), file.content))
  );

  return result.page_count;
};
