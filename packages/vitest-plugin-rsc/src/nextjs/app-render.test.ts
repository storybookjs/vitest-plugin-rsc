import { Buffer } from "node:buffer";
import { expect, test } from "vitest";
import { patchBufferIndexOfUint8ArrayNeedle } from "./buffer-compat";

const patchedBufferIndexOfSymbol = Symbol.for("vitest-plugin-rsc.nextjs.patchedBufferIndexOf");

test("normalizes Uint8Array needles for Next app-render stream helpers", () => {
  const prototype = Buffer.prototype as Buffer & {
    [patchedBufferIndexOfSymbol]?: true;
  };
  const originalIndexOf = prototype.indexOf;
  let sawNormalizedNeedle = false;

  Object.defineProperty(prototype, "indexOf", {
    configurable: true,
    writable: true,
    value(value: string | number | Uint8Array, byteOffset?: number | BufferEncoding) {
      if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
        throw new TypeError("Buffer polyfill does not support Uint8Array needles");
      }
      if (Buffer.isBuffer(value)) {
        sawNormalizedNeedle = true;
      }
      return originalIndexOf.call(this, value, byteOffset);
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
