// `node:zlib` for a browser. The web's compression streams for what is
// asynchronous in Node.js: the streams of `createGzip()` and the others,
// and `gzip()` and the others with a callback. fflate, in JavaScript, for
// what is synchronous: `gzipSync()` and the others. A level of compression
// is fflate's only: the web's streams have none. Brotli and Zstandard where
// the browser's streams have the format; where not, and synchronously,
// they throw. `crc32()` in JavaScript, and unenv's constants.
//
// A stream's `flush()` calls back once what it was given is written: the
// web's streams have no flush of their own, so what it compressed comes
// out as they give it.

import {
  deflateSync as rawDeflateSync,
  gunzipSync as fflateGunzipSync,
  gzipSync as fflateGzipSync,
  inflateSync as rawInflateSync,
  unzlibSync,
  zlibSync,
} from "fflate/browser";
import { codes } from "unenv/node/internal/zlib/codes";
import * as zlibConstants from "unenv/node/internal/zlib/constants";
import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";
import { Transform as OwnTransform } from "vitest-plugin-rsc/node/stream";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;
const Transform = OwnTransform as unknown as typeof import("node:stream").Transform;

export const constants = { ...zlibConstants };
export { codes };

type Data = string | ArrayBuffer | ArrayBufferView;
type Options = { level?: number; info?: boolean } & Record<string, unknown>;
type Callback = (error: Error | null, result?: Buffer) => void;
type Direction = "compress" | "decompress";
// The web's names of the formats. "unzip" is gzip or deflate, by the bytes.
type Format = "gzip" | "deflate" | "deflate-raw" | "brotli" | "zstd" | "unzip";

const bytesOf = (data: Data): Uint8Array =>
  typeof data === "string"
    ? Buffer.from(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

const bufferOf = (bytes: Uint8Array): Buffer =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Node's error of data it cannot decompress, with the browser's message.
const dataError = (error: unknown): Error =>
  Object.assign(new Error((error as Error)?.message ?? String(error)), {
    errno: zlibConstants.Z_DATA_ERROR,
    code: "Z_DATA_ERROR",
  });

const notThere = (what: string) =>
  new Error(`vitest-plugin-rsc: zlib's ${what} is not there in this browser`);

// What the bytes start with: gzip's magic number, or a zlib header.
const formatOf = (format: Format, first: Uint8Array): Exclude<Format, "unzip"> =>
  format !== "unzip" ? format : first[0] === 0x1f && first[1] === 0x8b ? "gzip" : "deflate";

// The browser's stream of a format, or an error where it has none, as for
// Brotli in most of them.
function webStream(format: Exclude<Format, "unzip">, direction: Direction): TransformStream {
  try {
    return direction === "compress"
      ? new CompressionStream(format as CompressionFormat)
      : new DecompressionStream(format as CompressionFormat);
  } catch {
    throw notThere(`${format} ${direction === "compress" ? "compression" : "decompression"}`);
  }
}

// The streams of Node.js, `Gzip` and the others: what is written goes
// through the browser's stream, and what comes out of it is read.
class WebZlib extends Transform {
  bytesWritten = 0;
  #format: Format;
  #direction: Direction;
  #writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  #reading: Promise<void> | undefined;
  constructor(format: Format, direction: Direction, options?: Options) {
    super(options as never);
    this.#format = format;
    this.#direction = direction;
  }
  // Made with the first bytes, which tell what "unzip" is.
  #open(first: Uint8Array): WritableStreamDefaultWriter<Uint8Array> {
    if (this.#writer) return this.#writer;
    const stream = webStream(formatOf(this.#format, first), this.#direction);
    this.#writer = stream.writable.getWriter();
    const reader = (stream.readable as ReadableStream<Uint8Array>).getReader();
    this.#reading = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        this.push(bufferOf(value));
      }
    })();
    // Its error is what the writes and the close reject with.
    this.#reading.catch(() => {});
    return this.#writer;
  }
  #fail(error: unknown): Error {
    return this.#direction === "decompress" ? dataError(error) : (error as Error);
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: (error?: Error) => void) {
    // Of `flush()`, or nothing yet to tell the format by.
    if (chunk.byteLength === 0 && !this.#writer) {
      callback();
      return;
    }
    let writer: WritableStreamDefaultWriter<Uint8Array>;
    try {
      writer = this.#open(chunk);
    } catch (error) {
      callback(error as Error);
      return;
    }
    this.bytesWritten += chunk.byteLength;
    void this.#settle(writer.write(Uint8Array.from(chunk)), callback);
  }
  // Calls back once the promise settles, out of the promise's own callbacks.
  async #settle(promise: Promise<unknown>, callback: (error?: Error) => void): Promise<void> {
    try {
      await promise;
    } catch (error) {
      callback(this.#fail(error));
      return;
    }
    callback();
  }
  override _flush(callback: (error?: Error) => void) {
    let writer: WritableStreamDefaultWriter<Uint8Array>;
    try {
      writer = this.#open(new Uint8Array(0));
    } catch (error) {
      callback(error as Error);
      return;
    }
    void this.#settle(
      writer.close().then(() => this.#reading),
      callback,
    );
  }
  override _destroy(error: Error | null, callback: (error: Error | null) => void) {
    this.#writer?.abort(error ?? undefined).catch(() => {});
    callback(error);
  }
  flush(kind?: number | (() => void), callback?: () => void): void {
    const done = typeof kind === "function" ? kind : callback;
    this.write(new Uint8Array(0), () => done?.());
  }
  close(callback?: () => void): void {
    if (callback) this.once("close", callback);
    this.destroy();
  }
  params(_level: number, _strategy: number, callback?: () => void): void {
    queueMicrotask(() => callback?.());
  }
  reset(): void {}
}

const classOf = (format: Format, direction: Direction) =>
  class extends WebZlib {
    constructor(options?: Options) {
      super(format, direction, options);
    }
  };

export const Gzip = classOf("gzip", "compress");
export const Gunzip = classOf("gzip", "decompress");
export const Deflate = classOf("deflate", "compress");
export const Inflate = classOf("deflate", "decompress");
export const DeflateRaw = classOf("deflate-raw", "compress");
export const InflateRaw = classOf("deflate-raw", "decompress");
export const Unzip = classOf("unzip", "decompress");
export const BrotliCompress = classOf("brotli", "compress");
export const BrotliDecompress = classOf("brotli", "decompress");
export const ZstdCompress = classOf("zstd", "compress");
export const ZstdDecompress = classOf("zstd", "decompress");

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

// `gzip(buffer, [options], callback)` and the others: through the
// browser's stream, at once.
async function run(format: Format, direction: Direction, bytes: Uint8Array): Promise<Buffer> {
  const stream = webStream(formatOf(format, bytes), direction);
  const result = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  try {
    return Buffer.from(await new Response(result).arrayBuffer());
  } catch (error) {
    throw direction === "decompress" ? dataError(error) : error;
  }
}
const asyncOf = (format: Format, direction: Direction) =>
  function (data: Data, options: Options | Callback, callback?: Callback): void {
    const done = (typeof options === "function" ? options : callback) as Callback;
    if (typeof done !== "function") {
      throw Object.assign(new TypeError('The "callback" argument must be of type function'), {
        code: "ERR_INVALID_ARG_TYPE",
      });
    }
    void (async () => {
      let result: Buffer;
      try {
        result = await run(format, direction, bytesOf(data));
      } catch (error) {
        done(error as Error);
        return;
      }
      done(null, result);
    })();
  };

export const gzip = asyncOf("gzip", "compress");
export const gunzip = asyncOf("gzip", "decompress");
export const deflate = asyncOf("deflate", "compress");
export const inflate = asyncOf("deflate", "decompress");
export const deflateRaw = asyncOf("deflate-raw", "compress");
export const inflateRaw = asyncOf("deflate-raw", "decompress");
export const unzip = asyncOf("unzip", "decompress");
export const brotliCompress = asyncOf("brotli", "compress");
export const brotliDecompress = asyncOf("brotli", "decompress");
export const zstdCompress = asyncOf("zstd", "compress");
export const zstdDecompress = asyncOf("zstd", "decompress");

// fflate's level is zlib's, 0 to 9; zlib's default, -1, is fflate's.
const levelOf = (options?: Options) =>
  options?.level === undefined || options.level < 0
    ? {}
    : { level: options.level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };

// fflate's errors by their code: 0 is data that ends too soon.
const syncOf =
  (run: (bytes: Uint8Array, options?: Options) => Uint8Array, decompress: boolean) =>
  (data: Data, options?: Options): Buffer => {
    try {
      return bufferOf(run(bytesOf(data), options));
    } catch (error) {
      if (!decompress) throw error;
      if ((error as { code?: number }).code === 0) {
        throw Object.assign(new Error("unexpected end of file"), {
          errno: zlibConstants.Z_BUF_ERROR,
          code: "Z_BUF_ERROR",
        });
      }
      throw dataError(error);
    }
  };

export const gzipSync = syncOf((bytes, options) => fflateGzipSync(bytes, levelOf(options)), false);
export const gunzipSync = syncOf((bytes) => fflateGunzipSync(bytes), true);
export const deflateSync = syncOf((bytes, options) => zlibSync(bytes, levelOf(options)), false);
export const inflateSync = syncOf((bytes) => unzlibSync(bytes), true);
export const deflateRawSync = syncOf(
  (bytes, options) => rawDeflateSync(bytes, levelOf(options)),
  false,
);
export const inflateRawSync = syncOf((bytes) => rawInflateSync(bytes), true);
export const unzipSync = syncOf(
  (bytes) => (formatOf("unzip", bytes) === "gzip" ? fflateGunzipSync(bytes) : unzlibSync(bytes)),
  true,
);
const syncNotThere = (name: string) =>
  function (_data: Data, _options?: Options): never {
    throw notThere(name);
  };
export const brotliCompressSync = syncNotThere("brotliCompressSync");
export const brotliDecompressSync = syncNotThere("brotliDecompressSync");
export const zstdCompressSync = syncNotThere("zstdCompressSync");
export const zstdDecompressSync = syncNotThere("zstdDecompressSync");

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

export default {
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
