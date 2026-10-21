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

import { cbc, cfb, ctr, ecb, gcm } from "@noble/ciphers/aes.js";
import { hkdf as nobleHkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { md5, ripemd160, sha1 } from "@noble/hashes/legacy.js";
import { pbkdf2 as noblePbkdf2, pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { scrypt as nobleScrypt, scryptAsync } from "@noble/hashes/scrypt.js";
import { sha224, sha256, sha384, sha512, sha512_224, sha512_256 } from "@noble/hashes/sha2.js";
import { sha3_224, sha3_256, sha3_384, sha3_512, shake128, shake256 } from "@noble/hashes/sha3.js";
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

const codeError = <E extends Error>(error: E, code: string): E => Object.assign(error, { code });

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
  if (range > 2 ** 48) {
    throw codeError(new RangeError('The value of "max - min" is out of range'), "ERR_OUT_OF_RANGE");
  }
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

function hasherOf(algorithm: string): Hasher {
  const hasher = typeof algorithm === "string" ? hashers[nameOf(algorithm)] : undefined;
  if (!hasher) throw new Error("Digest method not supported");
  return hasher;
}

const finalized = () => codeError(new Error("Digest already called"), "ERR_CRYPTO_HASH_FINALIZED");

// What `createHash()` returns: a hash of what `update()` is given, and a
// stream too, which writes its digest when it ends.
export class Hash extends Transform {
  #state: State;
  #digested = false;
  constructor(algorithm: string | State, options?: { outputLength?: number }) {
    super(options as never);
    if (typeof algorithm !== "string") {
      this.#state = algorithm;
      return;
    }
    const hasher = hasherOf(algorithm);
    const length = options?.outputLength;
    if (
      length !== undefined &&
      length !== hasher.outputLen &&
      !nameOf(algorithm).startsWith("shake")
    ) {
      throw codeError(
        new Error(
          `Output length ${length} is invalid for ${algorithm}, which does not support XOF`,
        ),
        "ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH",
      );
    }
    this.#state = hasher.create(length === undefined ? undefined : { dkLen: length });
  }
  update(data: Data, encoding?: BufferEncoding): this {
    if (this.#digested) throw finalized();
    this.#state.update(bytesOf(data, encoding));
    return this;
  }
  digest(): Buffer;
  digest(encoding: BufferEncoding): string;
  digest(encoding?: BufferEncoding | "buffer"): Buffer | string {
    if (this.#digested) throw finalized();
    this.#digested = true;
    return output(this.#state.digest(), encoding);
  }
  copy(options?: { outputLength?: number }): Hash {
    if (this.#digested) throw finalized();
    return new Hash(this.#state.clone(), options);
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: () => void): void {
    this.update(chunk);
    callback();
  }
  override _flush(callback: () => void): void {
    this.push(this.digest());
    callback();
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

// What `createHmac()` returns: the HMAC of RFC 2104 of what `update()` is
// given, a stream as Hash is. A second digest is empty, as in Node.js.
export class Hmac extends Transform {
  #state: State;
  #digested = false;
  constructor(algorithm: string, key: Data | KeyObject, options?: object) {
    super(options as never);
    this.#state = hmac.create(hasherOf(algorithm) as never, bytesOf(key)) as unknown as State;
  }
  update(data: Data, encoding?: BufferEncoding): this {
    if (this.#digested) throw finalized();
    this.#state.update(bytesOf(data, encoding));
    return this;
  }
  digest(): Buffer;
  digest(encoding: BufferEncoding): string;
  digest(encoding?: BufferEncoding | "buffer"): Buffer | string {
    if (this.#digested) return output(new Uint8Array(0), encoding);
    this.#digested = true;
    return output(this.#state.digest(), encoding);
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: () => void): void {
    this.update(chunk);
    callback();
  }
  override _flush(callback: () => void): void {
    this.push(this.digest());
    callback();
  }
}
export const createHmac = (algorithm: string, key: Data | KeyObject, options?: object): Hmac =>
  new Hmac(algorithm, key, options);

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

export const pbkdf2Sync = (
  password: Data,
  salt: Data,
  iterations: number,
  keylen: number,
  digest: string,
): Buffer =>
  Buffer.from(
    noblePbkdf2(hasherOf(digest) as never, bytesOf(password), bytesOf(salt), {
      c: iterations,
      dkLen: keylen,
    }),
  );
export function pbkdf2(
  password: Data,
  salt: Data,
  iterations: number,
  keylen: number,
  digest: string,
  callback: Callback<Buffer>,
): void {
  const hasher = hasherOf(digest);
  const [secret, bytes] = [bytesOf(password), bytesOf(salt)];
  const webDigest = webDigests[nameOf(digest)];
  const derived =
    webDigest && keylen > 0
      ? subtle
          .importKey("raw", secret as BufferSource, "PBKDF2", false, ["deriveBits"])
          .then((key) =>
            subtle.deriveBits(
              { name: "PBKDF2", hash: webDigest, salt: bytes as BufferSource, iterations },
              key,
              keylen * 8,
            ),
          )
          .then((bits) => Buffer.from(bits))
      : pbkdf2Async(hasher as never, secret, bytes, { c: iterations, dkLen: keylen }).then((bits) =>
          Buffer.from(bits),
        );
  void settle(derived, callback);
}

// Node's `hkdf()` gives an ArrayBuffer.
const arrayBufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
export const hkdfSync = (
  digest: string,
  ikm: Data | KeyObject,
  salt: Data,
  info: Data,
  keylen: number,
): ArrayBuffer =>
  arrayBufferOf(
    nobleHkdf(hasherOf(digest) as never, bytesOf(ikm), bytesOf(salt), bytesOf(info), keylen),
  );
export function hkdf(
  digest: string,
  ikm: Data | KeyObject,
  salt: Data,
  info: Data,
  keylen: number,
  callback: Callback<ArrayBuffer>,
): void {
  hasherOf(digest);
  const webDigest = webDigests[nameOf(digest)];
  const derived =
    webDigest && keylen > 0
      ? subtle
          .importKey("raw", bytesOf(ikm) as BufferSource, "HKDF", false, ["deriveBits"])
          .then((key) =>
            subtle.deriveBits(
              {
                name: "HKDF",
                hash: webDigest,
                salt: bytesOf(salt) as BufferSource,
                info: bytesOf(info) as BufferSource,
              },
              key,
              keylen * 8,
            ),
          )
      : Promise.resolve().then(() => hkdfSync(digest, ikm, salt, info, keylen));
  void settle(derived, callback);
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
// Node's defaults, by either of its names.
const scryptOptions = (keylen: number, options: ScryptOptions = {}) => ({
  N: options.N ?? options.cost ?? 16384,
  r: options.r ?? options.blockSize ?? 8,
  p: options.p ?? options.parallelization ?? 1,
  dkLen: keylen,
});
export const scryptSync = (password: Data, salt: Data, keylen: number, options?: ScryptOptions) =>
  Buffer.from(nobleScrypt(bytesOf(password), bytesOf(salt), scryptOptions(keylen, options)));
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
  const options = scryptOptions(keylen, rest[0] as ScryptOptions);
  void settle(
    scryptAsync(bytesOf(password), bytesOf(salt), options).then((bytes) => Buffer.from(bytes)),
    callback,
  );
}

// The ciphers, by Node's names: "aes-256-gcm" and the others. `update()` keeps what it is given, and `final()`
// gives all of it: what the two give together is Node's.
type Mode = "gcm" | "cbc" | "ctr" | "cfb" | "ecb";
type Cipher = { encrypt(bytes: Uint8Array): Uint8Array; decrypt(bytes: Uint8Array): Uint8Array };
const modes: Record<
  Mode,
  (key: Uint8Array, iv: Uint8Array, aad: Uint8Array | undefined, padding: boolean) => Cipher
> = {
  gcm: (key, iv, aad) => gcm(key, iv, aad),
  cbc: (key, iv, _aad, padding) => cbc(key, iv, { disablePadding: !padding }),
  ctr: (key, iv) => ctr(key, iv),
  cfb: (key, iv) => cfb(key, iv),
  ecb: (key, _iv, _aad, padding) => ecb(key, { disablePadding: !padding }),
};
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
  const keyBytes = bytesOf(key);
  if (keyBytes.length !== Number(aes[1]) / 8) {
    throw codeError(new RangeError("Invalid key length"), "ERR_CRYPTO_INVALID_KEYLEN");
  }
  const ivBytes = iv === null ? new Uint8Array(0) : bytesOf(iv);
  if (mode === "gcm" ? ivBytes.length === 0 : ivBytes.length !== (mode === "ecb" ? 0 : 16)) {
    throw codeError(new TypeError("Invalid initialization vector"), "ERR_CRYPTO_INVALID_IV");
  }
  return { mode, key: keyBytes, iv: ivBytes };
}

const authFailed = () => new Error("Unsupported state or unable to authenticate data");

class CipherBase extends Transform {
  #mode: Mode;
  #key: Uint8Array;
  #iv: Uint8Array;
  #decrypt: boolean;
  #tagLength: number;
  #chunks: Uint8Array[] = [];
  #aad: Uint8Array | undefined;
  #padding = true;
  #tag: Uint8Array | undefined;
  #done = false;
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
    this.#tagLength = options?.authTagLength ?? 16;
    if (mode === "gcm" && this.#tagLength !== 16) {
      throw new Error(
        `vitest-plugin-rsc: an authTagLength of ${this.#tagLength} is not there in the browser, only 16`,
      );
    }
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
    if (this.#done) throw codeError(new Error("Unsupported state"), "ERR_CRYPTO_INVALID_STATE");
    this.#chunks.push(Uint8Array.from(bytesOf(data, inputEncoding)));
    return output(new Uint8Array(0), outputEncoding);
  }
  final(): Buffer;
  final(outputEncoding: BufferEncoding): string;
  final(outputEncoding?: BufferEncoding): Buffer | string {
    if (this.#done) throw codeError(new Error("Unsupported state"), "ERR_CRYPTO_INVALID_STATE");
    this.#done = true;
    const input = Buffer.concat(this.#chunks);
    const cipher = modes[this.#mode](this.#key, this.#iv, this.#aad, this.#padding);
    if (this.#mode !== "gcm") {
      try {
        return output(
          this.#decrypt ? cipher.decrypt(input) : cipher.encrypt(input),
          outputEncoding,
        );
      } catch (error) {
        throw codeError(new Error((error as Error).message), "ERR_OSSL_BAD_DECRYPT");
      }
    }
    if (!this.#decrypt) {
      const sealed = cipher.encrypt(input);
      this.#tag = sealed.slice(sealed.length - 16);
      return output(sealed.subarray(0, sealed.length - 16), outputEncoding);
    }
    if (!this.#tag) throw authFailed();
    try {
      return output(cipher.decrypt(Buffer.concat([input, this.#tag])), outputEncoding);
    } catch {
      throw authFailed();
    }
  }
  setAAD(aad: Data): this {
    this.#aad = Uint8Array.from(bytesOf(aad));
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
    this.#tag = Uint8Array.from(bytesOf(tag));
    return this;
  }
  override _transform(chunk: Uint8Array, _encoding: string, callback: () => void): void {
    this.update(chunk);
    callback();
  }
  override _flush(callback: (error?: Error) => void): void {
    try {
      this.push(this.final());
      callback();
    } catch (error) {
      callback(error as Error);
    }
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
