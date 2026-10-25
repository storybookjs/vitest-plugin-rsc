// Loaded with `--import` in a worker of Vitest without Browser Mode, before
// Vitest sets up its environment: the web APIs of Node.js, which a DOM like
// happy-dom replaces with its own, kept for the layers of the server, as
// node-host.ts gives them to the page. See `webApisKey` there. And the typed
// arrays of the worker's realm, which Vitest's environment of jsdom replaces
// with those of jsdom's, for node-dom.ts to put back.

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

const typedArraysKey = Symbol.for("vitest-plugin-rsc:worker-typed-arrays");
scope[typedArraysKey] ??= {
  ArrayBuffer: globalThis.ArrayBuffer,
  Uint8Array: globalThis.Uint8Array,
  Uint8ClampedArray: globalThis.Uint8ClampedArray,
  Uint16Array: globalThis.Uint16Array,
  Uint32Array: globalThis.Uint32Array,
  Int8Array: globalThis.Int8Array,
  Int16Array: globalThis.Int16Array,
  Int32Array: globalThis.Int32Array,
  Float32Array: globalThis.Float32Array,
  Float64Array: globalThis.Float64Array,
};
