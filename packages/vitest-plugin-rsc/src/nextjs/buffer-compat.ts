import { Buffer } from "node:buffer";

const patchedBufferIndexOfSymbol = Symbol.for("vitest-plugin-rsc.nextjs.patchedBufferIndexOf");

export function patchBufferIndexOfUint8ArrayNeedle(BufferCtor: typeof Buffer) {
  const prototype = BufferCtor.prototype as Buffer & {
    [patchedBufferIndexOfSymbol]?: true;
  };
  if (prototype[patchedBufferIndexOfSymbol]) return;

  type BufferIndexOfImplementation = (
    this: Buffer,
    value: string | number | Uint8Array,
    byteOffset?: number | BufferEncoding,
    encoding?: BufferEncoding,
  ) => number;

  const originalIndexOf = prototype.indexOf as BufferIndexOfImplementation;
  const patchedIndexOf: BufferIndexOfImplementation = function patchedIndexOf(
    value,
    byteOffset,
    encoding,
  ) {
    // Next's stream-utils/uint8array-helpers uses Buffer#indexOf(Uint8Array)
    // while app-render scans streamed HTML for head/body markers. Browser
    // Buffer polyfills are less permissive than Node here, so normalize the
    // needle before Next's helper takes that fast path.
    const normalizedValue =
      value instanceof Uint8Array && !BufferCtor.isBuffer(value)
        ? BufferCtor.from(value.buffer, value.byteOffset, value.byteLength)
        : value;
    return originalIndexOf.call(this, normalizedValue, byteOffset, encoding);
  };
  Object.defineProperty(prototype, "indexOf", {
    configurable: true,
    writable: true,
    value: patchedIndexOf,
  });
  prototype[patchedBufferIndexOfSymbol] = true;
}
