// `node:zlib` for a browser. Gzip and deflate are fflate's, in JavaScript:
// one engine for the streams, the callbacks and the synchronous functions,
// as zlib is in Node.js. It compresses at a level, flushes a stream, reads
// gzip of more than one member and takes a dictionary, which the browser's
// compression streams do not. The framing of gzip and zlib is read here,
// as zlib reads it, with the checksums of what it decompresses, gzip's
// CRC-32 and zlib's Adler-32: fflate checks neither. Brotli and Zstandard, which fflate has no code for, are the
// browser's compression streams, where the browser has the format: where
// not, and synchronously in any browser, they throw. The constants are
// unenv's.

import {
  Deflate as RawDeflate,
  deflateSync as rawDeflateSync,
  Gzip as FflateGzip,
  gzipSync as fflateGzipSync,
  Inflate as RawInflateClass,
  Zlib as FflateZlib,
  zlibSync,
} from "fflate/browser";
import { codes } from "unenv/node/internal/zlib/codes";
import * as zlibConstants from "unenv/node/internal/zlib/constants";
import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";
import { Transform as OwnTransform } from "vitest-plugin-rsc/node/stream";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;
const Transform = OwnTransform as unknown as typeof import("node:stream").Transform;

// Node's zlib has its constants on it too, by their old names, like
// `zlib.Z_SYNC_FLUSH`.
export * from "unenv/node/internal/zlib/constants";
export const constants = { ...zlibConstants };
export { codes };

type Data = string | ArrayBuffer | ArrayBufferView;
type Options = {
  level?: number;
  memLevel?: number;
  dictionary?: Data;
  maxOutputLength?: number;
} & Record<string, unknown>;
type Callback = (error: Error | null, result?: Buffer) => void;
type Format = "gzip" | "deflate" | "deflate-raw" | "unzip";
type WebFormat = "brotli" | "zstd";
type Direction = "compress" | "decompress";

const bytesOf = (data: Data): Uint8Array =>
  typeof data === "string"
    ? Buffer.from(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const bufferOf = (bytes: Uint8Array): Buffer =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Node's errors of zlib: data that ends too soon, and data that is not
// what its format says.
const zlibError = (
  message: string,
  code: "Z_BUF_ERROR" | "Z_DATA_ERROR" | "Z_NEED_DICT" | "Z_STREAM_ERROR",
): Error => Object.assign(new Error(message), { errno: zlibConstants[code], code });
const endedTooSoon = () => zlibError("unexpected end of file", "Z_BUF_ERROR");
// fflate's error by its code: 0 is data that ends too soon, 6 a header
// that is not gzip's or zlib's.
function errorOf(error: unknown): Error {
  const { code, message } = error as { code?: unknown; message?: string };
  if (typeof code === "string") return error as Error;
  if (code === 0) return endedTooSoon();
  return zlibError(String(message), "Z_DATA_ERROR");
}

// fflate's level is zlib's, 0 to 9, and its `mem` zlib's `memLevel`, 1 to 9;
// zlib's default level, -1, is fflate's.
type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const fflateOptions = (options: Options = {}) => ({
  ...(options.level !== undefined && options.level >= 0 && { level: options.level as Level }),
  ...(options.memLevel !== undefined && { mem: options.memLevel as Level }),
  ...(options.dictionary !== undefined && { dictionary: bytesOf(options.dictionary) }),
});

// The CRC-32 of zip and gzip, continued from `value`.
const crcTable = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
export function crc32(data: string | ArrayBufferView, value = 0): number {
  const bytes = bytesOf(data);
  let crc = ~value;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return ~crc >>> 0;
}
// The Adler-32 of zlib, continued from `value`.
function adler32(bytes: Uint8Array, value = 1): number {
  let [a, b] = [value & 0xffff, value >>> 16];
  for (let i = 0; i < bytes.length; i += 5552) {
    for (const byte of bytes.subarray(i, i + 5552)) b += a += byte;
    [a, b] = [a % 65521, b % 65521];
  }
  return ((b << 16) | a) >>> 0;
}

type Engine = { push(chunk: Uint8Array, final?: boolean): void; flush?(sync?: boolean): void };
// fflate's inflate, with what it keeps between pushes: `s.f` is set and
// `s.l` unset once the last block is read, and `p` holds what came after
// the bit it is at, `s.p`. fflate's own Gunzip reads them so, for a member
// after the first. Pinned to fflate's version, which the build bundles.
type RawInflate = {
  push(chunk: Uint8Array, final?: boolean): void;
  s: { f?: number; l?: unknown; p: number };
  p: Uint8Array;
};
const inflateDone = (inflate: RawInflate): boolean => !!inflate.s.f && !inflate.s.l;
const inflateLeftover = (inflate: RawInflate): Uint8Array =>
  inflate.p.subarray(((inflate.s.p + 7) / 8) | 0);

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  if (!a.length) return b;
  if (!b.length) return a;
  const both = new Uint8Array(a.length + b.length);
  both.set(a);
  both.set(b, a.length);
  return both;
};

// The length of a gzip header, RFC 1952, or -1 while it is not all there.
// Its first bytes are checked as they come, as zlib checks them.
function gzipHeaderLength(bytes: Uint8Array): number {
  if (bytes.length >= 1 && bytes[0] !== 0x1f)
    throw zlibError("incorrect header check", "Z_DATA_ERROR");
  if (bytes.length >= 2 && bytes[1] !== 0x8b)
    throw zlibError("incorrect header check", "Z_DATA_ERROR");
  if (bytes.length >= 3 && bytes[2] !== 8)
    throw zlibError("unknown compression method", "Z_DATA_ERROR");
  if (bytes.length < 10) return -1;
  const flags = bytes[3]!;
  let at = 10;
  if (flags & 4) {
    if (bytes.length < at + 2) return -1;
    at += 2 + (bytes[at]! | (bytes[at + 1]! << 8));
    if (bytes.length < at) return -1;
  }
  for (const flag of [8, 16]) {
    if (flags & flag) {
      const end = bytes.indexOf(0, at);
      if (end < 0) return -1;
      at = end + 1;
    }
  }
  if (flags & 2) at += 2;
  return bytes.length < at ? -1 : at;
}

// What a stream or a function decompresses through: fflate's inflate of
// the deflate data, with the framing of gzip and zlib read here, as zlib
// reads it. Gzip's members, each with its CRC-32 and size after it, and
// what follows the last: more members, zeros, which are padding, or else
// an error. Zlib's header, with the dictionary it may ask for, and its
// Adler-32 after; what follows is ignored, as is what follows raw deflate.
// `unzip` is gzip or zlib, by the first two bytes.
class Decoder {
  #format: Format;
  #options: Options;
  #emit: (bytes: Uint8Array) => void;
  #phase: "header" | "body" | "trailer" | "after" | "done" = "header";
  #kind: "gzip" | "zlib" | "raw";
  #pending: Uint8Array = new Uint8Array(0);
  #inflate: RawInflate | undefined;
  #check = 0;
  #size = 0;
  constructor(format: Format, options: Options, emit: (bytes: Uint8Array) => void) {
    this.#format = format;
    this.#options = options;
    this.#emit = emit;
    this.#kind = format === "gzip" ? "gzip" : format === "deflate" ? "zlib" : "raw";
  }
  #inflateOf(dictionary?: Uint8Array): RawInflate {
    this.#check = this.#kind === "zlib" ? 1 : 0;
    this.#size = 0;
    return new RawInflateClass({ dictionary }, (bytes) => {
      this.#check = this.#kind === "zlib" ? adler32(bytes, this.#check) : crc32(bytes, this.#check);
      this.#size = (this.#size + bytes.length) >>> 0;
      if (bytes.length) this.#emit(bytes);
    }) as unknown as RawInflate;
  }
  // The header: true once it is read, false while it is not all there.
  #header(): boolean {
    const bytes = this.#pending;
    const dictionary =
      this.#options.dictionary === undefined ? undefined : bytesOf(this.#options.dictionary);
    if (this.#format === "unzip") {
      if (bytes.length < 2) return false;
      this.#kind = bytes[0] === 0x1f && bytes[1] === 0x8b ? "gzip" : "zlib";
    }
    let length = 0;
    if (this.#kind === "gzip") {
      length = gzipHeaderLength(bytes);
      if (length < 0) return false;
    } else if (this.#kind === "zlib") {
      if (bytes.length < 2) return false;
      const [cmf, flags] = [bytes[0]!, bytes[1]!];
      if ((cmf * 256 + flags) % 31 !== 0) throw zlibError("incorrect header check", "Z_DATA_ERROR");
      if ((cmf & 0x0f) !== 8) throw zlibError("unknown compression method", "Z_DATA_ERROR");
      length = 2;
      if (flags & 0x20) {
        if (bytes.length < 6) return false;
        const id = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(2);
        if (!dictionary) throw zlibError("Missing dictionary", "Z_NEED_DICT");
        if (adler32(dictionary) !== id) throw zlibError("Bad dictionary", "Z_NEED_DICT");
        length = 6;
      }
    }
    this.#pending = bytes.subarray(length);
    this.#inflate = this.#inflateOf(dictionary);
    this.#phase = "body";
    return true;
  }
  #verify(trailer: Uint8Array): void {
    const view = new DataView(trailer.buffer, trailer.byteOffset, trailer.byteLength);
    const good =
      this.#kind === "gzip"
        ? view.getUint32(0, true) === this.#check && view.getUint32(4, true) === this.#size
        : view.getUint32(0, false) === this.#check;
    if (!good) throw zlibError("incorrect data check", "Z_DATA_ERROR");
  }
  write(chunk: Uint8Array, final: boolean): void {
    this.#pending = concat(this.#pending, chunk);
    for (;;) {
      switch (this.#phase) {
        case "header": {
          if (this.#header()) continue;
          if (final) throw endedTooSoon();
          return;
        }
        case "body": {
          const inflate = this.#inflate!;
          const bytes = this.#pending;
          this.#pending = new Uint8Array(0);
          try {
            inflate.push(bytes, false);
            if (!inflateDone(inflate)) {
              if (!final) return;
              inflate.push(new Uint8Array(0), true);
              if (!inflateDone(inflate)) throw endedTooSoon();
            }
          } catch (error) {
            throw errorOf(error);
          }
          this.#pending = inflateLeftover(inflate);
          this.#phase = "trailer";
          continue;
        }
        case "trailer": {
          const length = this.#kind === "gzip" ? 8 : this.#kind === "zlib" ? 4 : 0;
          if (this.#pending.length < length) {
            if (final) throw endedTooSoon();
            return;
          }
          if (length) this.#verify(this.#pending.subarray(0, length));
          this.#pending = this.#pending.subarray(length);
          this.#phase = this.#kind === "gzip" ? "after" : "done";
          continue;
        }
        case "after": {
          if (!this.#pending.length) return;
          if (this.#pending[0] === 0) {
            this.#phase = "done";
            return;
          }
          this.#phase = "header";
          continue;
        }
        case "done":
          return;
      }
    }
  }
}

// What a stream or a function compresses through: fflate's.
function encoderOf(format: Format, options: Options, emit: (bytes: Uint8Array) => void): Engine {
  const ondata = (bytes: Uint8Array) => bytes.length && emit(bytes);
  const fflate = fflateOptions(options);
  if (format === "gzip") return new FflateGzip(fflate, ondata);
  if (format === "deflate-raw") return new RawDeflate(fflate, ondata);
  return new FflateZlib(fflate, ondata);
}

// What `flush()` writes through the stream's queue, after what was written
// before it, as Node's zlib does: a chunk of no bytes, told from another
// by its buffer, which a stream keeps when it makes a Buffer of a chunk.
const flushKinds = new WeakMap<ArrayBuffer, number>();
const flushMarker = (kind: number): Uint8Array => {
  const marker = new Uint8Array(new ArrayBuffer(1), 0, 0);
  flushKinds.set(marker.buffer, kind);
  return marker;
};

// The streams of Node.js, `Gzip` and the others: each chunk through the
// engine as it is written, and out as the engine gives it.
class FflateStream extends Transform {
  bytesWritten = 0;
  #format: Format;
  #direction: Direction;
  #options: Options;
  #engine!: { write(chunk: Uint8Array, final: boolean): void; flush(): void };
  #finished = false;
  constructor(format: Format, direction: Direction, options: Options = {}) {
    super(options as never);
    this.#format = format;
    this.#direction = direction;
    this.#options = options;
    this.reset();
  }
  reset(): void {
    const emit = (bytes: Uint8Array) => void this.push(Buffer.from(bytes));
    this.#finished = false;
    if (this.#direction === "decompress") {
      const decoder = new Decoder(this.#format, this.#options, emit);
      this.#engine = { write: (chunk, final) => decoder.write(chunk, final), flush: () => {} };
    } else {
      const encoder = encoderOf(this.#format, this.#options, emit);
      this.#engine = {
        write: (chunk, final) => encoder.push(chunk, final),
        flush: () => encoder.flush?.(true),
      };
    }
  }
  #finish(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#engine.write(new Uint8Array(0), true);
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: (error?: Error) => void) {
    const kind = chunk.byteLength === 0 ? flushKinds.get(chunk.buffer as ArrayBuffer) : undefined;
    try {
      if (kind !== undefined) {
        if (kind === zlibConstants.Z_FINISH) this.#finish();
        else if (kind !== zlibConstants.Z_NO_FLUSH) this.#engine.flush();
      } else if (this.#finished) {
        throw zlibError("stream error", "Z_STREAM_ERROR");
      } else {
        this.#engine.write(chunk, false);
        this.bytesWritten += chunk.byteLength;
      }
    } catch (error) {
      callback(errorOf(error));
      return;
    }
    callback();
  }
  override _flush(callback: (error?: Error) => void) {
    try {
      this.#finish();
    } catch (error) {
      callback(errorOf(error));
      return;
    }
    callback();
  }
  // What was written comes out, decompressible as it is: a sync flush, or
  // the end of the stream for `Z_FINISH`.
  flush(kind?: number | (() => void), callback?: () => void): void {
    const done = typeof kind === "function" ? kind : callback;
    if (this.writableEnded) {
      if (done) queueMicrotask(done);
      return;
    }
    this.write(flushMarker(typeof kind === "number" ? kind : zlibConstants.Z_FULL_FLUSH), () =>
      done?.(),
    );
  }
  close(callback?: () => void): void {
    if (callback) this.once("close", callback);
    this.destroy();
  }
  // fflate takes a level when a stream starts only: it stays.
  params(_level: number, _strategy: number, callback?: () => void): void {
    this.flush(() => callback?.());
  }
}

// The browser's compression stream of a format, or an error where it has
// none, as for Brotli in most browsers.
function webStream(format: WebFormat, direction: Direction): TransformStream {
  try {
    return direction === "compress"
      ? new CompressionStream(format as CompressionFormat)
      : new DecompressionStream(format as CompressionFormat);
  } catch {
    throw new Error(
      `vitest-plugin-rsc: zlib's ${format} ${direction === "compress" ? "compression" : "decompression"} is not there in this browser`,
    );
  }
}

// Brotli's and Zstandard's streams: what is written goes through the
// browser's stream, and is read out of it as the reader of this one reads.
class WebStream extends Transform {
  bytesWritten = 0;
  #writer: WritableStreamDefaultWriter<Uint8Array>;
  #reading: Promise<void>;
  #resume: (() => void) | undefined;
  #direction: Direction;
  constructor(format: WebFormat, direction: Direction, options?: Options) {
    super(options as never);
    this.#direction = direction;
    const stream = webStream(format, direction);
    this.#writer = stream.writable.getWriter();
    const reader = (stream.readable as ReadableStream<Uint8Array>).getReader();
    this.#reading = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (!this.push(bufferOf(value))) {
          await new Promise<void>((resume) => (this.#resume = resume));
        }
      }
    })();
    // Its error is what the writes and the close reject with.
    this.#reading.catch(() => {});
  }
  override _read(size: number) {
    const resume = this.#resume;
    this.#resume = undefined;
    resume?.();
    super._read(size);
  }
  async #settle(promise: Promise<unknown>, callback: (error?: Error) => void): Promise<void> {
    try {
      await promise;
    } catch (error) {
      callback(
        this.#direction === "decompress"
          ? zlibError(String(error), "Z_DATA_ERROR")
          : (error as Error),
      );
      return;
    }
    callback();
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: (error?: Error) => void) {
    this.bytesWritten += chunk.byteLength;
    void this.#settle(this.#writer.write(Uint8Array.from(chunk)), callback);
  }
  override _flush(callback: (error?: Error) => void) {
    void this.#settle(
      this.#writer.close().then(() => this.#reading),
      callback,
    );
  }
  override _destroy(error: Error | null, callback: (error: Error | null) => void) {
    this.#writer.abort(error ?? undefined).catch(() => {});
    callback(error);
  }
  flush(kind?: number | (() => void), callback?: () => void): void {
    const done = typeof kind === "function" ? kind : callback;
    if (done) queueMicrotask(done);
  }
  close(callback?: () => void): void {
    if (callback) this.once("close", callback);
    this.destroy();
  }
  params(_level: number, _strategy: number, callback?: () => void): void {
    if (callback) queueMicrotask(callback);
  }
  reset(): void {}
}

const fflateClass = (format: Format, direction: Direction) =>
  class extends FflateStream {
    constructor(options?: Options) {
      super(format, direction, options);
    }
  };
const webClass = (format: WebFormat, direction: Direction) =>
  class extends WebStream {
    constructor(options?: Options) {
      super(format, direction, options);
    }
  };

export const Gzip = fflateClass("gzip", "compress");
export const Gunzip = fflateClass("gzip", "decompress");
export const Deflate = fflateClass("deflate", "compress");
export const Inflate = fflateClass("deflate", "decompress");
export const DeflateRaw = fflateClass("deflate-raw", "compress");
export const InflateRaw = fflateClass("deflate-raw", "decompress");
export const Unzip = fflateClass("unzip", "decompress");
export const BrotliCompress = webClass("brotli", "compress");
export const BrotliDecompress = webClass("brotli", "decompress");
export const ZstdCompress = webClass("zstd", "compress");
export const ZstdDecompress = webClass("zstd", "decompress");

export const createGzip = (options?: Options) => new Gzip(options);
export const createGunzip = (options?: Options) => new Gunzip(options);
export const createDeflate = (options?: Options) => new Deflate(options);
export const createInflate = (options?: Options) => new Inflate(options);
export const createDeflateRaw = (options?: Options) => new DeflateRaw(options);
export const createInflateRaw = (options?: Options) => new InflateRaw(options);
export const createUnzip = (options?: Options) => new Unzip(options);
export const createBrotliCompress = (options?: Options) => new BrotliCompress(options);
export const createBrotliDecompress = (options?: Options) => new BrotliDecompress(options);
export const createZstdCompress = (options?: Options) => new ZstdCompress(options);
export const createZstdDecompress = (options?: Options) => new ZstdDecompress(options);

// What a function decompresses, at most `maxOutputLength` bytes of it.
function decompress(format: Format, data: Data, options: Options = {}): Buffer {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const limit = options.maxOutputLength ?? Number.MAX_SAFE_INTEGER;
  new Decoder(format, options, (bytes) => {
    length += bytes.length;
    if (length > limit) throw tooLarge(limit);
    chunks.push(Uint8Array.from(bytes));
  }).write(bytesOf(data), true);
  return Buffer.concat(chunks);
}
const tooLarge = (limit: number) =>
  Object.assign(new RangeError(`Cannot create a Buffer larger than ${limit} bytes`), {
    code: "ERR_BUFFER_TOO_LARGE",
  });
const compress = (format: Format, data: Data, options: Options = {}): Buffer => {
  const bytes = bytesOf(data);
  const fflate = fflateOptions(options);
  const result =
    format === "gzip"
      ? fflateGzipSync(bytes, fflate)
      : format === "deflate-raw"
        ? rawDeflateSync(bytes, fflate)
        : zlibSync(bytes, fflate);
  const limit = options.maxOutputLength ?? Number.MAX_SAFE_INTEGER;
  if (result.length > limit) throw tooLarge(limit);
  return bufferOf(result);
};

export const gzipSync = (data: Data, options?: Options) => compress("gzip", data, options);
export const gunzipSync = (data: Data, options?: Options) => decompress("gzip", data, options);
export const deflateSync = (data: Data, options?: Options) => compress("deflate", data, options);
export const inflateSync = (data: Data, options?: Options) => decompress("deflate", data, options);
export const deflateRawSync = (data: Data, options?: Options) =>
  compress("deflate-raw", data, options);
export const inflateRawSync = (data: Data, options?: Options) =>
  decompress("deflate-raw", data, options);
export const unzipSync = (data: Data, options?: Options) => decompress("unzip", data, options);

const callbackOf = (options: Options | Callback | undefined, callback?: Callback): Callback => {
  const done = typeof options === "function" ? options : callback;
  if (typeof done !== "function") {
    throw Object.assign(new TypeError('The "callback" argument must be of type function'), {
      code: "ERR_INVALID_ARG_TYPE",
    });
  }
  return done;
};
// `gzip(buffer, [options], callback)` and the others: the synchronous one,
// after the code that called it, as zlib's threads are.
const asyncOf = (run: (data: Data, options?: Options) => Buffer) =>
  function (data: Data, options: Options | Callback, callback?: Callback): void {
    const done = callbackOf(options, callback);
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

// Brotli and Zstandard at once, through the browser's stream.
const webAsyncOf = (format: WebFormat, direction: Direction) =>
  function (data: Data, options: Options | Callback, callback?: Callback): void {
    const done = callbackOf(options, callback);
    const bytes = Uint8Array.from(bytesOf(data));
    void (async () => {
      let result: Buffer;
      try {
        const stream = new Blob([bytes as BlobPart])
          .stream()
          .pipeThrough(webStream(format, direction));
        result = Buffer.from(await new Response(stream).arrayBuffer());
      } catch (error) {
        done(
          direction === "decompress" ? zlibError(String(error), "Z_DATA_ERROR") : (error as Error),
        );
        return;
      }
      done(null, result);
    })();
  };
export const brotliCompress = webAsyncOf("brotli", "compress");
export const brotliDecompress = webAsyncOf("brotli", "decompress");
export const zstdCompress = webAsyncOf("zstd", "compress");
export const zstdDecompress = webAsyncOf("zstd", "decompress");

// A browser has Brotli and Zstandard asynchronously only, if at all.
const syncNotThere = (name: string) =>
  function (_data: Data, _options?: Options): never {
    throw new Error(`vitest-plugin-rsc: zlib.${name} of Node.js is not there in the browser`);
  };
export const brotliCompressSync = syncNotThere("brotliCompressSync");
export const brotliDecompressSync = syncNotThere("brotliDecompressSync");
export const zstdCompressSync = syncNotThere("zstdCompressSync");
export const zstdDecompressSync = syncNotThere("zstdDecompressSync");

export default {
  ...zlibConstants,
  constants,
  codes,
  crc32,
  Gzip,
  Gunzip,
  Deflate,
  Inflate,
  DeflateRaw,
  InflateRaw,
  Unzip,
  BrotliCompress,
  BrotliDecompress,
  ZstdCompress,
  ZstdDecompress,
  createGzip,
  createGunzip,
  createDeflate,
  createInflate,
  createDeflateRaw,
  createInflateRaw,
  createUnzip,
  createBrotliCompress,
  createBrotliDecompress,
  createZstdCompress,
  createZstdDecompress,
  gzip,
  gunzip,
  deflate,
  inflate,
  deflateRaw,
  inflateRaw,
  unzip,
  brotliCompress,
  brotliDecompress,
  zstdCompress,
  zstdDecompress,
  gzipSync,
  gunzipSync,
  deflateSync,
  inflateSync,
  deflateRawSync,
  inflateRawSync,
  unzipSync,
  brotliCompressSync,
  brotliDecompressSync,
  zstdCompressSync,
  zstdDecompressSync,
};
