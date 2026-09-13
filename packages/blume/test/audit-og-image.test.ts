import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { join } from "pathe";
import sharp from "sharp";

import { ogImageChecks } from "../src/audit/checks/og-image.ts";
import { imageSize } from "../src/audit/image-size.ts";
import { codes, context, snapshot } from "./audit-support.ts";

/** The og:image byte checks, and the sharp-backed dimension reader under them. */

const dirs: string[] = [];

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

type Raster = "avif" | "gif" | "jpeg" | "png" | "webp";

/** A real, fully encoded image of the given size — what a build emits. */
const raster = (
  format: Raster,
  width: number,
  height: number
): Promise<Buffer> =>
  sharp({ create: { background: "#123456", channels: 3, height, width } })
    .toFormat(format)
    .toBuffer();

const png = (width: number, height: number) => raster("png", width, height);

/**
 * A box-structured file whose first box declares a size of zero. The retired
 * pure-JS parser advanced its offset by that size and looped forever on
 * HEIF/AVIF and JXL containers; the ICNS parser did the same on a zero entry
 * length. Both are the shapes from the image-size advisories.
 */
const box = (name: string, payload: Buffer, size = 8 + payload.length) => {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size, 0);
  header.write(name, 4, "latin1");
  return Buffer.concat([header, payload]);
};

const zeroSizedAvif = (): Buffer =>
  Buffer.concat([
    box("ftyp", Buffer.from("avifmif1", "latin1")),
    box(
      "meta",
      Buffer.concat([
        Buffer.alloc(4),
        box(
          "iprp",
          box(
            "ipco",
            Buffer.concat([box("ispe", Buffer.alloc(12), 0), Buffer.alloc(8)])
          )
        ),
      ])
    ),
  ]);

const zeroLengthIcns = (): Buffer => {
  const bytes = Buffer.alloc(32);
  bytes.write("icns", 0, "latin1");
  bytes.writeUInt32BE(32, 4);
  bytes.write("ic07", 8, "latin1");
  bytes.writeUInt32BE(0, 12);
  return bytes;
};

describe("imageSize", () => {
  it("reads PNG, JPEG, and GIF headers", async () => {
    expect(await imageSize(await raster("png", 1200, 630))).toEqual({
      height: 630,
      width: 1200,
    });
    expect(await imageSize(await raster("jpeg", 800, 400))).toEqual({
      height: 400,
      width: 800,
    });
    expect(await imageSize(await raster("gif", 120, 60))).toEqual({
      height: 60,
      width: 120,
    });
  });

  it("reads WebP and AVIF — the formats the build's optimizer emits", async () => {
    expect(await imageSize(await raster("webp", 1200, 630))).toEqual({
      height: 630,
      width: 1200,
    });
    expect(await imageSize(await raster("avif", 1200, 630))).toEqual({
      height: 630,
      width: 1200,
    });
  });

  it("returns null for unknown formats and truncated files", async () => {
    expect(await imageSize(Buffer.from("not an image"))).toBeNull();
    expect(await imageSize(Buffer.alloc(0))).toBeNull();
    const truncatedPng = await png(1, 1);
    expect(await imageSize(truncatedPng.subarray(0, 10))).toBeNull();
    const truncatedJpeg = await raster("jpeg", 10, 10);
    expect(await imageSize(truncatedJpeg.subarray(0, 8))).toBeNull();
  });

  it("rejects zero-sized container boxes instead of looping on them", async () => {
    // A hang here would trip the test timeout: the point is that measuring
    // finishes at all, and that a crafted file is simply "not measurable".
    expect(await imageSize(zeroSizedAvif())).toBeNull();
    expect(await imageSize(zeroLengthIcns())).toBeNull();
  });
});

const staticDir = async (files: Record<string, Buffer>): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "blume-og-"));
  dirs.push(dir);
  await Promise.all(
    Object.entries(files).map(([name, bytes]) =>
      writeFile(join(dir, name), bytes)
    )
  );
  return dir;
};

const SITE = "https://x.dev";

const withOg = (image: string) =>
  snapshot({
    og: {
      "og:description": "d",
      "og:image": image,
      "og:title": "t",
      "og:type": "website",
      "og:url": "https://x.dev/",
    },
  });

const run = async (
  ctx: ReturnType<typeof context>,
  dir: string,
  files: Map<string, number>
): Promise<string[]> => {
  ctx.staticDir = dir;
  ctx.files = files;
  return codes(await ogImageChecks.run(ctx));
};

describe("ogImageChecks", () => {
  it("is silent on an og:image that exists at a shareable size", async () => {
    const dir = await staticDir({ "og.png": await png(1200, 630) });
    const ctx = context({ pages: [withOg(`${SITE}/og.png`)], site: SITE });
    expect(await run(ctx, dir, new Map([["/og.png", 24]]))).toEqual([]);
  });

  it("reports an og:image the build does not contain", async () => {
    const dir = await staticDir({});
    const ctx = context({ pages: [withOg(`${SITE}/gone.png`)], site: SITE });
    expect(await run(ctx, dir, new Map())).toContain("OG_IMAGE_BROKEN");
  });

  it("reports an og:image below the large-card floor", async () => {
    const dir = await staticDir({ "og.png": await png(400, 200) });
    const ctx = context({ pages: [withOg(`${SITE}/og.png`)], site: SITE });
    expect(await run(ctx, dir, new Map([["/og.png", 24]]))).toContain(
      "OG_IMAGE_SMALL"
    );
  });

  it("reads a shared og:image once across pages", async () => {
    const dir = await staticDir({ "og.png": await png(400, 200) });
    const ctx = context({
      pages: [
        withOg(`${SITE}/og.png`),
        { ...withOg(`${SITE}/og.png`), url: "/b" },
      ],
      site: SITE,
    });
    const found = await run(ctx, dir, new Map([["/og.png", 24]]));
    expect(found.filter((code) => code === "OG_IMAGE_SMALL")).toHaveLength(2);
  });

  it("stays quiet when the indexed file cannot be read back", async () => {
    // The file index vouches for the path but the bytes are unreadable —
    // existence was already established, so this is not a finding.
    const dir = await staticDir({});
    const ctx = context({ pages: [withOg(`${SITE}/og.png`)], site: SITE });
    expect(await run(ctx, dir, new Map([["/og.png", 24]]))).toEqual([]);
  });

  it("skips external images, unknown formats, and pages with no og:image", async () => {
    const dir = await staticDir({ "og.svg": Buffer.from("<svg/>") });
    const ctx = context({
      pages: [
        withOg("https://cdn.example.com/og.png"),
        withOg(`${SITE}/og.svg`),
        snapshot({ og: {}, url: "/plain" }),
      ],
      site: SITE,
    });
    expect(await run(ctx, dir, new Map([["/og.svg", 6]]))).toEqual([]);
  });
});
