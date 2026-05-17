// @ts-expect-error Next's compiled util browser package does not ship declarations.
import compiledUtil from "next/dist/compiled/util";

// Mirrors Next's Edge sandbox NativeModuleMap for `node:util`.
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/web/sandbox/context.ts#L237-L244
const util = compiledUtil as Record<string, unknown>;

export const _extend = util._extend;
export const callbackify = util.callbackify;
export const format = util.format;
export const inherits = util.inherits;
export const promisify = util.promisify;
export const types = util.types;

export default {
  _extend,
  callbackify,
  format,
  inherits,
  promisify,
  types,
};
