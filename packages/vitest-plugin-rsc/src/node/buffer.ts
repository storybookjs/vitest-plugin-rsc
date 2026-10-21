// `node:buffer` for a browser: unenv's, the Buffer of the buffer package,
// with what it throws for: `isUtf8()` by the browser's TextDecoder,
// `isAscii()`, `transcode()` between the encodings of Node.js, and the
// browser's own `File`. `resolveObjectURL()` stays unenv's, which throws:
// a browser reads a blob URL asynchronously only.

import unenv, { Buffer as UnenvBuffer } from "unenv/node/buffer";

export * from "unenv/node/buffer";

// Typed as Node's: unenv's types have it as nothing.
const Buffer = UnenvBuffer as unknown as typeof globalThis.Buffer;

type Input = ArrayBuffer | ArrayBufferView;
const bytesOf = (input: Input): Uint8Array =>
  input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export function isUtf8(input: Input): boolean {
  try {
    utf8.decode(bytesOf(input));
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

// From one encoding to another, as Node's ICU does: a character the target
// has no byte for is a "?".
const encodings: Record<string, BufferEncoding> = {
  ascii: "ascii",
  latin1: "latin1",
  binary: "latin1",
  ucs2: "utf16le",
  "ucs-2": "utf16le",
  utf16le: "utf16le",
  "utf-16le": "utf16le",
  utf8: "utf8",
  "utf-8": "utf8",
};
export function transcode(source: Uint8Array, from: string, to: string): Buffer {
  const [source_, target] = [encodings[from.toLowerCase()], encodings[to.toLowerCase()]];
  if (!source_ || !target) {
    throw Object.assign(new Error(`Unable to transcode Buffer [U_ILLEGAL_ARGUMENT_ERROR]`), {
      code: "U_ILLEGAL_ARGUMENT_ERROR",
    });
  }
  const text = Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString(source_);
  const limit = target === "ascii" ? 0x7f : target === "latin1" ? 0xff : Infinity;
  return Buffer.from(
    limit === Infinity
      ? text
      : text.replace(/[^]/gu, (char: string) => (char.codePointAt(0)! > limit ? "?" : char)),
    target,
  );
}

export const File = globalThis.File;

export default { ...unenv, isUtf8, isAscii, transcode, File };
