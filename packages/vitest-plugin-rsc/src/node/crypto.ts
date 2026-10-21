// `node:crypto` for a browser: Web Crypto for random values and `subtle`,
// which is what Next's server uses where it has no Web Crypto branch, like
// `randomFillSync` for the ids of nanoid. The hashes of @noble/hashes,
// audited JavaScript, for `createHash()` and `hash()`, which Next's cache
// keys need synchronously, and on them the HMAC of `createHmac()`: what
// checks the signature of a webhook or of a JWT with HS256, synchronously
// too. MD5, SHA-1 and SHA-2, which a server's code hashes with; another
// algorithm throws, as in Node.js. The rest is unenv's: its constants, and
// functions that throw when called, like `createCipheriv` and `pbkdf2`, so
// that code which imports one loads. See "Node.js In The Browser" in the
// README for what is here and what is not.

import { hmac } from "@noble/hashes/hmac.js";
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import unenv from "unenv/node/crypto";
import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";
import { Transform as OwnTransform } from "vitest-plugin-rsc/node/stream";

export * from "unenv/node/crypto";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;
const Transform = OwnTransform as unknown as typeof import("node:stream").Transform;

type Data = string | ArrayBufferView | ArrayBuffer;
type Callback<T> = (error: Error | null, result?: T) => void;

const web = globalThis.crypto;
export const webcrypto = web;
export const subtle = web.subtle;
export const randomUUID = () => web.randomUUID();
export const getRandomValues = <T extends ArrayBufferView>(view: T): T =>
  web.getRandomValues(view as never);

const codeError = <E extends Error>(error: E, code: string): E => Object.assign(error, { code });
// Node's error of a number out of its range, with a large one as Node
// writes it: 281_474_976_710_656.
const outOfRange = (name: string, range: string, received: number) =>
  codeError(
    new RangeError(
      `The value of "${name}" is out of range. It must be ${range}. Received ${
        Math.abs(received) > 2 ** 32 ? String(received).replace(/\B(?=(\d{3})+$)/g, "_") : received
      }`,
    ),
    "ERR_OUT_OF_RANGE",
  );

// The offset and the size are in elements of the view, as in Node.js, and
// its errors in bytes. `getRandomValues()` fills 64 KiB at most a call.
function fill<T extends ArrayBufferView | ArrayBuffer>(view: T, offset = 0, size?: number): T {
  const element = (view as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
  const whole =
    view instanceof ArrayBuffer
      ? new Uint8Array(view)
      : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const start = offset * element;
  if (!Number.isInteger(offset) || start < 0 || start > whole.length) {
    throw outOfRange("offset", `>= 0 && <= ${whole.length}`, start);
  }
  const end = size === undefined ? whole.length : start + size * element;
  if (!Number.isInteger(size ?? 0) || end < start || end > whole.length) {
    throw outOfRange("size + offset", `<= ${whole.length}`, end);
  }
  for (let at = start; at < end; at += 65536) {
    web.getRandomValues(whole.subarray(at, Math.min(at + 65536, end)));
  }
  return view;
}
export const randomFillSync = <T extends ArrayBufferView | ArrayBuffer>(
  view: T,
  offset?: number,
  size?: number,
): T => fill(view, offset, size);
// `randomFill(view, [offset, [size]], callback)`, which calls back after
// the code that called it, as Node's does.
export function randomFill<T extends ArrayBufferView | ArrayBuffer>(
  view: T,
  ...rest: unknown[]
): void {
  const callback = rest.pop() as Callback<T>;
  const filled = fill(view, ...(rest as [number?, number?]));
  setTimeout(() => callback(null, filled));
}
export function randomBytes(size: number): Buffer;
export function randomBytes(size: number, callback: Callback<Buffer>): void;
export function randomBytes(size: number, callback?: Callback<Buffer>): Buffer | undefined {
  const bytes = fill(Buffer.alloc(size));
  if (!callback) return bytes;
  setTimeout(() => callback(null, bytes));
  return undefined;
}

// An integer in [min, max), of 48 random bits, as Node's: by rejection, so
// that a range which does not divide 2 ** 48 has no bias.
export function randomInt(max: number, callback?: Callback<number>): number | undefined;
export function randomInt(
  min: number,
  max: number,
  callback?: Callback<number>,
): number | undefined;
export function randomInt(...args: unknown[]): number | undefined {
  const callback = typeof args.at(-1) === "function" ? (args.pop() as Callback<number>) : undefined;
  const [min, max] = (args.length === 1 ? [0, args[0]] : args) as [number, number];
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
    throw codeError(
      new RangeError(
        `The value of "max" is out of range. It must be greater than the value of "min" (${min}). Received ${max}`,
      ),
      "ERR_OUT_OF_RANGE",
    );
  }
  const range = max - min;
  if (range > 2 ** 48 - 1) throw outOfRange("max - min", `<= ${2 ** 48 - 1}`, range);
  const limit = 2 ** 48 - (2 ** 48 % range);
  let value: number;
  do {
    value = web.getRandomValues(new Uint8Array(6)).reduce((total, byte) => total * 256 + byte, 0);
  } while (value >= limit);
  const result = min + (value % range);
  if (!callback) return result;
  setTimeout(() => callback(null, result));
  return undefined;
}

function bytesOf(data: Data, encoding?: BufferEncoding): Uint8Array {
  if (typeof data === "string") return Buffer.from(data, encoding ?? "utf8");
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw codeError(
    new TypeError(
      'The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView',
    ),
    "ERR_INVALID_ARG_TYPE",
  );
}

const output = (bytes: Uint8Array, encoding?: BufferEncoding | "buffer"): Buffer | string => {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return encoding && encoding !== "buffer" ? buffer.toString(encoding) : buffer;
};

type State = { update(bytes: Uint8Array): unknown; digest(): Uint8Array; clone(): State };
type Hasher = ((bytes: Uint8Array) => Uint8Array) & { create(): State };

// By the names OpenSSL has, as Node's `getHashes()` lists them.
const hashers = { md5, sha1, sha224, sha256, sha384, sha512 } as Record<string, Hasher>;
export const getHashes = (): string[] => Object.keys(hashers);

// "SHA256", "sha-256" and "RSA-SHA256" are SHA-256 too. An algorithm that
// is not here throws Node's error: `createHash()`'s, `hash()`'s, or that of
// a function that takes a digest, `createHmac()`.
function hasherOf(algorithm: string, use: "hash" | "one-shot" | "digest"): Hasher {
  const name = String(algorithm)
    .toLowerCase()
    .replace(/^rsa-/, "")
    .replace(/^sha-(1|224|256|384|512)$/, "sha$1");
  const hasher = Object.hasOwn(hashers, name) ? hashers[name] : undefined;
  if (hasher) return hasher;
  if (use === "hash") throw new Error("Digest method not supported");
  if (use === "one-shot") throw new Error(`Digest method ${algorithm} is not supported`);
  throw codeError(new TypeError(`Invalid digest: ${algorithm}`), "ERR_CRYPTO_INVALID_DIGEST");
}

const finalized = () => codeError(new Error("Digest already called"), "ERR_CRYPTO_HASH_FINALIZED");

// What `createHash()` and `createHmac()` return: a digest of what
// `update()` is given, and a stream too, which writes its digest when it
// ends, as Node's do for `stream.pipe(createHash("sha256"))`. `digest()`
// after the stream's end gives that digest.
class Digest extends Transform {
  #state: State;
  #result: Uint8Array | undefined;
  #digested = false;
  #again: () => Uint8Array;
  constructor(state: State, again: () => Uint8Array, options?: object) {
    super(options as never);
    this.#state = state;
    this.#again = again;
  }
  #compute(): Uint8Array {
    return (this.#result ??= this.#state.digest());
  }
  protected get state(): State {
    if (this.#digested || this.#result) throw finalized();
    return this.#state;
  }
  update(data: Data, encoding?: BufferEncoding): this {
    this.state.update(bytesOf(data, encoding));
    return this;
  }
  digest(): Buffer;
  digest(encoding: BufferEncoding): string;
  digest(encoding?: BufferEncoding | "buffer"): Buffer | string {
    if (this.#digested) return output(this.#again(), encoding);
    this.#digested = true;
    return output(Uint8Array.from(this.#compute()), encoding);
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: (error?: Error) => void) {
    try {
      this.update(chunk);
    } catch (error) {
      callback(error as Error);
      return;
    }
    callback();
  }
  override _flush(callback: () => void): void {
    this.push(Buffer.from(this.#compute()));
    callback();
  }
}

// A second `digest()` of a hash throws, as in Node.js.
export class Hash extends Digest {
  constructor(algorithm: string | State, options?: object) {
    const state = typeof algorithm === "string" ? hasherOf(algorithm, "hash").create() : algorithm;
    super(
      state,
      () => {
        throw finalized();
      },
      options,
    );
  }
  copy(options?: object): Hash {
    return new Hash(this.state.clone(), options);
  }
}
export const createHash = (algorithm: string, options?: object): Hash =>
  new Hash(algorithm, options);

// Node's one-shot hash, of 21.7: hex by default.
export const hash = (
  algorithm: string,
  data: Data,
  encoding: BufferEncoding | "buffer" = "hex",
): Buffer | string => output(hasherOf(algorithm, "one-shot")(bytesOf(data)), encoding);

// The HMAC of RFC 2104. A key that is a string is in `options.encoding`, as
// in Node.js. A second `digest()` is empty, as in Node.js.
export class Hmac extends Digest {
  constructor(algorithm: string, key: Data, options?: { encoding?: BufferEncoding }) {
    const hasher = hasherOf(algorithm, "digest");
    const secret = bytesOf(key, typeof key === "string" ? options?.encoding : undefined);
    super(
      hmac.create(hasher as never, secret) as unknown as State,
      () => new Uint8Array(0),
      options,
    );
  }
}
export const createHmac = (
  algorithm: string,
  key: Data,
  options?: { encoding?: BufferEncoding },
): Hmac => new Hmac(algorithm, key, options);

// Whether two buffers have the same bytes, in a time that does not depend
// on where they differ. Two of another length throw, as in Node.js.
export function timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.byteLength !== b.byteLength) {
    throw codeError(
      new RangeError("Input buffers must have the same byte length"),
      "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH",
    );
  }
  const left = bytesOf(a);
  const right = bytesOf(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i]! ^ right[i]!;
  return difference === 0;
}

export default {
  ...unenv,
  webcrypto,
  subtle,
  randomUUID,
  getRandomValues,
  randomFillSync,
  randomFill,
  randomBytes,
  randomInt,
  getHashes,
  Hash,
  createHash,
  hash,
  Hmac,
  createHmac,
  timingSafeEqual,
};
