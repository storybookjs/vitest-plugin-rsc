// `node:crypto` for a browser. Web Crypto where the browser has the
// function: random values, `subtle`, and the async `pbkdf2()` and `hkdf()`
// with a SHA digest. Where Node.js answers synchronously and the browser
// only asynchronously, or not at all, the noble packages, audited
// JavaScript: the hashes of `createHash()` and `hash()`, the HMAC of
// `createHmac()`, `pbkdf2Sync()`, `hkdfSync()`, `scrypt()`, and the ciphers
// of `createCipheriv()`: AES in GCM, CBC, CTR, CFB and ECB. A secret key
// of `createSecretKey()`, which jsonwebtoken signs with. Not BLAKE2 nor
// ChaCha20-Poly1305, which a server of Next.js seldom has, for the size: 9
// kB more in every app, gzipped. The rest is unenv's: its constants, and
// functions that throw when called, like `createSign`, so that code which
// imports one loads.

import { gcm, unsafe as aesBlock } from "@noble/ciphers/aes.js";
import { hkdf as nobleHkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { md5, ripemd160, sha1 } from "@noble/hashes/legacy.js";
import { pbkdf2 as noblePbkdf2, pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { scrypt as nobleScrypt, scryptAsync } from "@noble/hashes/scrypt.js";
import { sha224, sha256, sha384, sha512, sha512_224, sha512_256 } from "@noble/hashes/sha2.js";
import { sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256 } from "@noble/hashes/sha3.js";
import unenv from "unenv/node/crypto";
import { StringDecoder as OwnStringDecoder } from "vitest-plugin-rsc/node/string_decoder";
import { Buffer as OwnBuffer } from "vitest-plugin-rsc/node/buffer";
import { Transform as OwnTransform } from "vitest-plugin-rsc/node/stream";

export * from "unenv/node/crypto";

// The package's own, typed as Node's: the built files have no types.
const Buffer = OwnBuffer as unknown as typeof globalThis.Buffer;
const Transform = OwnTransform as unknown as typeof import("node:stream").Transform;
const StringDecoder = OwnStringDecoder as typeof import("node:string_decoder").StringDecoder;

type Data = string | ArrayBufferView | ArrayBuffer;
type Callback<T> = (error: Error | null, result?: T) => void;

const web = globalThis.crypto;
export const webcrypto = web;
// Not there on a page that is no secure context, like one served over
// http at the address of the network: the async derivations are noble's
// there too.
export const subtle = web.subtle as SubtleCrypto | undefined;
export const randomUUID = () => web.randomUUID();

const codeError = <E extends Error>(error: E, code: string): E => Object.assign(error, { code });

// Node's error of a number out of its range.
const outOfRange = (name: string, range: string, received: number) =>
  codeError(
    new RangeError(
      `The value of "${name}" is out of range. It must be ${range}. Received ${received}`,
    ),
    "ERR_OUT_OF_RANGE",
  );
function integerIn(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw outOfRange(name, `>= ${min} && <= ${max}`, value);
  }
}

// `getRandomValues()` fills 64 KiB at most a call. The offset and the size
// are in bytes, of a view or of an ArrayBuffer.
const fill = <T extends ArrayBufferView | ArrayBuffer>(
  view: T,
  offset = 0,
  size = view.byteLength - offset,
): T => {
  const whole =
    view instanceof ArrayBuffer
      ? new Uint8Array(view)
      : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  integerIn("offset", offset, 0, whole.length);
  if (!Number.isInteger(size) || size < 0 || size + offset > whole.length) {
    throw outOfRange("size + offset", `<= ${whole.length}`, size + offset);
  }
  const bytes = whole.subarray(offset, offset + size);
  for (let at = 0; at < bytes.length; at += 65536) {
    web.getRandomValues(bytes.subarray(at, at + 65536));
  }
  return view;
};
export const getRandomValues = <T extends ArrayBufferView>(view: T): T =>
  web.getRandomValues(view as never);
export const randomFillSync = <T extends ArrayBufferView | ArrayBuffer>(
  view: T,
  offset?: number,
  size?: number,
) => fill(view, offset, size);
export function randomFill<T extends ArrayBufferView | ArrayBuffer>(
  view: T,
  ...rest: unknown[]
): void {
  const callback = rest.pop() as Callback<T>;
  const [offset, size] = rest as [number?, number?];
  const filled = fill(view, offset, size);
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

// An integer in [min, max), by rejection: no bias for a range that does
// not divide 2 ** 48.
export function randomInt(max: number): number;
export function randomInt(min: number, max: number): number;
export function randomInt(max: number, callback: Callback<number>): void;
export function randomInt(min: number, max: number, callback: Callback<number>): void;
export function randomInt(...args: unknown[]): number | undefined {
  const callback = typeof args.at(-1) === "function" ? (args.pop() as Callback<number>) : undefined;
  const [min, max] = (args.length === 1 ? [0, args[0]] : args) as [number, number];
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
    throw codeError(
      new RangeError(`The value of "max" is out of range. It must be greater than "min" (${min})`),
      "ERR_OUT_OF_RANGE",
    );
  }
  const range = max - min;
  if (range > 2 ** 48 - 1) throw outOfRange("max - min", `<= ${2 ** 48 - 1}`, range);
  const limit = 2 ** 48 - (2 ** 48 % range);
  const pick = (): number => {
    for (;;) {
      const bytes = web.getRandomValues(new Uint8Array(6));
      const value = bytes.reduce((total, byte) => total * 256 + byte, 0);
      if (value < limit) return min + (value % range);
    }
  };
  if (!callback) return pick();
  const value = pick();
  setTimeout(() => callback(null, value));
  return undefined;
}

// A key that `createSecretKey()` made: its bytes, and what Node's
// KeyObject of the type "secret" has. util.types' `isKeyObject()` tells
// one by this symbol.
const keyBrand = Symbol.for("vitest-plugin-rsc.KeyObject");
const keyBytes = new WeakMap<object, Uint8Array>();
export class KeyObject {
  readonly type = "secret";
  constructor(type: string, bytes: Uint8Array) {
    if (type !== "secret") {
      throw new Error(
        `vitest-plugin-rsc: a KeyObject of the type "${type}" is not there in the browser`,
      );
    }
    keyBytes.set(this, Uint8Array.from(bytes));
    Object.defineProperty(this, keyBrand, { value: true });
  }
  get symmetricKeySize(): number {
    return keyBytes.get(this)!.length;
  }
  export(options?: { format?: string }): Buffer | { kty: string; k: string } {
    const bytes = Buffer.from(keyBytes.get(this)!);
    return options?.format === "jwk" ? { kty: "oct", k: bytes.toString("base64url") } : bytes;
  }
  equals(other: KeyObject): boolean {
    const mine = keyBytes.get(this)!;
    const theirs = keyBytes.get(other);
    return !!theirs && mine.length === theirs.length && timingSafeEqual(mine, theirs);
  }
}
export const createSecretKey = (key: Data, encoding?: BufferEncoding): KeyObject =>
  new KeyObject("secret", bytesOf(key, encoding));

function bytesOf(data: Data | KeyObject, encoding?: BufferEncoding): Uint8Array {
  if (typeof data === "string") return Buffer.from(data, encoding ?? "utf8");
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const key = keyBytes.get(data);
  if (key) return key;
  throw codeError(
    new TypeError(
      'The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView',
    ),
    "ERR_INVALID_ARG_TYPE",
  );
}

function output(bytes: Uint8Array): Buffer;
function output(bytes: Uint8Array, encoding: BufferEncoding): string;
function output(bytes: Uint8Array, encoding?: BufferEncoding | "buffer"): Buffer | string;
function output(bytes: Uint8Array, encoding?: BufferEncoding | "buffer"): Buffer | string {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return encoding && encoding !== "buffer" ? buffer.toString(encoding) : buffer;
}

type State = {
  update(bytes: Uint8Array): unknown;
  digest(): Uint8Array;
  xof?(length: number): Uint8Array;
  clone(): State;
};
type Hasher = ((bytes: Uint8Array) => Uint8Array) & {
  create(options?: { dkLen?: number }): State;
  outputLen: number;
};

// By the names OpenSSL has, as Node's `getHashes()` lists them.
const hashers: Record<string, Hasher> = {
  md5,
  ripemd160,
  rmd160: ripemd160,
  sha1,
  sha224,
  sha256,
  sha384,
  sha512,
  "sha512-224": sha512_224,
  "sha512-256": sha512_256,
  "sha3-224": sha3_224,
  "sha3-256": sha3_256,
  "sha3-384": sha3_384,
  "sha3-512": sha3_512,
  shake128,
  shake256,
} as Record<string, Hasher>;
export const getHashes = (): string[] => Object.keys(hashers);

// "SHA256", "sha-256", "RSA-SHA256" and "sha2-256" are SHA-256 too.
const nameOf = (algorithm: string): string =>
  algorithm
    .toLowerCase()
    .replace(/^rsa-/, "")
    .replace(/^sha2?-(1|224|256|384|512)$/, "sha$1")
    .replace(/^sha512\/(224|256)$/, "sha512-$1");

// Node's error of an algorithm it does not have: `createHash()`'s, or that
// of a function that takes a digest, like `pbkdf2()`.
function hasherOf(algorithm: string, use: "hash" | "digest" = "hash"): Hasher {
  const hasher = typeof algorithm === "string" ? hashers[nameOf(algorithm)] : undefined;
  if (hasher) return hasher;
  if (use === "hash") throw new Error("Digest method not supported");
  throw codeError(new TypeError(`Invalid digest: ${algorithm}`), "ERR_CRYPTO_INVALID_DIGEST");
}

const finalized = () => codeError(new Error("Digest already called"), "ERR_CRYPTO_HASH_FINALIZED");

// What `createHash()` and `createHmac()` return: a digest of what
// `update()` is given, and a stream too, which writes its digest when it
// ends. As in Node.js, `digest()` after the stream's end gives that digest.
abstract class Digest extends Transform {
  #state: State;
  // SHAKE's: as many bytes as it is asked for.
  #length: number | undefined;
  #result: Uint8Array | undefined;
  #digested = false;
  constructor(state: State, length: number | undefined, options?: object) {
    super(options as never);
    this.#state = state;
    this.#length = length;
  }
  #compute(): Uint8Array {
    return (this.#result ??=
      this.#length === undefined ? this.#state.digest() : this.#state.xof!(this.#length));
  }
  protected get finished(): boolean {
    return this.#digested || this.#result !== undefined;
  }
  protected get state(): State {
    return this.#state;
  }
  protected get length(): number | undefined {
    return this.#length;
  }
  update(data: Data, encoding?: BufferEncoding): this {
    if (this.finished) throw finalized();
    this.#state.update(bytesOf(data, encoding));
    return this;
  }
  digest(): Buffer;
  digest(encoding: BufferEncoding): string;
  digest(encoding?: BufferEncoding | "buffer"): Buffer | string {
    if (this.#digested) return this.again(encoding);
    this.#digested = true;
    return output(Uint8Array.from(this.#compute()), encoding);
  }
  // A second `digest()`.
  protected abstract again(encoding?: BufferEncoding | "buffer"): Buffer | string;
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

export class Hash extends Digest {
  #xof: boolean;
  constructor(
    algorithm: string | { state: State; xof: boolean },
    options?: { outputLength?: number },
  ) {
    const length = options?.outputLength;
    if (typeof algorithm !== "string") {
      super(algorithm.state, algorithm.xof ? length : undefined, options);
      this.#xof = algorithm.xof;
      return;
    }
    const hasher = hasherOf(algorithm);
    const xof = nameOf(algorithm).startsWith("shake");
    if (length !== undefined && length !== hasher.outputLen && !xof) {
      throw codeError(
        new Error(
          `Output length ${length} is invalid for ${algorithm}, which does not support XOF`,
        ),
        "ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH",
      );
    }
    super(hasher.create(), xof ? (length ?? hasher.outputLen) : undefined, options);
    this.#xof = xof;
  }
  // A copy of SHAKE gives as many bytes as the original, or as it is asked.
  copy(options?: { outputLength?: number }): Hash {
    if (this.finished) throw finalized();
    return new Hash(
      { state: this.state.clone(), xof: this.#xof },
      { ...options, outputLength: options?.outputLength ?? this.length },
    );
  }
  protected again(): never {
    throw finalized();
  }
}
export const createHash = (algorithm: string, options?: { outputLength?: number }): Hash =>
  new Hash(algorithm, options);

// Node's one-shot hash, 21.7+: hex by default.
export function hash(algorithm: string, data: Data, encoding?: BufferEncoding): string;
export function hash(algorithm: string, data: Data, encoding: "buffer"): Buffer;
export function hash(algorithm: string, data: Data, encoding: BufferEncoding | "buffer" = "hex") {
  return output(hasherOf(algorithm)(bytesOf(data)), encoding);
}

// The HMAC of RFC 2104. A key that is a string is in `options.encoding`, as
// in Node.js. A second digest is empty, as in Node.js.
export class Hmac extends Digest {
  constructor(algorithm: string, key: Data | KeyObject, options?: { encoding?: BufferEncoding }) {
    const hasher = hasherOf(algorithm, "digest");
    const secret = bytesOf(key, typeof key === "string" ? options?.encoding : undefined);
    super(hmac.create(hasher as never, secret) as unknown as State, undefined, options);
  }
  protected again(encoding?: BufferEncoding | "buffer"): Buffer | string {
    return output(new Uint8Array(0), encoding);
  }
}
export const createHmac = (
  algorithm: string,
  key: Data | KeyObject,
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

// The digests Web Crypto derives with: natively, where JavaScript would
// take long for a password hashed 600,000 times.
const webDigests: Record<string, string> = {
  sha1: "SHA-1",
  sha256: "SHA-256",
  sha384: "SHA-384",
  sha512: "SHA-512",
};

// Calls back once the promise settles, out of the promise's own callbacks.
async function settle<T>(promise: Promise<T>, callback: Callback<T>): Promise<void> {
  let value: T;
  try {
    value = await promise;
  } catch (error) {
    callback(error as Error);
    return;
  }
  callback(null, value);
}

// Node's checks of the arguments, before it derives: they throw, also of
// the async forms, where the derivation itself calls back.
function pbkdf2Arguments(
  password: Data,
  salt: Data,
  iterations: number,
  keylen: number,
  digest: string,
) {
  const hasher = hasherOf(digest, "digest");
  integerIn("iterations", iterations, 1, 2 ** 31 - 1);
  integerIn("keylen", keylen, 0, 2 ** 31 - 1);
  // Copies: what the caller changes after the call is not the derivation's.
  return {
    hasher,
    secret: Uint8Array.from(bytesOf(password)),
    salt: Uint8Array.from(bytesOf(salt)),
  };
}
export function pbkdf2Sync(
  password: Data,
  salt: Data,
  iterations: number,
  keylen: number,
  digest: string,
): Buffer {
  const own = pbkdf2Arguments(password, salt, iterations, keylen, digest);
  return Buffer.from(
    noblePbkdf2(own.hasher as never, own.secret, own.salt, { c: iterations, dkLen: keylen }),
  );
}
export function pbkdf2(
  password: Data,
  salt: Data,
  iterations: number,
  keylen: number,
  digest: string,
  callback: Callback<Buffer>,
): void {
  const own = pbkdf2Arguments(password, salt, iterations, keylen, digest);
  const webDigest = webDigests[nameOf(digest)];
  const derived = async (): Promise<Buffer> => {
    if (!webDigest || !subtle || keylen === 0) {
      return Buffer.from(
        await pbkdf2Async(own.hasher as never, own.secret, own.salt, {
          c: iterations,
          dkLen: keylen,
        }),
      );
    }
    const key = await subtle.importKey("raw", own.secret as BufferSource, "PBKDF2", false, [
      "deriveBits",
    ]);
    const salt = own.salt as BufferSource;
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: webDigest, salt, iterations },
      key,
      keylen * 8,
    );
    return Buffer.from(bits);
  };
  void settle(derived(), callback);
}

function hkdfArguments(
  digest: string,
  ikm: Data | KeyObject,
  salt: Data,
  info: Data,
  keylen: number,
) {
  const hasher = hasherOf(digest, "digest");
  integerIn("keylen", keylen, 0, 2 ** 31 - 1);
  if (keylen > 255 * hasher.outputLen) {
    throw codeError(new RangeError("Invalid key length"), "ERR_CRYPTO_INVALID_KEYLEN");
  }
  const infoBytes = Uint8Array.from(bytesOf(info));
  if (infoBytes.length > 1024) {
    throw outOfRange("info.byteLength", "<= 1024", infoBytes.length);
  }
  return {
    hasher,
    ikm: Uint8Array.from(bytesOf(ikm)),
    salt: Uint8Array.from(bytesOf(salt)),
    info: infoBytes,
  };
}
// Node's `hkdf()` gives an ArrayBuffer.
const arrayBufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
export function hkdfSync(
  digest: string,
  ikm: Data | KeyObject,
  salt: Data,
  info: Data,
  keylen: number,
): ArrayBuffer {
  const own = hkdfArguments(digest, ikm, salt, info, keylen);
  return arrayBufferOf(nobleHkdf(own.hasher as never, own.ikm, own.salt, own.info, keylen));
}
export function hkdf(
  digest: string,
  ikm: Data | KeyObject,
  salt: Data,
  info: Data,
  keylen: number,
  callback: Callback<ArrayBuffer>,
): void {
  const own = hkdfArguments(digest, ikm, salt, info, keylen);
  const webDigest = webDigests[nameOf(digest)];
  const derived = async (): Promise<ArrayBuffer> => {
    if (!webDigest || !subtle || keylen === 0) {
      await Promise.resolve();
      return arrayBufferOf(nobleHkdf(own.hasher as never, own.ikm, own.salt, own.info, keylen));
    }
    const key = await subtle.importKey("raw", own.ikm as BufferSource, "HKDF", false, [
      "deriveBits",
    ]);
    const [hkdfSalt, hkdfInfo] = [own.salt as BufferSource, own.info as BufferSource];
    return subtle.deriveBits(
      { name: "HKDF", hash: webDigest, salt: hkdfSalt, info: hkdfInfo },
      key,
      keylen * 8,
    );
  };
  void settle(derived(), callback);
}

type ScryptOptions = {
  N?: number;
  r?: number;
  p?: number;
  cost?: number;
  blockSize?: number;
  parallelization?: number;
  maxmem?: number;
};
// Node's defaults, by either of its names, and OpenSSL's checks: N a power
// of 2, and the memory it takes, 128 bytes for each of r(N + 2) and rp, at
// most `maxmem`, 32 MiB by default.
function scryptArguments(password: Data, salt: Data, keylen: number, options: ScryptOptions = {}) {
  const N = options.N ?? options.cost ?? 16384;
  const r = options.r ?? options.blockSize ?? 8;
  const p = options.p ?? options.parallelization ?? 1;
  const maxmem = options.maxmem ?? 32 * 1024 * 1024;
  integerIn("keylen", keylen, 0, 2 ** 31 - 1);
  const invalid = (why: string) =>
    codeError(new RangeError(`Invalid scrypt params: ${why}`), "ERR_CRYPTO_INVALID_SCRYPT_PARAMS");
  if (!Number.isInteger(N) || N < 2 || (N & (N - 1)) !== 0) throw invalid("N must be a power of 2");
  if (!Number.isInteger(r) || r < 1 || !Number.isInteger(p) || p < 1) throw invalid("r and p");
  if (128 * r * (N + 2) + 128 * r * p > maxmem) throw invalid("memory limit exceeded");
  return {
    secret: Uint8Array.from(bytesOf(password)),
    salt: Uint8Array.from(bytesOf(salt)),
    options: { N, r, p, dkLen: keylen, maxmem: Number.MAX_SAFE_INTEGER },
  };
}
export const scryptSync = (password: Data, salt: Data, keylen: number, options?: ScryptOptions) => {
  const own = scryptArguments(password, salt, keylen, options);
  return Buffer.from(nobleScrypt(own.secret, own.salt, own.options));
};
export function scrypt(
  password: Data,
  salt: Data,
  keylen: number,
  callback: Callback<Buffer>,
): void;
export function scrypt(
  password: Data,
  salt: Data,
  keylen: number,
  options: ScryptOptions,
  callback: Callback<Buffer>,
): void;
export function scrypt(password: Data, salt: Data, keylen: number, ...rest: unknown[]): void {
  const callback = rest.pop() as Callback<Buffer>;
  const own = scryptArguments(password, salt, keylen, rest[0] as ScryptOptions);
  void settle(
    scryptAsync(own.secret, own.salt, own.options).then((bytes) => Buffer.from(bytes)),
    callback,
  );
}

// The ciphers, by Node's names: "aes-256-gcm" and the others. Each mode is
// written here on AES's block of the noble package, so that `update()`
// gives what it can at once, as Node's does: CTR and CFB every byte, CBC
// and ECB every whole block, but the last one when it decrypts, which has
// the padding. GCM gives at once what CTR would, and its tag at `final()`,
// which the noble package computes of all of it: an IV of GCM that is not
// 12 bytes long gives all at `final()`.
type Mode = "gcm" | "cbc" | "ctr" | "cfb" | "ecb";
type Engine = { update(input: Uint8Array): Uint8Array; final(): Uint8Array };
export const getCiphers = (): string[] =>
  [128, 192, 256].flatMap((bits) =>
    ["cbc", "cfb", "ctr", "ecb", "gcm"].map((mode) => `aes-${bits}-${mode}`),
  );

function cipherOf(algorithm: string, key: Data | KeyObject, iv: Data | null) {
  const name = algorithm.toLowerCase();
  const aes = /^(?:id-)?aes-?(128|192|256)-(gcm|cbc|ctr|cfb|ecb)$/.exec(name);
  if (!aes) {
    throw codeError(new TypeError("Invalid cipher type"), "ERR_CRYPTO_UNKNOWN_CIPHER");
  }
  const mode = aes[2] as Mode;
  // Copies: what the caller changes after this is not the cipher's.
  const keyBytes = Uint8Array.from(bytesOf(key));
  if (keyBytes.length !== Number(aes[1]) / 8) {
    throw codeError(new RangeError("Invalid key length"), "ERR_CRYPTO_INVALID_KEYLEN");
  }
  const ivBytes = iv === null ? new Uint8Array(0) : Uint8Array.from(bytesOf(iv));
  if (mode === "gcm" ? ivBytes.length === 0 : ivBytes.length !== (mode === "ecb" ? 0 : 16)) {
    throw codeError(new TypeError("Invalid initialization vector"), "ERR_CRYPTO_INVALID_IV");
  }
  return { mode, key: keyBytes, iv: ivBytes };
}

const authFailed = () => new Error("Unsupported state or unable to authenticate data");
const badDecrypt = () => codeError(new Error("bad decrypt"), "ERR_OSSL_BAD_DECRYPT");
const wrongFinalBlock = () =>
  codeError(new Error("wrong final block length"), "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH");

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  if (!a.length) return b;
  const both = new Uint8Array(a.length + b.length);
  both.set(a);
  both.set(b, a.length);
  return both;
};

// One block through AES, in a block of its own, as the noble package
// takes it.
const blockCipher = (key: Uint8Array) => {
  const encryptKey = aesBlock.expandKeyLE(key);
  let decryptKey: Uint32Array | undefined;
  return {
    encrypt: (block: Uint8Array) => aesBlock.encryptBlock(encryptKey, Uint8Array.from(block)),
    decrypt: (block: Uint8Array) =>
      aesBlock.decryptBlock((decryptKey ??= aesBlock.expandKeyDecLE(key)), Uint8Array.from(block)),
  };
};

// A counter of CTR, of all 16 bytes, or of GCM, of the last 4.
function increment(counter: Uint8Array, from: number): void {
  for (let i = 15; i >= from; i--) {
    counter[i] = (counter[i]! + 1) & 0xff;
    if (counter[i] !== 0) return;
  }
}

// CTR, and CFB of 128 bits: a byte at a time, with the keystream of AES.
function streamEngine(
  key: Uint8Array,
  iv: Uint8Array,
  mode: "ctr" | "cfb" | "gcm",
  decrypt: boolean,
): Engine {
  const aes = blockCipher(key);
  const register = Uint8Array.from(iv);
  let keystream = new Uint8Array(16);
  let used = 16;
  return {
    update(input) {
      const out = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i++) {
        if (used === 16) {
          keystream = aes.encrypt(register);
          if (mode !== "cfb") increment(register, mode === "gcm" ? 12 : 0);
          used = 0;
        }
        out[i] = input[i]! ^ keystream[used]!;
        // CFB feeds its ciphertext back.
        if (mode === "cfb") register[used] = decrypt ? input[i]! : out[i]!;
        used++;
      }
      return out;
    },
    final: () => new Uint8Array(0),
  };
}

// CBC and ECB: whole blocks, with PKCS #7 padding unless it is turned off.
function blockEngine(
  key: Uint8Array,
  iv: Uint8Array,
  mode: "cbc" | "ecb",
  decrypt: boolean,
  padding: () => boolean,
): Engine {
  const aes = blockCipher(key);
  let previous = Uint8Array.from(iv);
  let pending = new Uint8Array(0);
  const run = (bytes: Uint8Array): Uint8Array => {
    const out = new Uint8Array(bytes.length);
    for (let at = 0; at < bytes.length; at += 16) {
      const block = bytes.subarray(at, at + 16);
      if (decrypt) {
        const plain = aes.decrypt(block);
        if (mode === "cbc") for (let i = 0; i < 16; i++) plain[i]! ^= previous[i]!;
        previous = Uint8Array.from(block);
        out.set(plain, at);
      } else {
        const input = Uint8Array.from(block);
        if (mode === "cbc") for (let i = 0; i < 16; i++) input[i]! ^= previous[i]!;
        previous = aes.encrypt(input);
        out.set(previous, at);
      }
    }
    return out;
  };
  return {
    update(input) {
      const bytes = concat(pending, input);
      // A decryption with padding keeps its last whole block for `final()`.
      let ready = bytes.length - (bytes.length % 16);
      if (decrypt && padding() && ready === bytes.length && ready > 0) ready -= 16;
      pending = bytes.slice(ready);
      return run(bytes.subarray(0, ready));
    },
    final() {
      // Without padding, what is pending is whole blocks or nothing: a
      // block kept for the padding, before it was turned off, goes as it is.
      if (!padding()) {
        if (pending.length % 16) throw wrongFinalBlock();
        return run(pending);
      }
      if (!decrypt) {
        const size = 16 - pending.length;
        return run(concat(pending, new Uint8Array(size).fill(size)));
      }
      if (pending.length !== 16) throw wrongFinalBlock();
      const last = run(pending);
      const size = last[15]!;
      if (size < 1 || size > 16 || last.subarray(16 - size).some((byte) => byte !== size)) {
        throw badDecrypt();
      }
      return last.subarray(0, 16 - size);
    },
  };
}

class CipherBase extends Transform {
  #mode: Mode;
  #key: Uint8Array;
  #iv: Uint8Array;
  #decrypt: boolean;
  #engine: Engine | undefined;
  // GCM's: all of it, for its tag.
  #chunks: Uint8Array[] = [];
  #aad: Uint8Array = new Uint8Array(0);
  #padding = true;
  #tag: Uint8Array | undefined;
  #done = false;
  // Of the output as a string: across `update()` and `final()`, so that a
  // character or a base64 group that spans two of them comes out whole.
  #decoder: { write(bytes: Buffer): string; end(): string; encoding: string } | undefined;
  constructor(
    decrypt: boolean,
    algorithm: string,
    key: Data | KeyObject,
    iv: Data | null,
    options?: { authTagLength?: number },
  ) {
    super(options as never);
    const { mode, key: keyBytes, iv: ivBytes } = cipherOf(algorithm, key, iv);
    this.#mode = mode;
    this.#key = keyBytes;
    this.#iv = ivBytes;
    this.#decrypt = decrypt;
    const tagLength = options?.authTagLength ?? 16;
    if (mode === "gcm" && tagLength !== 16) {
      throw new Error(
        `vitest-plugin-rsc: an authTagLength of ${tagLength} is not there in the browser, only 16`,
      );
    }
  }
  // Made at the first `update()`, after `setAutoPadding()`.
  #engineOf(): Engine | undefined {
    if (this.#engine) return this.#engine;
    const [key, iv, decrypt, mode] = [this.#key, this.#iv, this.#decrypt, this.#mode];
    if (mode === "cbc" || mode === "ecb") {
      this.#engine = blockEngine(key, iv, mode, decrypt, () => this.#padding);
    } else if (mode !== "gcm") {
      this.#engine = streamEngine(key, iv, mode, decrypt);
    } else if (iv.length === 12) {
      // GCM's counter starts at the IV and 1, and its data at 2.
      const counter = new Uint8Array(16);
      counter.set(iv);
      counter[15] = 2;
      this.#engine = streamEngine(key, counter, "gcm", decrypt);
    }
    return this.#engine;
  }
  #state(): void {
    if (this.#done) throw codeError(new Error("Unsupported state"), "ERR_CRYPTO_INVALID_STATE");
  }
  #output(bytes: Uint8Array, encoding: BufferEncoding | undefined, last: boolean): Buffer | string {
    if (!encoding || (encoding as string) === "buffer") return output(bytes);
    if (this.#decoder && this.#decoder.encoding !== encoding) {
      throw new Error("Cannot change encoding");
    }
    const decoder = (this.#decoder ??= Object.assign(new StringDecoder(encoding), { encoding }));
    const text = decoder.write(output(bytes));
    return last ? text + decoder.end() : text;
  }
  update(data: Data, inputEncoding?: BufferEncoding): Buffer;
  update(
    data: Data,
    inputEncoding: BufferEncoding | undefined,
    outputEncoding: BufferEncoding,
  ): string;
  update(
    data: Data,
    inputEncoding?: BufferEncoding,
    outputEncoding?: BufferEncoding,
  ): Buffer | string {
    this.#state();
    const input = Uint8Array.from(bytesOf(data, inputEncoding));
    if (this.#mode === "gcm") this.#chunks.push(input);
    const engine = this.#engineOf();
    return this.#output(engine ? engine.update(input) : new Uint8Array(0), outputEncoding, false);
  }
  final(): Buffer;
  final(outputEncoding: BufferEncoding): string;
  final(outputEncoding?: BufferEncoding): Buffer | string {
    this.#state();
    this.#done = true;
    const engine = this.#engineOf();
    if (this.#mode !== "gcm") return this.#output(engine!.final(), outputEncoding, true);
    const all = Buffer.concat(this.#chunks);
    const aead = gcm(this.#key, this.#iv, this.#aad);
    if (!this.#decrypt) {
      const sealed = aead.encrypt(all);
      this.#tag = sealed.slice(sealed.length - 16);
      return this.#output(
        engine ? new Uint8Array(0) : sealed.subarray(0, -16),
        outputEncoding,
        true,
      );
    }
    if (!this.#tag) throw authFailed();
    let plain: Uint8Array;
    try {
      plain = aead.decrypt(Buffer.concat([all, this.#tag]));
    } catch {
      throw authFailed();
    }
    return this.#output(engine ? new Uint8Array(0) : plain, outputEncoding, true);
  }
  // More than one call authenticates all of them, as OpenSSL does.
  setAAD(aad: Data): this {
    this.#aad = concat(this.#aad, Uint8Array.from(bytesOf(aad)));
    return this;
  }
  setAutoPadding(padding = true): this {
    this.#padding = padding;
    return this;
  }
  getAuthTag(): Buffer {
    if (this.#decrypt || !this.#tag) {
      throw codeError(
        new Error("Invalid state for operation getAuthTag"),
        "ERR_CRYPTO_INVALID_STATE",
      );
    }
    return Buffer.from(this.#tag);
  }
  setAuthTag(tag: Data): this {
    if (!this.#decrypt || this.#done) {
      throw codeError(
        new Error("Invalid state for operation setAuthTag"),
        "ERR_CRYPTO_INVALID_STATE",
      );
    }
    const bytes = Uint8Array.from(bytesOf(tag));
    // Node.js takes a tag of 4 to 16 bytes: the noble package's AEAD, 16.
    if (bytes.length !== 16) {
      throw codeError(
        new TypeError(`Invalid authentication tag length: ${bytes.length}`),
        "ERR_CRYPTO_INVALID_AUTH_TAG",
      );
    }
    this.#tag = bytes;
    return this;
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: (error?: Error) => void) {
    try {
      this.push(this.update(chunk));
    } catch (error) {
      callback(error as Error);
      return;
    }
    callback();
  }
  override _flush(callback: (error?: Error) => void): void {
    try {
      this.push(this.final());
    } catch (error) {
      callback(error as Error);
      return;
    }
    callback();
  }
}
export class Cipheriv extends CipherBase {
  constructor(algorithm: string, key: Data | KeyObject, iv: Data | null, options?: object) {
    super(false, algorithm, key, iv, options);
  }
}
export class Decipheriv extends CipherBase {
  constructor(algorithm: string, key: Data | KeyObject, iv: Data | null, options?: object) {
    super(true, algorithm, key, iv, options);
  }
}
export const createCipheriv = (
  algorithm: string,
  key: Data | KeyObject,
  iv: Data | null,
  options?: object,
) => new Cipheriv(algorithm, key, iv, options);
export const createDecipheriv = (
  algorithm: string,
  key: Data | KeyObject,
  iv: Data | null,
  options?: object,
) => new Decipheriv(algorithm, key, iv, options);

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
  KeyObject,
  createSecretKey,
  getHashes,
  Hash,
  createHash,
  hash,
  Hmac,
  createHmac,
  timingSafeEqual,
  pbkdf2Sync,
  pbkdf2,
  hkdfSync,
  hkdf,
  scryptSync,
  scrypt,
  getCiphers,
  Cipheriv,
  Decipheriv,
  createCipheriv,
  createDecipheriv,
};
