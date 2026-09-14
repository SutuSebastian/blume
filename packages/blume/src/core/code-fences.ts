/**
 * Fenced-code state for line scanners. Kept free of imports so request-time
 * code (the Ask AI grounding excerpts) can share it with the build-time source
 * scanners without pulling the filesystem and schema modules along.
 *
 * CommonMark allows backtick *and* tilde fences, three or more characters
 * long. The scanners track which delimiter opened the current fence and how
 * long its run was (`null` when outside one), so a ``` line inside a ~~~
 * block — or inside a ````-delimited block (the wrapper `codeBlockLines`
 * emits around code that contains its own ``` fence) — is content, not a
 * toggle.
 */
const CODE_FENCE = /^(?<run>`{3,}|~{3,})/u;

/** The open fence's delimiter char and run length, or null outside one. */
export type FenceState = { delimiter: "`" | "~"; length: number } | null;

/**
 * Advance the fenced-code state for one line: an opening fence records its
 * delimiter and run length, only a bare run of the same character at least as
 * long closes it (CommonMark), and any other line leaves the state untouched.
 */
export const nextFenceState = (line: string, fence: FenceState): FenceState => {
  const trimmed = line.trimStart();
  const run = trimmed.match(CODE_FENCE)?.groups?.run;
  if (run === undefined) {
    return fence;
  }
  const rest = trimmed.slice(run.length);
  const delimiter = run.startsWith("`") ? ("`" as const) : ("~" as const);
  if (fence === null) {
    // A backtick fence's info string cannot itself contain a backtick
    // (CommonMark) — a line-leading ```inline``` span is a paragraph, and
    // opening a phantom fence on it would swallow every heading and link
    // after it. Tilde fences carry no such rule.
    if (delimiter === "`" && rest.includes("`")) {
      return fence;
    }
    return { delimiter, length: run.length };
  }
  // A closing fence may be followed only by whitespace: a same-length
  // ```js line inside an open ``` block is content, not a closer.
  return fence.delimiter === delimiter &&
    run.length >= fence.length &&
    rest.trim() === ""
    ? null
    : fence;
};
