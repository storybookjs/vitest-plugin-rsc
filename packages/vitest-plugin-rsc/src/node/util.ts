// `node:util` for a browser: the util package, Node's own util for a browser,
// with `inspect()` and `format()` from node-inspect-extracted, Node's own
// inspect, newer and complete, which Next's server logs errors and objects
// with. What the package lacks, like `MIMEType` and `parseArgs()`, is
// unenv's; unenv's own `inspect()` is `JSON.stringify`, and it has no
// `callbackify()` and no `isObject()`.

import { format, formatWithOptions, inspect } from "node-inspect-extracted";
// Its named exports, as its default is typed as nothing. `types` is what
// `node:util/types` is too: unenv's, one of them.
import * as unenv from "unenv/node/util";
import { types } from "unenv/node/util";
// By its file: by its name, `util`, it would be this module of Node.js.
import util from "util/util.js";

export * from "unenv/node/util";
export { format, formatWithOptions, inspect };
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
  promisify,
} = util;
export default { ...unenv.default, ...util, format, formatWithOptions, inspect, types };
