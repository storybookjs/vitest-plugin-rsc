// The stand-ins of the speed feature `fastCrypto` (plugin.ts): password hashes
// and key derivations that cost microseconds, for a test that signs up or signs
// in a user and should not spend a tenth of a second, or a whole second in the
// JavaScript of a browser, on a hash that only an attacker would have to
// compute. Each keeps the contract of what it stands in for: the same API, the
// same shape, length and encoding of what it returns, the same result for the
// same password, salt and work factor, and a different one when any of them
// differs. A password that is wrong does not verify.
//
// What they compute is one SHA-256 over all the inputs, with the name of the
// algorithm, expanded to the length asked for: `derive()`. Not a password
// hash, and never one outside a test: an attacker would try a billion of
// these a second. The plugin gives them only to a test run of Vitest, and
// only when its config asks for them.
//
// The other side of that: a hash made by the real algorithm, like one in a
// fixture or a dump of a database, does not verify under a stand-in, nor the
// reverse. A stand-in that verifies a string, bcrypt's or Argon2's, marks the
// strings it makes, and throws for one it did not make, with what to do.
// A key derivation, `pbkdf2()` or `scrypt()`, returns bytes that the app
// compares itself: its stand-in cannot tell, and the comparison fails.
//
// Built to a file of its own, dist/fast-crypto/index.js, with @noble/hashes
// in it, which the modules that the plugin makes for a package import.

import { sha256 } from "@noble/hashes/sha2.js";

type Bytes = Uint8Array<ArrayBuffer>;
/** What the inputs of a derivation can be, as the APIs take them. */
type Input = string | number | boolean | ArrayBufferView | ArrayBuffer | null | undefined;

const encoder = new TextEncoder();

function bytesOf(input: Input): Uint8Array {
  if (typeof input === "string") return encoder.encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return encoder.encode(String(input));
}

const lengthOf = (count: number) => new Uint8Array(new Uint32Array([count]).buffer);

/**
 * `length` bytes of one SHA-256 over `algorithm` and every input, each with
 * its length before it, so that no two lists of inputs run together the
 * same. Longer than 32 bytes by SHA-256 of that digest and a counter.
 */
export function derive(algorithm: string, inputs: Input[], length: number): Bytes {
  const hash = sha256.create().update(encoder.encode(algorithm));
  for (const input of inputs) {
    const bytes = bytesOf(input);
    hash.update(lengthOf(bytes.length)).update(bytes);
  }
  const seed = hash.digest();
  const output = new Uint8Array(length);
  for (let block = 0; block * 32 < length; block++) {
    const next = sha256.create().update(seed).update(lengthOf(block)).digest();
    output.set(next.subarray(0, length - block * 32), block * 32);
  }
  return output;
}

/** The error of a hash that the stand-in did not make. */
export function notMadeHere(api: string, hash: string): Error {
  return new Error(
    `vitest-plugin-rsc: the speed feature \`fastCrypto\` stands in for ${api}, which got a hash it did not make: ` +
      `${JSON.stringify(hash.slice(0, 32))}... A hash made by the real algorithm, like one of a ` +
      `fixture, does not verify under the stand-in. Make the hash in the test, with the app's ` +
      `own function, or set \`fastCrypto: false\` in \`vitestPluginNext()\`.`,
  );
}

// After the code that called, as Node.js and the packages call back. A
// microtask, not a timer: a browser makes a timer that a timer set wait 4 ms
// from the fifth on, which a hash in a promise of a callback of another is.
const callLater = (call: () => void) => queueMicrotask(call);

// --- bcrypt: bcryptjs and bcrypt, and @node-rs/bcrypt -----------------------

// bcrypt's own base64, which its strings are in.
const bcryptAlphabet = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function bcryptBase64(bytes: ArrayLike<number>, length = bytes.length): string {
  let text = "";
  for (let at = 0; at < length; at += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[at], bytes[at + 1], bytes[at + 2]];
    text += bcryptAlphabet[a >> 2]! + bcryptAlphabet[((a & 3) << 4) | (b >> 4)]!;
    if (at + 1 < length) text += bcryptAlphabet[((b & 15) << 2) | (c >> 6)]!;
    if (at + 2 < length) text += bcryptAlphabet[c & 63]!;
  }
  return text;
}

function bcryptBytes(text: string, length: number): number[] {
  const values = text.split("").map((char) => bcryptAlphabet.indexOf(char));
  const bytes: number[] = [];
  for (let at = 0; at + 1 < values.length && bytes.length < length; at += 4) {
    const [a, b, c = 0, d = 0] = values.slice(at, at + 4) as number[];
    bytes.push(((a! << 2) | (b! >> 4)) & 255);
    if (at + 2 < values.length) bytes.push(((b! << 4) | (c >> 2)) & 255);
    if (at + 3 < values.length) bytes.push(((c << 6) | d) & 255);
  }
  return bytes.slice(0, length);
}

// A bcrypt string is its salt, `$2b$10$` and 22 characters, and then 31 of
// the hash. The stand-in's hash starts with this mark, which a real one
// does once in 64 ** 8: 23 characters of SHA-256 are left.
const bcryptMark = "fastHash";
const bcryptSalt = /^\$2[abxy]\$(\d\d)\$[./A-Za-z0-9]{22}$/;

function bcryptSaltOf(rounds = 10, minor = "b"): string {
  const cost = Math.min(31, Math.max(4, rounds));
  const random = crypto.getRandomValues(new Uint8Array(16));
  return `$2${minor}$${String(cost).padStart(2, "0")}$${bcryptBase64(random)}`;
}

function bcryptHash(password: string, salt: string): string {
  if (!bcryptSalt.test(salt)) throw new Error(`Invalid salt: ${salt}`);
  // bcrypt hashes the first 72 bytes of the password, and the stand-in too:
  // two passwords that start alike for those are the same.
  const bytes = encoder.encode(password).subarray(0, 72);
  const digest = derive("bcrypt", [bytes, salt], 18);
  return salt + bcryptMark + bcryptBase64(digest).slice(0, 31 - bcryptMark.length);
}

function bcryptVerify(api: string, password: string, hash: string): boolean {
  if (hash.length !== 60) return false;
  if (hash.slice(29, 29 + bcryptMark.length) !== bcryptMark) throw notMadeHere(api, hash);
  return bcryptHash(password, hash.slice(0, 29)) === hash;
}

type Callback<T> = (error: Error | null, result?: T) => void;

// bcryptjs's API, and the API of bcrypt, the native package, which is the
// same but for the `minor` of `genSalt`: a promise, or a callback as the
// last argument and nothing returned, which the type leaves out, as the
// call of a test or of the app takes the promise.
function withCallback<T>(callback: unknown, work: () => T): Promise<T> {
  if (typeof callback !== "function") {
    return new Promise((resolve, reject) =>
      callLater(() => {
        try {
          resolve(work());
        } catch (error) {
          reject(error);
        }
      }),
    );
  }
  callLater(() => {
    let result: T;
    try {
      result = work();
    } catch (error) {
      (callback as Callback<T>)(error as Error);
      return;
    }
    (callback as Callback<T>)(null, result);
  });
  return undefined as unknown as Promise<T>;
}

const roundsOrSalt = (salt: unknown): string =>
  typeof salt === "number"
    ? bcryptSaltOf(salt)
    : salt === undefined
      ? bcryptSaltOf()
      : String(salt);
const lastFunction = (args: unknown[]) => args.findLast((arg) => typeof arg === "function");

/** bcryptjs, and bcrypt, the native package, which has the same API. */
export function bcrypt(api = "bcryptjs") {
  const genSaltSync = (rounds?: number, minor?: unknown) =>
    bcryptSaltOf(rounds, typeof minor === "string" ? minor : "b");
  const hashSync = (password: string, salt?: number | string) => {
    if (typeof password !== "string") throw new Error(`Illegal arguments: ${typeof password}`);
    return bcryptHash(password, roundsOrSalt(salt));
  };
  const compareSync = (password: string, hash: string) => {
    if (typeof password !== "string" || typeof hash !== "string") {
      throw new Error(`Illegal arguments: ${typeof password}, ${typeof hash}`);
    }
    return bcryptVerify(`${api}.compare()`, password, hash);
  };
  return {
    genSaltSync,
    genSalt: (...args: unknown[]) =>
      withCallback(lastFunction(args), () =>
        genSaltSync(typeof args[0] === "number" ? args[0] : undefined, args[1]),
      ),
    hashSync,
    hash: (password: string, salt?: number | string, callback?: Callback<string>) =>
      withCallback(callback, () => hashSync(password, salt)),
    compareSync,
    compare: (password: string, hash: string, callback?: Callback<boolean>) =>
      withCallback(callback, () => compareSync(password, hash)),
    getRounds: (hash: string) => parseInt(hash.split("$")[2]!, 10),
    getSalt: (hash: string) => {
      if (hash.length !== 60) throw new Error(`Illegal hash length: ${hash.length} != 60`);
      return hash.slice(0, 29);
    },
    truncates: (password: string) => encoder.encode(password).length > 72,
    encodeBase64: (bytes: ArrayLike<number>, length: number) => bcryptBase64(bytes, length),
    decodeBase64: (text: string, length: number) => bcryptBytes(text, length),
    setRandomFallback: () => {},
  };
}

/** @node-rs/bcrypt: `verify()` for `compare()`, and promises only. */
export function nodeRsBcrypt() {
  const api = "@node-rs/bcrypt's verify()";
  const genSaltSync = (rounds = 12, version = "2b") =>
    bcryptSaltOf(rounds, version.replace(/^2/, ""));
  const hashSync = (password: string | Uint8Array, cost = 12, salt?: Uint8Array) => {
    const text = typeof password === "string" ? password : new TextDecoder().decode(password);
    const saltText = salt
      ? `$2b$${String(cost).padStart(2, "0")}$${bcryptBase64(salt, 16)}`
      : bcryptSaltOf(cost);
    return bcryptHash(text, saltText);
  };
  const verifySync = (password: string | Uint8Array, hash: string) =>
    bcryptVerify(
      api,
      typeof password === "string" ? password : new TextDecoder().decode(password),
      hash,
    );
  const later = <T>(work: () => T) => withCallback(undefined, work);
  return {
    DEFAULT_COST: 12,
    genSaltSync,
    genSalt: (rounds?: number, version?: string) => later(() => genSaltSync(rounds, version)),
    hashSync,
    hash: (password: string | Uint8Array, cost?: number, salt?: Uint8Array) =>
      later(() => hashSync(password, cost, salt)),
    verifySync,
    verify: (password: string | Uint8Array, hash: string) =>
      later(() => verifySync(password, hash)),
    compareSync: verifySync,
    compare: (password: string | Uint8Array, hash: string) =>
      later(() => verifySync(password, hash)),
  };
}

// --- Argon2: argon2 and @node-rs/argon2, in the PHC string format -------------

const argon2Types = ["argon2d", "argon2i", "argon2id"] as const;
// The stand-in's hash starts with these bytes, "fastHash" in base64.
const argon2Mark = Uint8Array.from(atob("fastHash"), (char) => char.charCodeAt(0));

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

type Argon2Params = {
  type: number;
  version: number;
  memory: number;
  passes: number;
  parallelism: number;
  length: number;
  secret?: Input;
  associatedData?: Input;
};

function argon2Raw(password: Input, salt: Input, params: Argon2Params): Bytes {
  const { type, version, memory, passes, parallelism, length, secret, associatedData } = params;
  const digest = derive(
    argon2Types[type] ?? "argon2",
    [password, salt, version, memory, passes, parallelism, secret, associatedData],
    length,
  );
  // The mark, where the hash is long enough to keep 16 bytes of the digest.
  if (length >= argon2Mark.length + 16) digest.set(argon2Mark);
  return digest;
}

function argon2Encoded(salt: Uint8Array, hash: Uint8Array, params: Argon2Params): string {
  const { type, version, memory, passes, parallelism } = params;
  return (
    `$${argon2Types[type]}$v=${version}$m=${memory},t=${passes},p=${parallelism}` +
    `$${base64(salt)}$${base64(hash)}`
  );
}

const phc =
  /^\$(argon2(?:d|i|id))\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function argon2Verify(api: string, encoded: string, password: Input, secret?: Input): boolean {
  const match = phc.exec(encoded);
  if (!match) throw new Error(`Invalid hash: ${encoded}`);
  const [, name, version, memory, passes, parallelism, salt, hash] = match;
  const expected = fromBase64(hash!);
  if (expected.length < argon2Mark.length + 16) return false;
  if (!argon2Mark.every((byte, at) => expected[at] === byte)) throw notMadeHere(api, encoded);
  const params: Argon2Params = {
    type: argon2Types.indexOf(name as (typeof argon2Types)[number]),
    version: Number(version),
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    length: expected.length,
    secret,
  };
  return base64(argon2Raw(password, fromBase64(salt!), params)) === hash;
}

type Argon2Options = {
  type?: number;
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
  hashLength?: number;
  salt?: Uint8Array;
  secret?: Uint8Array;
  associatedData?: Uint8Array;
  version?: number;
  raw?: boolean;
};

/** argon2, the native package: Argon2id at OWASP's minimum by default. */
export function argon2() {
  const paramsOf = (options: Argon2Options = {}): Argon2Params => ({
    type: options.type ?? 2,
    version: options.version ?? 0x13,
    memory: options.memoryCost ?? 65536,
    passes: options.timeCost ?? 3,
    parallelism: options.parallelism ?? 4,
    length: options.hashLength ?? 32,
    secret: options.secret,
    associatedData: options.associatedData,
  });
  return {
    argon2d: 0,
    argon2i: 1,
    argon2id: 2,
    hash: async (password: string | Uint8Array, options: Argon2Options = {}) => {
      const params = paramsOf(options);
      const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
      const hash = argon2Raw(password, salt, params);
      return options.raw ? hash : argon2Encoded(salt, hash, params);
    },
    verify: async (digest: string, password: string | Uint8Array, options: Argon2Options = {}) =>
      argon2Verify("argon2's verify()", digest, password, options.secret),
    needsRehash: (digest: string, options: Argon2Options = {}) => {
      const match = phc.exec(digest);
      const params = paramsOf(options);
      return (
        !match ||
        Number(match[2]) !== params.version ||
        Number(match[3]) !== params.memory ||
        Number(match[4]) !== params.passes
      );
    },
  };
}

type NodeRsArgon2Options = {
  memoryCost?: number;
  timeCost?: number;
  outputLen?: number;
  parallelism?: number;
  algorithm?: number;
  version?: number;
  secret?: Uint8Array;
  salt?: Uint8Array;
};

/** @node-rs/argon2: Argon2id with 19 MiB, 2 passes and 1 lane by default. */
export function nodeRsArgon2() {
  const paramsOf = (options: NodeRsArgon2Options = {}): Argon2Params => ({
    type: options.algorithm ?? 2,
    version: options.version === 0 ? 0x10 : 0x13,
    memory: options.memoryCost ?? 19456,
    passes: options.timeCost ?? 2,
    parallelism: options.parallelism ?? 1,
    length: options.outputLen ?? 32,
    secret: options.secret,
  });
  const hashRawSync = (password: string | Uint8Array, options?: NodeRsArgon2Options) =>
    argon2Raw(
      password,
      options?.salt ?? crypto.getRandomValues(new Uint8Array(16)),
      paramsOf(options),
    );
  const hashSync = (password: string | Uint8Array, options?: NodeRsArgon2Options) => {
    const params = paramsOf(options);
    const salt = options?.salt ?? crypto.getRandomValues(new Uint8Array(16));
    return argon2Encoded(salt, argon2Raw(password, salt, params), params);
  };
  const verifySync = (
    hashed: string,
    password: string | Uint8Array,
    options?: NodeRsArgon2Options,
  ) => argon2Verify("@node-rs/argon2's verify()", hashed, password, options?.secret);
  return {
    Algorithm: { Argon2d: 0, Argon2i: 1, Argon2id: 2, 0: "Argon2d", 1: "Argon2i", 2: "Argon2id" },
    Version: { V0x10: 0, V0x13: 1, 0: "V0x10", 1: "V0x13" },
    hashSync,
    hash: async (password: string | Uint8Array, options?: NodeRsArgon2Options) =>
      hashSync(password, options),
    hashRawSync,
    hashRaw: async (password: string | Uint8Array, options?: NodeRsArgon2Options) =>
      hashRawSync(password, options),
    verifySync,
    verify: async (hashed: string, password: string | Uint8Array, options?: NodeRsArgon2Options) =>
      verifySync(hashed, password, options),
  };
}

// --- @noble/hashes: scrypt, pbkdf2 and argon2 ---------------------------------

type NobleHash = { outputLen: number; blockLen: number };

const positive = (name: string, value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`"${name}" expected integer >= 1, got ${String(value)}`);
  }
  return value as number;
};

/** @noble/hashes/scrypt.js, which Better Auth hashes its passwords with. */
export function nobleScrypt() {
  const scrypt = (
    password: Input,
    salt: Input,
    opts: { N: number; r: number; p: number; dkLen?: number },
  ) => {
    const N = positive("N", opts.N);
    if (N < 2 || (N & (N - 1)) !== 0) throw new Error('"N" expected a power of 2, and 2 or more');
    const params = [N, positive("r", opts.r), positive("p", opts.p)];
    return derive("scrypt", [password, salt, ...params], positive("dkLen", opts.dkLen ?? 32));
  };
  return {
    scrypt,
    scryptAsync: async (...args: Parameters<typeof scrypt>) => scrypt(...args),
  };
}

export function noblePbkdf2() {
  const pbkdf2 = (
    hash: NobleHash,
    password: Input,
    salt: Input,
    opts: { c: number; dkLen?: number },
  ) =>
    derive(
      "pbkdf2",
      [password, salt, positive("c", opts.c), hash.outputLen, hash.blockLen],
      positive("dkLen", opts.dkLen ?? hash.outputLen),
    );
  return {
    pbkdf2,
    pbkdf2Async: async (...args: Parameters<typeof pbkdf2>) => pbkdf2(...args),
  };
}

export function nobleArgon2() {
  type Opts = {
    t: number;
    m: number;
    p: number;
    dkLen?: number;
    version?: number;
    key?: Input;
    personalization?: Input;
  };
  const of = (type: number) => (password: Input, salt: Input, opts: Opts) =>
    argon2Raw(password, salt, {
      type,
      version: opts.version ?? 0x13,
      memory: positive("m", opts.m),
      passes: positive("t", opts.t),
      parallelism: positive("p", opts.p),
      length: positive("dkLen", opts.dkLen ?? 32),
      secret: opts.key,
      associatedData: opts.personalization,
    });
  const later =
    (call: ReturnType<typeof of>) =>
    async (...args: Parameters<typeof call>) =>
      call(...args);
  const [argon2d, argon2i, argon2id] = [of(0), of(1), of(2)];
  return {
    argon2d,
    argon2i,
    argon2id,
    argon2dAsync: later(argon2d),
    argon2iAsync: later(argon2i),
    argon2idAsync: later(argon2id),
  };
}

// --- node:crypto: pbkdf2, scrypt and argon2 ---------------------------------

const codeError = <E extends Error>(error: E, code: string): E => Object.assign(error, { code });
const nodeInteger = (name: string, value: unknown, min: number, max = 2 ** 31 - 1) => {
  if (typeof value !== "number") {
    throw codeError(
      new TypeError(`The "${name}" argument must be of type number. Received ${typeof value}`),
      "ERR_INVALID_ARG_TYPE",
    );
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    throw codeError(
      new RangeError(
        `The value of "${name}" is out of range. It must be >= ${min} && <= ${max}. Received ${value}`,
      ),
      "ERR_OUT_OF_RANGE",
    );
  }
  return value;
};
const nodeCallback = <T>(callback: unknown): Callback<T> => {
  if (typeof callback !== "function") {
    throw codeError(
      new TypeError('The "callback" argument must be of type function'),
      "ERR_INVALID_ARG_TYPE",
    );
  }
  return callback as Callback<T>;
};
// What Node's `pbkdf2()` takes for a digest: the names of OpenSSL's hashes
// that are no XOF, in lower case, as Node.js 24 lists them.
const nodeDigests = new Set(
  `
  rsa-md5 rsa-ripemd160 rsa-sha1 rsa-sha1-2 rsa-sha224 rsa-sha256 rsa-sha3-224 rsa-sha3-256
  rsa-sha3-384 rsa-sha3-512 rsa-sha384 rsa-sha512 rsa-sha512/224 rsa-sha512/256 rsa-sm3
  blake2b-512 blake2b512 blake2s-256 blake2s256 id-rsassa-pkcs1-v1_5-with-sha3-224
  id-rsassa-pkcs1-v1_5-with-sha3-256 id-rsassa-pkcs1-v1_5-with-sha3-384
  id-rsassa-pkcs1-v1_5-with-sha3-512 keccak-224 keccak-256 keccak-384 keccak-512 md5 md5-sha1
  md5withrsaencryption ripemd ripemd-160 ripemd160 ripemd160withrsa rmd160 sha-1 sha-224 sha-256
  sha-256/192 sha-384 sha-512 sha-512/224 sha-512/256 sha1 sha1withrsaencryption sha2-224
  sha2-256 sha2-256/192 sha2-384 sha2-512 sha2-512/224 sha2-512/256 sha224
  sha224withrsaencryption sha256 sha256-192 sha256withrsaencryption sha3-224 sha3-256 sha3-384
  sha3-512 sha384 sha384withrsaencryption sha512 sha512-224 sha512-224withrsaencryption
  sha512-256 sha512-256withrsaencryption sha512withrsaencryption sm3 sm3withrsaencryption
  ssl3-md5 ssl3-sha1
`
    .trim()
    .split(/\s+/),
);

type ScryptOptions = {
  N?: number;
  cost?: number;
  r?: number;
  blockSize?: number;
  p?: number;
  parallelization?: number;
  maxmem?: number;
};

/**
 * `pbkdf2`, `scrypt` and `argon2` of `node:crypto`, sync and with a
 * callback, each a `Buffer` as Node's: `Buffer` is the layer's.
 */
export function nodeCrypto(Buffer: { from(bytes: ArrayBuffer): Uint8Array }) {
  const buffer = (bytes: Bytes) => Buffer.from(bytes.buffer);

  const pbkdf2Sync = (
    password: Input,
    salt: Input,
    iterations: number,
    keylen: number,
    digest: string,
  ) => {
    nodeInteger("iterations", iterations, 1);
    nodeInteger("keylen", keylen, 0);
    if (typeof digest !== "string") {
      throw codeError(
        new TypeError(`The "digest" argument must be of type string. Received ${typeof digest}`),
        "ERR_INVALID_ARG_TYPE",
      );
    }
    if (!nodeDigests.has(digest.toLowerCase())) {
      throw codeError(new TypeError(`Invalid digest: ${digest}`), "ERR_CRYPTO_INVALID_DIGEST");
    }
    // OpenSSL derives no key of no bytes, and Node.js says so.
    if (keylen === 0) throw new Error("Deriving bits failed");
    return buffer(derive("pbkdf2", [password, salt, iterations, digest.toLowerCase()], keylen));
  };

  const scryptSync = (
    password: Input,
    salt: Input,
    keylen: number,
    options: ScryptOptions = {},
  ) => {
    nodeInteger("keylen", keylen, 0);
    const N = options.N ?? options.cost ?? 16384;
    const r = options.r ?? options.blockSize ?? 8;
    const p = options.p ?? options.parallelization ?? 1;
    const maxmem = options.maxmem ?? 32 * 1024 * 1024;
    // What OpenSSL checks, and Node.js before it: N a power of two, and the
    // memory of the real scrypt within `maxmem`. The stand-in throws where
    // Node.js would, so that a test does not pass with options that fail on
    // a server.
    if (N < 2 || (N & (N - 1)) !== 0 || r < 1 || p < 1 || 128 * r * (N + 2 + p) > maxmem) {
      throw codeError(
        new RangeError("Invalid scrypt params: memory limit exceeded or invalid parameters"),
        "ERR_CRYPTO_INVALID_SCRYPT_PARAMS",
      );
    }
    return buffer(derive("scrypt", [password, salt, N, r, p], keylen));
  };

  type Argon2Parameters = {
    message: Input;
    nonce: Input;
    parallelism: number;
    tagLength: number;
    memory: number;
    passes: number;
    secret?: Input;
    associatedData?: Input;
  };
  const argon2Sync = (algorithm: string, parameters: Argon2Parameters) => {
    const type = argon2Types.indexOf(algorithm as (typeof argon2Types)[number]);
    if (type < 0) {
      throw codeError(
        new TypeError(
          `The argument 'algorithm' must be one of: 'argon2d', 'argon2i', 'argon2id'. Received '${algorithm}'`,
        ),
        "ERR_INVALID_ARG_VALUE",
      );
    }
    const { message, nonce, parallelism, tagLength, memory, passes } = parameters;
    if (bytesOf(nonce).length < 8) {
      throw codeError(
        new RangeError('The "parameters.nonce.byteLength" is out of range. It must be >= 8.'),
        "ERR_OUT_OF_RANGE",
      );
    }
    nodeInteger("parameters.parallelism", parallelism, 1, 2 ** 24 - 1);
    nodeInteger("parameters.tagLength", tagLength, 4);
    nodeInteger("parameters.memory", memory, 8 * parallelism);
    nodeInteger("parameters.passes", passes, 1);
    // No mark: Node.js returns the bytes, and the app compares them.
    return buffer(
      derive(
        algorithm,
        [
          message,
          nonce,
          0x13,
          memory,
          passes,
          parallelism,
          parameters.secret,
          parameters.associatedData,
        ],
        tagLength,
      ),
    );
  };

  return {
    pbkdf2Sync,
    pbkdf2(...args: unknown[]) {
      const callback = nodeCallback<Uint8Array>(args[5]);
      const key = pbkdf2Sync(...(args.slice(0, 5) as Parameters<typeof pbkdf2Sync>));
      callLater(() => callback(null, key));
    },
    scryptSync,
    scrypt(...args: unknown[]) {
      const callback = nodeCallback<Uint8Array>(args.pop());
      const key = scryptSync(...(args as Parameters<typeof scryptSync>));
      callLater(() => callback(null, key));
    },
    argon2Sync,
    argon2(algorithm: string, parameters: Argon2Parameters, callback: unknown) {
      const done = nodeCallback<Uint8Array>(callback);
      const key = argon2Sync(algorithm, parameters);
      callLater(() => done(null, key));
    },
  };
}

// --- Web Crypto: PBKDF2 of `crypto.subtle` -----------------------------------

const installed = new WeakSet<SubtleCrypto>();

const nameOf = (algorithm: AlgorithmIdentifier | { name: string }) =>
  (typeof algorithm === "string" ? algorithm : algorithm.name).toUpperCase();

// The bits of a key that `deriveKey()` makes, which its algorithm says, as
// Web Crypto has them: AES's `length`, an HMAC's or the block of its hash.
function keyBits(
  type: AlgorithmIdentifier | { name: string; length?: number; hash?: AlgorithmIdentifier },
) {
  if (typeof type === "string") return undefined;
  const name = nameOf(type);
  if (name.startsWith("AES-")) return "length" in type ? type.length : undefined;
  if (name !== "HMAC") return undefined;
  if ("length" in type && type.length) return type.length;
  const hash = "hash" in type && type.hash ? nameOf(type.hash) : "";
  return { "SHA-1": 512, "SHA-256": 512, "SHA-384": 1024, "SHA-512": 1024 }[hash];
}

/**
 * Makes PBKDF2 of `subtle` a stand-in: `deriveBits()` and `deriveKey()` of a
 * key that `importKey()` imported for it, whose bytes it keeps for that. The
 * page's own `crypto.subtle` by default, which the app and the tests share.
 * Any other algorithm, and a call that Web Crypto would reject, are the
 * browser's own.
 */
export function installWebCrypto(subtle: SubtleCrypto = globalThis.crypto.subtle): void {
  if (installed.has(subtle)) return;
  installed.add(subtle);
  const original = {
    importKey: subtle.importKey,
    deriveBits: subtle.deriveBits,
    deriveKey: subtle.deriveKey,
  };
  const passwords = new WeakMap<CryptoKey, Uint8Array>();

  function pbkdf2Of(
    params: unknown,
    key: CryptoKey,
    bits: number | null | undefined,
    usage: KeyUsage,
  ) {
    if (typeof params !== "object" || !params || nameOf(params as { name: string }) !== "PBKDF2")
      return;
    const password = passwords.get(key);
    const { salt, iterations, hash } = params as Pbkdf2Params;
    if (!password || !key.usages.includes(usage) || !bits || bits % 8 !== 0) return;
    if (!Number.isInteger(iterations) || iterations < 1 || !salt) return;
    return derive("PBKDF2", [password, salt as Input, iterations, nameOf(hash)], bits / 8);
  }

  Object.assign(subtle, {
    async importKey(this: SubtleCrypto, ...args: Parameters<SubtleCrypto["importKey"]>) {
      const key = await (original.importKey as (...a: unknown[]) => Promise<CryptoKey>).apply(
        this,
        args,
      );
      const [format, data, algorithm] = args;
      // A copy: the app may fill its buffer again.
      if (format === "raw" && nameOf(algorithm) === "PBKDF2") {
        passwords.set(key, bytesOf(data as BufferSource).slice());
      }
      return key;
    },
    async deriveBits(
      this: SubtleCrypto,
      algorithm: AlgorithmIdentifier,
      baseKey: CryptoKey,
      length?: number | null,
    ) {
      const bits = pbkdf2Of(algorithm, baseKey, length, "deriveBits");
      if (bits) return bits.buffer;
      return original.deriveBits.call(this, algorithm, baseKey, length as number);
    },
    async deriveKey(
      this: SubtleCrypto,
      algorithm: AlgorithmIdentifier,
      baseKey: CryptoKey,
      derivedKeyType: AlgorithmIdentifier,
      extractable: boolean,
      keyUsages: KeyUsage[],
    ) {
      const bits = pbkdf2Of(algorithm, baseKey, keyBits(derivedKeyType), "deriveKey");
      if (bits) {
        return original.importKey.call(this, "raw", bits, derivedKeyType, extractable, keyUsages);
      }
      return original.deriveKey.call(
        this,
        algorithm,
        baseKey,
        derivedKeyType,
        extractable,
        keyUsages,
      );
    },
  });
}
