// `node:async_hooks` of the server layers of a page in a worker of Node.js:
// Node's own, which carries the stores of `AsyncLocalStorage` across an
// `await`, a timer and a callback itself. The package's `./async-hooks`
// resolves to this file under the `node` condition, which only those layers
// resolve with (../index.ts and nextjs/plugin.ts); a layer in a browser, and
// the browser layer, get async-hooks.ts. By `getBuiltinModule()`, not an
// import: every layer aliases `node:async_hooks` to the package's.

const asyncHooks = process.getBuiltinModule("node:async_hooks");

export const {
  AsyncLocalStorage,
  AsyncResource,
  asyncWrapProviders,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
} = asyncHooks;
export default asyncHooks;
