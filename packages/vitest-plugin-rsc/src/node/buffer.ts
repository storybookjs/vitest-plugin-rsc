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

// From one encoding to another, as Node's ICU does. Between UTF-8 and
// UTF-16 a byte that is no character throws. The rest is decoded with
// U+FFFD for what is no character, as ASCII's bytes above 0x7f are, and
// encoded with "?" for a character the target has no byte for, or with
// nothing for one that Unicode says is to be ignored, like U+2064.
const encodings: Record<string, "ascii" | "latin1" | "utf16le" | "utf8"> = {
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
const transcodeError = (code: "U_ILLEGAL_ARGUMENT_ERROR" | "U_INVALID_CHAR_FOUND") =>
  Object.assign(new Error(`Unable to transcode Buffer [${code}]`), { code });
function decodeStrictly(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw transcodeError("U_INVALID_CHAR_FOUND");
  }
}
export function transcode(source: Uint8Array, fromEncoding: string, toEncoding: string): Buffer {
  const from = encodings[fromEncoding.toLowerCase()];
  const to = encodings[toEncoding.toLowerCase()];
  if (!from || !to) throw transcodeError("U_ILLEGAL_ARGUMENT_ERROR");
  const bytes = bytesOf(source);
  if (from === "utf16le" && to === "utf8") {
    const units = bytes.subarray(0, bytes.length - (bytes.length % 2));
    if (bytes.length && !units.length) throw transcodeError("U_INVALID_CHAR_FOUND");
    return Buffer.from(decodeStrictly(units, "utf-16le"), "utf8");
  }
  if (from === "utf8" && to === "utf16le") {
    return Buffer.from(decodeStrictly(bytes, "utf-8"), "utf16le");
  }
  // To ASCII or latin1 a byte order mark goes, and an odd last byte of
  // UTF-16; to UTF-16, ASCII is read as latin1.
  const narrow = to === "ascii" || to === "latin1";
  const text =
    from === "latin1" || (from === "ascii" && to === "utf16le")
      ? Buffer.from(bytes).toString("latin1")
      : from === "ascii"
        ? Array.from(bytes, (byte) => (byte > 0x7f ? "\ufffd" : String.fromCharCode(byte))).join("")
        : from === "utf8"
          ? new TextDecoder("utf-8", { ignoreBOM: !narrow }).decode(bytes)
          : new TextDecoder("utf-16le", { ignoreBOM: !narrow }).decode(
              narrow ? bytes.subarray(0, bytes.length - (bytes.length % 2)) : bytes,
            );
  const limit = to === "ascii" ? 0x7f : to === "latin1" ? 0xff : Infinity;
  const encodable =
    limit === Infinity
      ? text
      : text.replace(/[^]/gu, (char: string) =>
          char.codePointAt(0)! <= limit
            ? char
            : /\p{Default_Ignorable_Code_Point}/u.test(char)
              ? ""
              : "?",
        );
  return Buffer.from(encodable, to);
}

export const File = globalThis.File;

export default { ...unenv, isUtf8, isAscii, transcode, File };
