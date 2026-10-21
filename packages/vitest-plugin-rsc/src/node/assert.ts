// `node:assert` for a browser: the assert package, Node's own assert for a
// browser, which compares as Node does. unenv's compares by JSON, and its
// errors have no message. What the package lacks is unenv's.

// By its file: by its name, `assert`, it would be this module of Node.js.
import assert from "assert/build/assert.js";

export * from "unenv/node/assert";
export default assert;
export const {
  AssertionError,
  deepEqual,
  deepStrictEqual,
  doesNotMatch,
  doesNotReject,
  doesNotThrow,
  equal,
  fail,
  ifError,
  match,
  notDeepEqual,
  notDeepStrictEqual,
  notEqual,
  notStrictEqual,
  ok,
  rejects,
  strict,
  strictEqual,
  throws,
} = assert;
