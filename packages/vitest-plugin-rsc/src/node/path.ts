// `node:path` for a browser: path-browserify, the POSIX path of Node.js for
// a browser, as a server on Linux has it. Not unenv's pathe, which takes a
// backslash for a separator, as Windows does. `posix` is the module itself,
// as in Node.js, and so is `win32` here: there is no other disk.

import path from "path-browserify";

const {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep,
} = path;
const toNamespacedPath = (file: string): string => file;
const posix = {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  relative,
  resolve,
  sep,
  toNamespacedPath,
} as typeof path & { toNamespacedPath: typeof toNamespacedPath };
// As in Node.js: `path.posix.posix` is `path.posix`, and `_makeLong()` is
// the old name of `toNamespacedPath()`, which unenv's path still has.
Object.assign(posix, { posix, win32: posix, _makeLong: toNamespacedPath });
const win32 = posix;
export {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  posix,
  relative,
  resolve,
  sep,
  toNamespacedPath,
  win32,
};
export default { ...posix, posix, win32 };
