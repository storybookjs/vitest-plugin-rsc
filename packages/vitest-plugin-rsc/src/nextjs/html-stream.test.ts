import { expect, test } from "vitest";
import { endOfCompleteScripts } from "./html-stream.ts";

// What the parser gets of a document that arrives in these chunks.
function written(chunks: string[]): string[] {
  const writes: string[] = [];
  let pending = "";
  for (const chunk of chunks) {
    pending += chunk;
    const end = endOfCompleteScripts(pending);
    writes.push(pending.slice(0, end));
    pending = pending.slice(end);
  }
  return [...writes, pending];
}

test("passes on html without scripts as it arrives", () => {
  expect(written(["<main><p>a", "</p></main>"])).toEqual(["<main><p>a", "</p></main>", ""]);
});

test("holds back a script until its end tag is there", () => {
  expect(written(["<p>a</p><script>let a = ", "1;</script><p>b</p>"])).toEqual([
    "<p>a</p>",
    "<script>let a = 1;</script><p>b</p>",
    "",
  ]);
});

test("holds back a script whose start tag is cut off", () => {
  expect(written(["<p>a</p><scr", "ipt>let a = ", "1;</SCRIPT>"])).toEqual([
    "<p>a</p>",
    "",
    "<script>let a = 1;</SCRIPT>",
    "",
  ]);
});

test("passes on what is left when the document ends", () => {
  expect(written(["<p>a < b</p><"])).toEqual(["<p>a < b</p>", "<"]);
});
