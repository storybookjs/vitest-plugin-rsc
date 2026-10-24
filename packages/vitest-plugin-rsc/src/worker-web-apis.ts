// Loaded with `--import` in a worker of Vitest without Browser Mode, before
// Vitest sets up its environment: the web APIs of Node.js, which a DOM like
// happy-dom replaces with its own, kept for the layers of the server, as
// node-host.ts gives them to the page. See `webApisKey` there.

const key = Symbol.for("vitest-plugin-rsc:worker-web-apis");
const scope = globalThis as unknown as Record<PropertyKey, unknown>;
scope[key] ??= {
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  FormData: globalThis.FormData,
  Blob: globalThis.Blob,
  File: globalThis.File,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
  fetch: globalThis.fetch,
};
