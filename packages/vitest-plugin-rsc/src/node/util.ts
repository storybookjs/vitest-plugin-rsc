// `node:util` for a browser: the util package, Node's own util for a browser,
// with `inspect()` and `format()` from node-inspect-extracted, Node's own
// inspect, newer and complete, which Next's server logs errors and objects
// with. What the package lacks, like `MIMEType` and `parseArgs()`, is
// unenv's; unenv's own `inspect()` is `JSON.stringify`, and it has no
// `callbackify()` and no `isObject()`.

// `isDeepStrictEqual()` as Node's: the assert package's, which unenv's
// compares by JSON. By the file: the package exports no more than `assert`.
import { isDeepStrictEqual } from "assert/build/internal/util/comparisons.js";
import { format, formatWithOptions, inspect } from "node-inspect-extracted";
// Its named exports, as its default is typed as nothing. `types` is
// `node:util/types`, the package's own ./util/types.ts, through unenv.
import * as unenv from "unenv/node/util";
import { types } from "unenv/node/util";
// By its file: by its name, `util`, it would be this module of Node.js.
import util from "util/util.js";

export * from "unenv/node/util";
export { format, formatWithOptions, inspect, isDeepStrictEqual };
// Node's own symbol for a function's promise form, `promisify.custom`: the
// package has one of its own.
const custom = Symbol.for("nodejs.util.promisify.custom");
type Promisified = Function & { [custom]?: Function };
// What `promisify()` returns is its own promise form, as in Node.js.
const selfPromisifying = (fn: Function): Function =>
  Object.defineProperty(fn, custom, { value: fn, configurable: true });
export const promisify = Object.assign(
  (fn: Promisified): Function => {
    if (typeof fn !== "function") {
      throw new TypeError('The "original" argument must be of type function');
    }
    const own = fn[custom];
    if (own !== undefined) {
      if (typeof own !== "function") {
        throw new TypeError('The "util.promisify.custom" argument must be of type function');
      }
      return selfPromisifying(own);
    }
    return selfPromisifying(util.promisify(fn));
  },
  { custom },
);
export const {
  _extend,
  callbackify,
  debuglog,
  deprecate,
  inherits,
  isArray,
  isBoolean,
  isBuffer,
  isDate,
  isError,
  isFunction,
  isNull,
  isNullOrUndefined,
  isNumber,
  isObject,
  isPrimitive,
  isRegExp,
  isString,
  isSymbol,
  isUndefined,
  log,
} = util;
export default {
  ...unenv.default,
  ...util,
  format,
  formatWithOptions,
  inspect,
  isDeepStrictEqual,
  promisify,
  types,
};
