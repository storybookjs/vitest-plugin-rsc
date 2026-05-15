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
