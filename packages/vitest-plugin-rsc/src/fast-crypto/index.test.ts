// The stand-ins of the speed feature `fastCrypto`: each keeps the contract of
// what it stands in for, which Node's own `crypto` is here to compare with, and
// costs microseconds where the real one costs a tenth of a second or more.

import nodeCrypto from "node:crypto";
import { sha1 } from "@noble/hashes/legacy.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { expect, test } from "vitest";
import {
  argon2,
  bcrypt,
  derive,
  installWebCrypto,
  nobleArgon2,
  noblePbkdf2,
  nobleScrypt,
  nodeCrypto as fastNodeCrypto,
  nodeRsArgon2,
  nodeRsBcrypt,
} from "./index.ts";

const fast = fastNodeCrypto(Buffer);
const password = "correct horse battery staple";

/** The time of a call, in milliseconds. */
async function timed(call: () => unknown): Promise<number> {
  const start = performance.now();
  await call();
  return performance.now() - start;
}

// Whether a call throws: what Node.js throws for a digest that is an XOF is
// OpenSSL's error, without a code of Node's.
const outcome = (call: () => unknown) => {
  try {
    call();
    return "returns";
  } catch {
    return "throws";
  }
};

test("derive() is the same for the same inputs, and differs when any differs", () => {
  const key = derive("x", ["a", "b", 1], 32);
  expect(derive("x", ["a", "b", 1], 32)).toEqual(key);
  for (const other of [
    derive("y", ["a", "b", 1], 32),
    derive("x", ["ab", "", 1], 32),
    derive("x", ["a", "b", 2], 32),
    derive("x", ["a", "b"], 32),
  ]) {
    expect(other).not.toEqual(key);
  }
  expect(derive("x", ["a"], 100)).toHaveLength(100);
  expect(derive("x", ["a"], 100).subarray(0, 32)).toEqual(derive("x", ["a"], 32));
  expect(derive("x", ["a"], 0)).toHaveLength(0);
});

test("node:crypto's pbkdf2 and scrypt return what Node's do, a Buffer of the length asked for", async () => {
  const salt = nodeCrypto.randomBytes(16);
  for (const keylen of [1, 16, 32, 64, 100]) {
    const real = nodeCrypto.pbkdf2Sync(password, salt, 1000, keylen, "sha256");
    const ours = fast.pbkdf2Sync(password, salt, 1000, keylen, "sha256");
    expect(Buffer.isBuffer(ours)).toBe(true);
    expect(ours.length).toBe(real.length);
    expect(fast.scryptSync(password, salt, keylen).length).toBe(keylen);
  }
  const key = fast.pbkdf2Sync(password, salt, 600_000, 32, "sha256");
  expect(fast.pbkdf2Sync(password, Buffer.from(salt), 600_000, 32, "SHA256")).toEqual(key);
  expect(fast.pbkdf2Sync("wrong", salt, 600_000, 32, "sha256")).not.toEqual(key);
  expect(fast.pbkdf2Sync(password, salt, 599_999, 32, "sha256")).not.toEqual(key);
  expect(fast.pbkdf2Sync(password, salt, 600_000, 32, "sha512")).not.toEqual(key);
  expect(fast.pbkdf2Sync(password, "other salt", 600_000, 32, "sha256")).not.toEqual(key);

  const scrypted = await new Promise((resolve, reject) =>
    fast.scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 2 ** 26 },
      (error: Error | null, key?: Uint8Array) => (error ? reject(error) : resolve(key)),
    ),
  );
  expect(scrypted).toEqual(
    fast.scryptSync(password, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 2 ** 26 }),
  );
  expect(fast.scryptSync(password, salt, 64, { N: 1024 })).not.toEqual(
    fast.scryptSync(password, salt, 64, { N: 2048 }),
  );
});

test("node:crypto's pbkdf2 and scrypt throw where Node's do", () => {
  const calls: [string, (lib: typeof nodeCrypto) => unknown][] = [
    ["an unknown digest", (lib) => lib.pbkdf2Sync(password, "salt", 1, 32, "sha257")],
    ["no iterations", (lib) => lib.pbkdf2Sync(password, "salt", 0, 32, "sha256")],
    ["a negative length", (lib) => lib.pbkdf2Sync(password, "salt", 1, -1, "sha256")],
    ["no length", (lib) => lib.pbkdf2Sync(password, "salt", 1, 0, "sha256")],
    ...["SHA256", "RSA-SHA256", "sha-256", "sha512-256", "blake2b512", "shake256", "sha3-512"].map(
      (digest): [string, (lib: typeof nodeCrypto) => unknown] => [
        `the digest ${digest}`,
        (lib) => lib.pbkdf2Sync(password, "salt", 1, 32, digest),
      ],
    ),
    ["a scrypt key of no bytes", (lib) => lib.scryptSync(password, "salt", 0)],
    [
      "pbkdf2 without a callback",
      (lib) => (lib.pbkdf2 as (...args: unknown[]) => void)(password, "salt", 1, 32, "sha256"),
    ],
    ["an N that is no power of two", (lib) => lib.scryptSync(password, "salt", 32, { N: 1000 })],
    // 128 * r * N is 32 MiB, Node's `maxmem` by default: over it.
    ["more memory than maxmem", (lib) => lib.scryptSync(password, "salt", 64, { N: 16384, r: 16 })],
    ["N and r of 16 MiB", (lib) => lib.scryptSync(password, "salt", 64, { N: 16384, r: 8 })],
    [
      "a maxmem that allows it",
      (lib) => lib.scryptSync(password, "salt", 64, { N: 16384, r: 16, maxmem: 2 ** 26 }),
    ],
  ];
  for (const [name, call] of calls) {
    expect(
      outcome(() => call(fast as unknown as typeof nodeCrypto)),
      name,
    ).toBe(outcome(() => call(nodeCrypto)));
  }
});

test("node:crypto's argon2 returns a Buffer of `tagLength`, and checks the nonce", () => {
  const parameters = {
    message: password,
    nonce: nodeCrypto.randomBytes(16),
    parallelism: 1,
    tagLength: 32,
    memory: 19456,
    passes: 2,
  };
  const key = fast.argon2Sync("argon2id", parameters);
  expect(key).toHaveLength(32);
  expect(fast.argon2Sync("argon2id", parameters)).toEqual(key);
  expect(fast.argon2Sync("argon2i", parameters)).not.toEqual(key);
  expect(fast.argon2Sync("argon2id", { ...parameters, passes: 3 })).not.toEqual(key);
  expect(outcome(() => fast.argon2Sync("argon2id", { ...parameters, nonce: "short" }))).toBe(
    outcome(() => nodeCrypto.argon2Sync("argon2id", { ...parameters, nonce: "short" })),
  );
});

test("bcrypt: a string of bcrypt's format that only its password verifies", async () => {
  const lib = bcrypt();
  const hash = await lib.hash(password, 12);
  expect(hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  expect(lib.getRounds(hash)).toBe(12);
  expect(lib.getSalt(hash)).toBe(hash.slice(0, 29));
  expect(await lib.compare(password, hash)).toBe(true);
  expect(await lib.compare("wrong", hash)).toBe(false);
  expect(lib.compareSync(password, lib.hashSync(password, lib.genSaltSync(4)))).toBe(true);
  // Another salt, another hash.
  expect(lib.hashSync(password, 12)).not.toBe(hash);
  expect(lib.hashSync(password, hash.slice(0, 29))).toBe(hash);
  // As bcrypt: the first 72 bytes of a password.
  const long = "x".repeat(72);
  expect(lib.compareSync(`${long}y`, lib.hashSync(`${long}z`, 4))).toBe(true);
  expect(lib.truncates(`${long}y`)).toBe(true);
  // A callback, as bcryptjs and bcrypt take.
  const called = await new Promise((resolve) =>
    lib.compare(password, hash, (error, same) => resolve([error, same])),
  );
  expect(called).toEqual([null, true]);
  expect(await lib.compare(password, "not a hash")).toBe(false);
});

test("bcrypt: a hash of the real bcrypt throws, and says why", () => {
  // bcrypt's own example: the hash of "password" at cost 10.
  const real = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  expect(() => bcrypt().compareSync("password", real)).toThrow(/did not make.*fixture/);
  expect(() => nodeRsBcrypt().verifySync("password", real)).toThrow(/@node-rs\/bcrypt/);
});

test("@node-rs/bcrypt: hash and verify", async () => {
  const lib = nodeRsBcrypt();
  const hash = await lib.hash(password);
  expect(hash).toMatch(/^\$2b\$12\$[./A-Za-z0-9]{53}$/);
  expect(await lib.verify(password, hash)).toBe(true);
  expect(lib.verifySync("wrong", hash)).toBe(false);
});

test("argon2 and @node-rs/argon2: a PHC string that only its password verifies", async () => {
  for (const [lib, params] of [
    [argon2(), "m=65536,t=3,p=4"],
    [nodeRsArgon2(), "m=19456,t=2,p=1"],
  ] as const) {
    const hash = String(await lib.hash(password));
    expect(hash).toMatch(
      new RegExp(`^\\$argon2id\\$v=19\\$${params}\\$[A-Za-z0-9+/]{22}\\$[A-Za-z0-9+/]{43}$`),
    );
    expect(await lib.verify(hash, password)).toBe(true);
    expect(await lib.verify(hash, "wrong")).toBe(false);
    expect(await lib.hash(password)).not.toBe(hash);
  }
  // The reference implementation's example, of "password" and "somesalt".
  const real = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG";
  await expect(argon2().verify(real, "password")).rejects.toThrow(/did not make/);
});

test("@noble/hashes's scrypt with Better Auth's parameters", async () => {
  const { scrypt, scryptAsync } = nobleScrypt();
  const options = { N: 16384, r: 16, p: 1, dkLen: 64 };
  const key = scrypt(password, "salt", options);
  expect(key).toHaveLength(64);
  expect(await scryptAsync(password, "salt", options)).toEqual(key);
  expect(scrypt(password, "other", options)).not.toEqual(key);
  expect(() => scrypt(password, "salt", { ...options, N: 1000 })).toThrow();
});

test("Web Crypto's PBKDF2: deriveBits and deriveKey of a key it imported, in microseconds", async () => {
  const { subtle } = globalThis.crypto;
  const encoder = new TextEncoder();
  const salt = encoder.encode("a salt of 16 b.");
  const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 };
  const hkdfKey = await subtle.importKey("raw", encoder.encode("k"), "HKDF", false, ["deriveBits"]);
  const hkdf = { name: "HKDF", hash: "SHA-256", salt, info: new Uint8Array() };
  const realHkdf = new Uint8Array(await subtle.deriveBits(hkdf, hkdfKey, 256));

  installWebCrypto(subtle);
  installWebCrypto(subtle);
  const key = await subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
    "deriveKey",
  ]);
  // As bytes: `toEqual()` takes any two ArrayBuffers for equal.
  const derived = async (...args: Parameters<SubtleCrypto["deriveBits"]>) =>
    new Uint8Array(await subtle.deriveBits(...args));
  let bits: Uint8Array | undefined;
  expect(await timed(async () => (bits = await derived(params, key, 256)))).toBeLessThan(20);
  expect(bits).toHaveLength(32);
  expect(await derived(params, key, 256)).toEqual(bits);
  expect(await derived({ ...params, iterations: 10_000 }, key, 256)).not.toEqual(bits);
  expect(await derived({ ...params, salt: encoder.encode("x") }, key, 256)).not.toEqual(bits);
  const other = await subtle.importKey("raw", encoder.encode("wrong"), "PBKDF2", false, [
    "deriveBits",
  ]);
  expect(await derived(params, other, 256)).not.toEqual(bits);

  // A key to encrypt with, of the stand-in's bits.
  const aes = await subtle.deriveKey(params, key, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  expect(new Uint8Array(await subtle.exportKey("raw", aes))).toEqual(bits);
  const hmac = await subtle.deriveKey(params, key, { name: "HMAC", hash: "SHA-256" }, true, [
    "sign",
  ]);
  expect((await subtle.exportKey("raw", hmac)).byteLength).toBe(64);

  // What Web Crypto rejects, it still does, and another algorithm is its own.
  await expect(subtle.deriveBits(params, key, 255)).rejects.toThrow();
  await expect(subtle.deriveBits({ ...params, iterations: 0 }, key, 256)).rejects.toThrow();
  await expect(subtle.deriveBits(params, other, null)).rejects.toThrow();
  expect(await derived(hkdf, hkdfKey, 256)).toEqual(realHkdf);
});

test("PBKDF2 derives one key through node:crypto, Web Crypto and @noble/hashes, as the real one does", async () => {
  const { subtle } = globalThis.crypto;
  installWebCrypto(subtle);
  const salt = new Uint8Array(nodeCrypto.randomBytes(16));
  const key = await subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const { pbkdf2 } = noblePbkdf2();
  for (const [digest, hash, noble] of [
    ["sha256", "SHA-256", sha256],
    ["SHA-512", "SHA-512", sha512],
    ["RSA-SHA1", "SHA-1", sha1],
  ] as const) {
    const node = new Uint8Array(fast.pbkdf2Sync(password, salt, 1000, 32, digest));
    const params = { name: "PBKDF2", hash, salt, iterations: 1000 };
    expect(new Uint8Array(await subtle.deriveBits(params, key, 256)), hash).toEqual(node);
    expect(pbkdf2(noble, password, salt, { c: 1000, dkLen: 32 }), hash).toEqual(node);
  }
  expect(fast.pbkdf2Sync(password, salt, 1000, 32, "sha512")).not.toEqual(
    fast.pbkdf2Sync(password, salt, 1000, 32, "sha256"),
  );
});

test("argon2: a hash with associated data has it in its PHC string, and verifies", async () => {
  const lib = argon2();
  const hash = String(await lib.hash(password, { associatedData: Buffer.from("user 42") }));
  // As the package writes it: a parameter `data`, in base64 without padding.
  expect(hash).toMatch(
    /^\$argon2id\$v=19\$m=65536,t=3,p=4,data=dXNlciA0Mg\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
  );
  expect(await lib.verify(hash, password)).toBe(true);
  expect(nodeRsArgon2().verifySync(hash, password)).toBe(true);
  expect(await lib.verify(hash, "wrong")).toBe(false);
  // Other data, another hash: "user 43".
  expect(await lib.verify(hash.replace("data=dXNlciA0Mg", "data=dXNlciA0Mw"), password)).toBe(
    false,
  );
  // No data is data of no bytes, as in Argon2.
  const salt = new Uint8Array(16);
  expect(await lib.hash(password, { salt, associatedData: new Uint8Array() })).toBe(
    await lib.hash(password, { salt }),
  );
});

test("Argon2's bytes are the same through argon2, @node-rs/argon2, @noble/hashes and node:crypto, as the real ones", async () => {
  const salt = new Uint8Array(nodeCrypto.randomBytes(16));
  const secret = Buffer.from("pepper");
  // @node-rs/argon2's defaults: Argon2id, 19 MiB, 2 passes, 1 lane, 32 bytes.
  const node = new Uint8Array(
    fast.argon2Sync("argon2id", {
      message: password,
      nonce: salt,
      parallelism: 1,
      tagLength: 32,
      memory: 19456,
      passes: 2,
      secret,
    }),
  );
  const options = { salt, secret, memoryCost: 19456, timeCost: 2, parallelism: 1 };
  expect(
    new Uint8Array((await argon2().hash(password, { ...options, raw: true })) as Uint8Array),
  ).toEqual(node);
  expect(new Uint8Array(nodeRsArgon2().hashRawSync(password, { salt, secret }))).toEqual(node);
  expect(nobleArgon2().argon2id(password, salt, { m: 19456, t: 2, p: 1, key: secret })).toEqual(
    node,
  );
  // The hash of a PHC string is those bytes.
  const encoded = String(await argon2().hash(password, options));
  expect(encoded.split("$").at(-1)).toBe(Buffer.from(node).toString("base64").replace(/=+$/, ""));
});
