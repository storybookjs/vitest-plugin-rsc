// `node:util` for a browser: the util package, Node's own util for a browser,
// with `inspect()` and `format()` from node-inspect-extracted, Node's own
// inspect, newer and complete, which Next's server logs errors and objects
// with. What the browser has, it is: `toUSVString()` of `toWellFormed()`,
// `aborted()` of the signal's event. What the packages lack, like
// `MIMEType` and `parseArgs()`, which a server has no arguments for, is
// unenv's; unenv's own `inspect()` is `JSON.stringify`, and it has no
// `callbackify()` and no `isObject()`.

// `isDeepStrictEqual()` as Node's: the assert package's, which unenv's
// compares by JSON. By the file: the package exports no more than `assert`.
import { isDeepStrictEqual } from "assert/build/internal/util/comparisons.js";
import {
  format,
  formatWithOptions,
  inspect,
  stripVTControlCharacters,
} from "node-inspect-extracted";
// Its named exports, as its default is typed as nothing. `types` is
// `node:util/types`, the package's own ./util/types.ts, through unenv.
import * as unenv from "unenv/node/util";
import { types } from "unenv/node/util";
// By its file: by its name, `util`, it would be this module of Node.js.
import util from "util/util.js";

export * from "unenv/node/util";
export { format, formatWithOptions, inspect, isDeepStrictEqual, stripVTControlCharacters };

// A string with its lone surrogates as U+FFFD.
export const toUSVString = (string: unknown): string => String(string).toWellFormed();

// Text in the colors and styles of `inspect.colors`, which a terminal shows.
// By default, as for a stream that is no terminal, as no stream here is,
// the text as it is.
export function styleText(
  format: string | string[],
  text: string,
  { validateStream = true }: { validateStream?: boolean; stream?: unknown } = {},
): string {
  const colors = inspect.colors as unknown as Record<string, [number, number]>;
  const formats = Array.isArray(format) ? format : [format];
  for (const name of formats) {
    if (name !== "none" && !colors[name]) {
      throw Object.assign(
        new TypeError(`The argument 'format' must be one of: ${Object.keys(colors).join(", ")}`),
        { code: "ERR_INVALID_ARG_VALUE" },
      );
    }
  }
  if (validateStream) return text;
  let [left, right] = ["", ""];
  for (const name of formats) {
    if (name === "none") continue;
    const [on, off] = colors[name]!;
    left += `\u001b[${on}m`;
    right = `\u001b[${off}m${right}`;
  }
  return left + text + right;
}

// A promise of the signal's abort.
export const aborted = (signal: AbortSignal, _resource: object): Promise<void> =>
  signal.aborted
    ? Promise.resolve()
    : new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

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
  stripVTControlCharacters,
  toUSVString,
  styleText,
  aborted,
  promisify,
  types,
};
