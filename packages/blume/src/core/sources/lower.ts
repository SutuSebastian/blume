/**
 * Shared primitives for lowering a CMS's rich-text tree to Markdown text.
 * Every rich-text lowerer (Portable Text, Contentful, Lexical, Strapi
 * blocks) renders inline runs, wraps them in block syntax, and joins blocks
 * with blank lines; these helpers keep that Markdown identical across them.
 */

// Markdown/raw-HTML structure characters. Rich-text leaves are *plain text* —
// formatting arrives as marks, never as syntax in the text — so a literal
// `*`, `_`, `[`, backtick, `~`, or `<` typed in the CMS must render as
// itself. Unescaped, it opened emphasis or a code span mid-paragraph, and `<`
// let CMS prose inject raw HTML into the rendered page. CommonMark
// backslash-escapes every ASCII punctuation character, so `\*` is always the
// literal asterisk.
const MARKDOWN_SPECIALS = /[\\`*_[\]~<]/gu;

// Block syntax is only syntax at the start of a line: `# `, `- `, `+ ` and
// `1. `/`1) ` need the space (or line end) to become a heading or list item,
// while `>` opens a quote on its own. A CMS paragraph that begins with one of
// these — a soft break inside it counts as a line start too — must stay prose.
const BLOCK_START = /^(?<marker>[#+-]|\d+[.)])(?=[ \t]|$)|^(?<quote>>)/gmu;

const escapeBlockStart = (text: string): string =>
  text.replaceAll(BLOCK_START, (marker: string) => {
    // A numbered marker escapes its punctuation (`1\.`), the rest themselves.
    const index = marker.search(/[.)]/u);
    return index === -1
      ? `\\${marker}`
      : `${marker.slice(0, index)}\\${marker.slice(index)}`;
  });

export const escapeMarkdownText = (text: string): string =>
  escapeBlockStart(text.replaceAll(MARKDOWN_SPECIALS, String.raw`\$&`));

/** The marks a lowerer can put on an inline run. */
export interface InlineMarks {
  bold?: boolean;
  code?: boolean;
  italic?: boolean;
  strike?: boolean;
}

const BACKTICK_RUN = /`+/gu;

/** The longest run of backticks in `text`, 0 when there is none. */
const longestBacktickRun = (text: string): number => {
  let longest = 0;
  for (const run of text.match(BACKTICK_RUN) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return longest;
};

/**
 * A code span whose delimiter outruns any backtick run inside it, padded with
 * a space on each side when the code starts or ends with a backtick (the
 * CommonMark rule that keeps the padding out of the rendered code).
 */
export const codeSpan = (code: string): string => {
  const fence = "`".repeat(longestBacktickRun(code) + 1);
  const pad = code.startsWith("`") || code.endsWith("`") ? " " : "";
  return `${fence}${pad}${code}${pad}${fence}`;
};

const EDGE_SPACE = /^(?<lead>\s*)(?<body>[\s\S]*?)(?<trail>\s*)$/u;

/**
 * Wrap a text run in the Markdown for its marks. Code stays verbatim inside
 * the backticks (an escape would render as a backslash); everything else is
 * escaped first. Whitespace at either edge moves outside the delimiters,
 * since `** bold **` is not strong emphasis but `**bold**` is — editors
 * routinely bold a word together with the space after it.
 */
export const renderInline = (text: string, marks: InlineMarks): string => {
  const match = EDGE_SPACE.exec(text);
  const lead = match?.groups?.lead ?? "";
  const body = match?.groups?.body ?? "";
  const trail = match?.groups?.trail ?? "";
  if (body === "") {
    return text;
  }
  let out = marks.code ? codeSpan(body) : escapeMarkdownText(body);
  if (marks.bold) {
    out = `**${out}**`;
  }
  if (marks.italic) {
    out = `*${out}*`;
  }
  if (marks.strike) {
    out = `~~${out}~~`;
  }
  return `${lead}${out}${trail}`;
};

// A destination with whitespace or parentheses ends early in `[label](…)`;
// CommonMark's pointy-bracket form carries it intact.
const UNSAFE_DESTINATION = /[\s()]/u;

/** A link or image destination as Markdown can carry it verbatim. */
export const destination = (url: string): string =>
  UNSAFE_DESTINATION.test(url) ? `<${url}>` : url;

/** A Markdown link, or the label alone when the target is missing. */
export const renderLink = (label: string, href?: string): string =>
  href ? `[${label}](${destination(href)})` : label;

/** The ATX prefix for a heading level, clamped to Markdown's six. */
export const headingPrefix = (level: number): string =>
  `${"#".repeat(Math.min(Math.max(Math.trunc(level), 1), 6))} `;

/** Quote every line of a block. */
export const blockquote = (text: string): string =>
  text
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");

/**
 * A list item: the marker on the first line, and every continuation line
 * indented to the marker's width so nested blocks stay inside the item.
 */
export const listItem = (marker: string, body: string): string => {
  const [first = "", ...rest] = body.split("\n");
  const pad = " ".repeat(marker.length + 1);
  return [
    `${marker} ${first}`,
    ...rest.map((line) => (line === "" ? "" : `${pad}${line}`)),
  ].join("\n");
};

/** Indent every non-empty line, for a nested list hanging off an item. */
export const indent = (text: string, width: number): string => {
  const pad = " ".repeat(width);
  return text
    .split("\n")
    .map((line) => (line === "" ? "" : `${pad}${line}`))
    .join("\n");
};

/** A fenced code block whose fence outruns any backtick run in the code. */
export const codeFence = (code: string, language = ""): string => {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(code) + 1));
  return `${fence}${language}\n${code}\n${fence}`;
};

/** A Markdown image; the alt is escaped so a `]` in a caption can't close it. */
export const image = (alt: string, url: string): string =>
  `![${escapeMarkdownText(alt)}](${destination(url)})`;

/** A comment marking a node the lowerer has no Markdown for. */
export const unsupported = (what: string): string =>
  `<!-- unsupported ${what} -->`;

/** Blocks separated by blank lines; empty blocks are dropped. */
export const joinBlocks = (blocks: string[]): string =>
  blocks.filter((block) => block !== "").join("\n\n");

/** A whole document: its blocks plus the trailing newline a file ends with. */
export const markdownDocument = (blocks: string[]): string =>
  `${joinBlocks(blocks)}\n`;

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/iu;

/**
 * A media URL as a static site can reference it. A protocol-relative
 * Contentful asset (`//images.ctfassets.net/…`) gets `https:`; a path a
 * self-hosted CMS serves (`/uploads/x.png`) resolves against the CMS origin.
 */
export const absoluteUrl = (url: string, base?: string): string => {
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  if (ABSOLUTE.test(url) || base === undefined) {
    return url;
  }
  return new URL(url, base).href;
};
