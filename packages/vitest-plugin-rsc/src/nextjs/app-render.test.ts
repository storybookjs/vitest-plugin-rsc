import { Buffer } from "node:buffer";
import { expect, test } from "vitest";
import {
  createViteRscClientModulesProxy,
  createViteRscModuleMappingProxy,
} from "./app-render-manifest";
import { patchBufferIndexOfUint8ArrayNeedle } from "./buffer-compat";

const patchedBufferIndexOfSymbol = Symbol.for("vitest-plugin-rsc.nextjs.patchedBufferIndexOf");

test("normalizes Uint8Array needles for Next app-render stream helpers", () => {
  const prototype = Buffer.prototype as Buffer & {
    [patchedBufferIndexOfSymbol]?: true;
  };
  const originalIndexOf = prototype.indexOf as (
    this: Buffer,
    value: string | number | Uint8Array,
    byteOffset?: number | BufferEncoding,
    encoding?: BufferEncoding,
  ) => number;
  let sawNormalizedNeedle = false;

  Object.defineProperty(prototype, "indexOf", {
    configurable: true,
    writable: true,
    value(
      value: string | number | Uint8Array,
      byteOffset?: number | BufferEncoding,
      encoding?: BufferEncoding,
    ) {
      if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        throw new TypeError("Buffer polyfill does not support Uint8Array needles");
      }
      if (Buffer.isBuffer(value)) {
        sawNormalizedNeedle = true;
      }
      return originalIndexOf.call(this, value, byteOffset, encoding);
    },
  });
  delete prototype[patchedBufferIndexOfSymbol];

  try {
    patchBufferIndexOfUint8ArrayNeedle(Buffer);

    const haystack = Buffer.from("<head></head>");
    const needle = new Uint8Array(Buffer.from("</head>"));

    expect(haystack.indexOf(needle)).toBe("<head>".length);
    expect(sawNormalizedNeedle).toBe(true);
  } finally {
    Object.defineProperty(prototype, "indexOf", {
      configurable: true,
      writable: true,
      value: originalIndexOf,
    });
    delete prototype[patchedBufferIndexOfSymbol];
  }
});

test("normalizes Vite RSC cache wrapper module ids in Next manifest proxies", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<string, unknown>;
  const moduleMapping = createViteRscModuleMappingProxy() as Record<
    string,
    Record<string, unknown>
  >;

  expect(clientModules["/src/client-card.tsx$$cache=abc123#ClientCard"]).toEqual({
    id: "/src/client-card.tsx",
    name: "ClientCard",
    chunks: [],
    async: true,
  });
  expect(moduleMapping["/src/client-card.tsx$$cache=abc123"]?.ClientCard).toEqual({
    id: "/src/client-card.tsx",
    name: "ClientCard",
    chunks: [],
    async: true,
  });
});

test("returns Next client-reference records from manifest proxies", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<PropertyKey, unknown>;
  const moduleMapping = createViteRscModuleMappingProxy() as Record<
    PropertyKey,
    Record<PropertyKey, unknown> | undefined
  >;

  expect(clientModules["/src/client-card.tsx#default"]).toEqual({
    id: "/src/client-card.tsx",
    name: "default",
    chunks: [],
    async: true,
  });
  expect(moduleMapping["/src/client-card.tsx"]?.default).toEqual({
    id: "/src/client-card.tsx",
    name: "default",
    chunks: [],
    async: true,
  });
  expect(clientModules["/src/client-card.tsx"]).toBeUndefined();
  expect(clientModules[Symbol.iterator]).toBeUndefined();
  expect(moduleMapping[Symbol.iterator]).toBeUndefined();
});

test("maps Next builtin global-error manifest records to the Vite virtual stub", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<string, unknown>;
  const moduleMapping = createViteRscModuleMappingProxy() as Record<
    string,
    Record<string, unknown>
  >;
  const expected = {
    id: "/@id/__x00__virtual:vitest-plugin-rsc/next-builtin-global-error-stub",
    name: "default",
    chunks: [],
    async: true,
  };

  expect(
    clientModules[
      "/node_modules/.vite/deps/next_dist_client_components_builtin_global-error.js#default"
    ],
  ).toEqual(expected);
  expect(
    moduleMapping["/node_modules/next/dist/client/components/builtin/global-error.js"]?.default,
  ).toEqual(expected);
});
