// `node:zlib` for a browser: gzip, deflate and raw deflate at once, the
// synchronous functions and the ones that call back, which is what Next's
// server compresses with. The deflate of fflate, in JavaScript, at the
// level zlib is given, with a dictionary. The framing of gzip and zlib is
// read here, as zlib reads it, with the checksums of what it decompresses,
// gzip's CRC-32 and zlib's Adler-32, which fflate checks neither of. A gzip
// of one member, as `gzipSync()` writes one: one of more throws, and one
// with bytes after it fails its check, where Node's reads both, as does a
// zlib with bytes after it. An option that would change the answer and is
// not here throws: `info`, a flush of its own and a window of its own. Gzip has no
// time in its header, as Node's has none, so that the same data compresses
// to the same bytes. The rest is unenv's: its constants, and streams and
// functions that throw when called, like `createGzip()` and Brotli's. See
// "Node.js In The Browser" in the README for what is here and what is not.

import {
  deflateSync as fflateDeflateSync,
  Gunzip as FflateGunzip,
  gzipSync as fflateGzipSync,
  inflateSync as fflateInflateSync,
  zlibSync,
} from "fflate/browser";
import unenv, {
  Z_BUF_ERROR,
  Z_DATA_ERROR,
  Z_FINISH,
  Z_NEED_DICT,
  Z_NO_FLUSH,
} from "unenv/node/zlib";
import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";

export * from "unenv/node/zlib";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;

type Data = string | ArrayBuffer | ArrayBufferView;
type Options = {
  level?: number;
  memLevel?: number;
  windowBits?: number;
  chunkSize?: number;
  flush?: number;
  finishFlush?: number;
  info?: boolean;
  dictionary?: Data;
  maxOutputLength?: number;
};
type Callback = (error: Error | null, result?: Buffer) => void;
type Format = "gzip" | "deflate" | "deflate-raw" | "unzip";

// Node's error of anything else, of an argument by its name.
function bytesOf(data: Data, name = "buffer"): Uint8Array {
  if (typeof data === "string") return Buffer.from(data);
  if (data instanceof ArrayBuffer && name !== "data") return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const types =
    name === "data"
      ? "Buffer, TypedArray, or DataView"
      : "Buffer, TypedArray, DataView, or ArrayBuffer";
  throw Object.assign(
    new TypeError(`The "${name}" argument must be of type string or an instance of ${types}`),
    { code: "ERR_INVALID_ARG_TYPE" },
  );
}

// Node's errors of zlib.
const zlibError = (message: string, errno: number, code: string): Error =>
  Object.assign(new Error(message), { errno, code });
const endedTooSoon = () => zlibError("unexpected end of file", Z_BUF_ERROR, "Z_BUF_ERROR");
const badData = (message: string) => zlibError(message, Z_DATA_ERROR, "Z_DATA_ERROR");
const tooLarge = (limit: number) =>
  Object.assign(new RangeError(`Cannot create a Buffer larger than ${limit} bytes`), {
    code: "ERR_BUFFER_TOO_LARGE",
  });

// Node's checks of the options, and an error for one that is not here.
const notHere = (name: string) =>
  new Error(`vitest-plugin-rsc: zlib's ${name} is not there in the browser`);
function optionsOf(options: Options | null | undefined, inflate: boolean): Options {
  const own = options ?? {};
  const ranges: [keyof Options, number, number][] = [
    ["level", -1, 9],
    ["memLevel", 1, 9],
    ["windowBits", 8, 15],
    ["chunkSize", 64, Infinity],
    ["maxOutputLength", 1, 2 ** 53 - 1],
  ];
  for (const [name, min, max] of ranges) {
    const value = own[name] as number | undefined;
    // A window of 0 is the one of the header, to inflate.
    if (value === undefined || (name === "windowBits" && inflate && value === 0)) continue;
    if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
      throw Object.assign(
        new RangeError(
          `The value of "options.${name}" is out of range. It must be >= ${min}${
            max === Infinity ? "" : ` and <= ${max}`
          }. Received ${value}`,
        ),
        { code: "ERR_OUT_OF_RANGE" },
      );
    }
  }
  if (own.info) throw notHere("`info` option");
  if (own.flush !== undefined && own.flush !== Z_NO_FLUSH) throw notHere("`flush` option");
  if (own.finishFlush !== undefined && own.finishFlush !== Z_FINISH) {
    throw notHere("`finishFlush` option");
  }
  if (own.windowBits !== undefined && own.windowBits !== 15 && own.windowBits !== 0) {
    throw notHere("window of less than 32 KiB");
  }
  return own;
}

// fflate's error by its code: 0 is data that ends too soon.
function fflateCall<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    const { code, message } = error as { code?: number; message: string };
    throw code === 0 ? endedTooSoon() : badData(message);
  }
}

// The CRC-32 of zip and gzip, continued from `value`, as Node's of 22.2.
const crcTable = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
export function crc32(data: string | ArrayBufferView, value = 0): number {
  const bytes = bytesOf(data, "data");
  let crc = ~value;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return ~crc >>> 0;
}
// The Adler-32 of zlib.
function adler32(bytes: Uint8Array): number {
  let [a, b] = [1, 0];
  for (let i = 0; i < bytes.length; i += 5552) {
    for (const byte of bytes.subarray(i, i + 5552)) b += a += byte;
    [a, b] = [a % 65521, b % 65521];
  }
  return ((b << 16) | a) >>> 0;
}

// The length of a gzip header, RFC 1952: its name, comment and the rest,
// and the CRC of it all, as zlib checks it.
function gzipHeaderLength(bytes: Uint8Array): number {
  if (bytes.length < 10) throw endedTooSoon();
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw badData("incorrect header check");
  if (bytes[2] !== 8) throw badData("unknown compression method");
  const flags = bytes[3]!;
  if (flags & 0xe0) throw badData("unknown header flags set");
  let at = 10;
  if (flags & 4) at += 2 + (bytes[10]! | (bytes[11]! << 8));
  for (const flag of [8, 16]) {
    if (flags & flag) {
      at = bytes.indexOf(0, at) + 1;
      if (at === 0) throw endedTooSoon();
    }
  }
  if (flags & 2) {
    if (bytes.length < at + 2) throw endedTooSoon();
    const crc = (bytes[at]! | (bytes[at + 1]! << 8)) >>> 0;
    if (crc !== (crc32(bytes.subarray(0, at)) & 0xffff)) throw badData("header crc mismatch");
    at += 2;
  }
  return at;
}

// The deflate data of a gzip or zlib, by fflate's inflate, with the
// header, the dictionary it may ask for and the checksum after it read
// here. `unzip` is gzip or zlib, by the first two bytes. What follows the
// data of raw deflate is ignored, as by Node's; what follows a zlib fails
// its check.
function decompress(format: Format, data: Data, given?: Options | null): Buffer {
  const options = optionsOf(given, true);
  const bytes = bytesOf(data);
  const kind =
    format === "unzip" ? (bytes[0] === 0x1f && bytes[1] === 0x8b ? "gzip" : "deflate") : format;
  let start = 0;
  let dictionary: Uint8Array | undefined;
  if (kind === "gzip") start = gzipHeaderLength(bytes);
  if (kind === "deflate") {
    if (bytes.length < 2) throw endedTooSoon();
    const [method, flags] = [bytes[0]!, bytes[1]!];
    if ((method * 256 + flags) % 31 !== 0) throw badData("incorrect header check");
    if ((method & 0x0f) !== 8) throw badData("unknown compression method");
    if (method >> 4 > 7) throw badData("invalid window size");
    start = 2;
    if (flags & 0x20) {
      if (bytes.length < 6) throw endedTooSoon();
      if (options.dictionary === undefined) {
        throw zlibError("Missing dictionary", Z_NEED_DICT, "Z_NEED_DICT");
      }
      dictionary = bytesOf(options.dictionary, "dictionary");
      const id = new DataView(bytes.buffer, bytes.byteOffset).getUint32(2);
      if (adler32(dictionary) !== id) throw zlibError("Bad dictionary", Z_NEED_DICT, "Z_NEED_DICT");
      start = 6;
    }
  }
  if (kind === "deflate-raw" && options.dictionary !== undefined) {
    dictionary = bytesOf(options.dictionary, "dictionary");
  }
  const trailer = kind === "gzip" ? 8 : kind === "deflate" ? 4 : 0;
  // Deflate data has a byte at least, the end of its block.
  if (bytes.length <= start + trailer) throw endedTooSoon();
  const view = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - trailer);
  // fflate's inflate of the deflate data, which tells data cut short.
  const inflate = () =>
    fflateCall(() =>
      fflateInflateSync(bytes.subarray(start, bytes.length - trailer), { dictionary }),
    );
  let result: Uint8Array;
  if (kind === "gzip") {
    // fflate's Gunzip, of all but the trailer: it tells a member after the
    // first, which the inflate of the deflate data leaves out. A stream does
    // not tell data cut short: its checksum fails, and the inflate tells.
    const chunks: Uint8Array[] = [];
    let members = 1;
    const gunzip = new FflateGunzip((chunk) => chunks.push(chunk));
    gunzip.onmember = () => members++;
    fflateCall(() => gunzip.push(bytes.subarray(0, bytes.length - trailer), true));
    if (members > 1) {
      throw new Error(
        "vitest-plugin-rsc: zlib's gzip of more than one member is not there in the browser",
      );
    }
    result = Buffer.concat(chunks);
    const failed =
      view.getUint32(0, true) !== crc32(result)
        ? "incorrect data check"
        : view.getUint32(4, true) !== result.length >>> 0
          ? "incorrect length check"
          : undefined;
    if (failed) {
      inflate();
      throw badData(failed);
    }
  } else {
    result = inflate();
    if (kind === "deflate" && view.getUint32(0) !== adler32(result)) {
      throw badData("incorrect data check");
    }
  }
  if (result.length > (options.maxOutputLength ?? Infinity)) {
    throw tooLarge(options.maxOutputLength!);
  }
  return Buffer.from(result.buffer, result.byteOffset, result.length);
}

// fflate's, at zlib's level, 0 to 9; zlib's default level, -1, is
// fflate's. `memLevel` only tunes zlib's compression, and fflate has its
// own. Gzip has no dictionary, as Node's ignores one for it.
function compress(format: Format, data: Data, given?: Options | null): Buffer {
  const options = optionsOf(given, false);
  const bytes = bytesOf(data);
  const fflate = {
    ...(options.level !== undefined && options.level >= 0 && { level: options.level as 0 }),
    ...(options.dictionary !== undefined &&
      format !== "gzip" && { dictionary: bytesOf(options.dictionary, "dictionary") }),
  };
  const result =
    format === "gzip"
      ? fflateGzipSync(bytes, { ...fflate, mtime: 0 })
      : format === "deflate"
        ? zlibSync(bytes, fflate)
        : fflateDeflateSync(bytes, fflate);
  if (result.length > (options.maxOutputLength ?? Infinity)) {
    throw tooLarge(options.maxOutputLength!);
  }
  return Buffer.from(result.buffer, result.byteOffset, result.length);
}

export const gzipSync = (data: Data, options?: Options | null) => compress("gzip", data, options);
export const gunzipSync = (data: Data, options?: Options | null) =>
  decompress("gzip", data, options);
export const deflateSync = (data: Data, options?: Options | null) =>
  compress("deflate", data, options);
export const inflateSync = (data: Data, options?: Options | null) =>
  decompress("deflate", data, options);
export const deflateRawSync = (data: Data, options?: Options | null) =>
  compress("deflate-raw", data, options);
export const inflateRawSync = (data: Data, options?: Options | null) =>
  decompress("deflate-raw", data, options);
export const unzipSync = (data: Data, options?: Options | null) =>
  decompress("unzip", data, options);

// `gzip(buffer, [options], callback)` and the others: the synchronous one,
// after the code that called it, as zlib's threads are, on a copy of the
// data, which the caller may change in the meantime.
const asyncOf = (run: (data: Data, options?: Options | null) => Buffer) =>
  function (data: Data, options: Options | null | Callback, callback?: Callback): void {
    const done = typeof options === "function" ? options : callback;
    if (typeof done !== "function") {
      throw Object.assign(new TypeError('The "callback" argument must be of type function'), {
        code: "ERR_INVALID_ARG_TYPE",
      });
    }
    const bytes = Uint8Array.from(bytesOf(data));
    const own = typeof options === "function" ? undefined : options;
    setTimeout(() => {
      let result: Buffer;
      try {
        result = run(bytes, own);
      } catch (error) {
        done(error as Error);
        return;
      }
      done(null, result);
    });
  };
export const gzip = asyncOf(gzipSync);
export const gunzip = asyncOf(gunzipSync);
export const deflate = asyncOf(deflateSync);
export const inflate = asyncOf(inflateSync);
export const deflateRaw = asyncOf(deflateRawSync);
export const inflateRaw = asyncOf(inflateRawSync);
export const unzip = asyncOf(unzipSync);

// Zstandard, of Node.js 22.15, which unenv has no stand-in for.
const missing = (name: string) =>
  function (..._args: unknown[]): never {
    throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
  };
export const ZstdCompress = missing("zlib.ZstdCompress");
export const ZstdDecompress = missing("zlib.ZstdDecompress");
export const zstdCompress = missing("zlib.zstdCompress");
export const zstdCompressSync = missing("zlib.zstdCompressSync");
export const zstdDecompress = missing("zlib.zstdDecompress");
export const zstdDecompressSync = missing("zlib.zstdDecompressSync");
export const createZstdCompress = missing("zlib.createZstdCompress");
export const createZstdDecompress = missing("zlib.createZstdDecompress");

export default {
  ...unenv,
  crc32,
  gzipSync,
  gunzipSync,
  deflateSync,
  inflateSync,
  deflateRawSync,
  inflateRawSync,
  unzipSync,
  gzip,
  gunzip,
  deflate,
  inflate,
  deflateRaw,
  inflateRaw,
  unzip,
  ZstdCompress,
  ZstdDecompress,
  zstdCompress,
  zstdCompressSync,
  zstdDecompress,
  zstdDecompressSync,
  createZstdCompress,
  createZstdDecompress,
};
