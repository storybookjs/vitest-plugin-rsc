// The count of solid characters, by which an exact text query rules an
// element out before it normalizes its text: two texts that normalize alike
// have the same count, as normalizing changes white space alone.

import { expect, test } from "vitest";
import { normalizeWhiteSpace, solidLength } from "../../src/text-match.ts";

test("a character is solid unless normalizing drops it or it is white space", () => {
  const differ: string[] = [];
  for (let code = 0; code <= 0xffff; code++) {
    const char = String.fromCharCode(code);
    if ((solidLength(char) === 1) === /[\s​­]/.test(char)) differ.push(code.toString(16));
  }
  expect(differ).toEqual([]);
});

test("a text and the text normalized have the same count", () => {
  const alphabet = ["a", "B", " ", "\n", " ", "​", "­", "é", "　", "\t", "😀"];
  // A generator of a fixed seed, so that a failure is the same each run.
  let seed = 1;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  for (let i = 0; i < 10_000; i++) {
    let text = "";
    for (let length = next(12); length > 0; length--) text += alphabet[next(alphabet.length)];
    expect(solidLength(normalizeWhiteSpace(text)), JSON.stringify(text)).toBe(solidLength(text));
  }
});
