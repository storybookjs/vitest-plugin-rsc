// @ts-expect-error Next's compiled util browser package does not ship declarations.
import compiledUtil from "next/dist/compiled/util";

const util = compiledUtil as Record<string, unknown>;

export const _extend = util._extend;
export const callbackify = util.callbackify;
export const debuglog = util.debuglog;
export const deprecate = util.deprecate;
export const format = util.format;
export const inherits = util.inherits;
export const inspect = util.inspect;
export const isArray = util.isArray;
export const isBoolean = util.isBoolean;
export const isBuffer = util.isBuffer;
export const isDate = util.isDate;
export const isError = util.isError;
export const isFunction = util.isFunction;
export const isNull = util.isNull;
export const isNullOrUndefined = util.isNullOrUndefined;
export const isNumber = util.isNumber;
export const isObject = util.isObject;
export const isPrimitive = util.isPrimitive;
export const isRegExp = util.isRegExp;
export const isString = util.isString;
export const isSymbol = util.isSymbol;
export const isUndefined = util.isUndefined;
export const log = util.log;
export const promisify = util.promisify;
export const types = util.types;

export default util;
