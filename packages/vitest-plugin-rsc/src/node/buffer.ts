// `node:buffer` for a browser: unenv's, the Buffer of the buffer package,
// with what it throws for: `isUtf8()` by the browser's TextDecoder,
// `isAscii()`, and the browser's own `File`. `transcode()` and
// `resolveObjectURL()` stay unenv's, which throw: a browser reads a blob
// URL asynchronously only.

import unenv from "unenv/node/buffer";

export * from "unenv/node/buffer";

type Input = ArrayBuffer | ArrayBufferView;
function bytesOf(input: Input): Uint8Array {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw Object.assign(
    new TypeError('The "input" argument must be an instance of ArrayBuffer, Buffer, or TypedArray'),
    { code: "ERR_INVALID_ARG_TYPE" },
  );
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export function isUtf8(input: Input): boolean {
  const bytes = bytesOf(input);
  try {
    utf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function isAscii(input: Input): boolean {
  const bytes = bytesOf(input);
  for (let i = 0; i < bytes.length; i++) if (bytes[i]! > 0x7f) return false;
  return true;
}

export const File = globalThis.File;

export default { ...unenv, isUtf8, isAscii, File };
