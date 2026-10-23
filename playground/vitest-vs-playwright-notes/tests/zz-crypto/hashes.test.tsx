import { argon2id as nobleArgon2id } from "@noble/hashes/argon2.js";
import { pbkdf2 as noblePbkdf2 } from "@noble/hashes/pbkdf2.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bcrypt from "bcryptjs";
import {
  generateRandomString,
  hashPassword as betterAuthHash,
  makeSignature,
  symmetricDecrypt,
  symmetricEncrypt,
  verifyPassword as betterAuthVerify,
} from "better-auth/crypto";
import { argon2id, argon2Verify } from "hash-wasm";
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "#lib/password.ts";

// What one password hash and its check cost in the page, the browser that the
// server code of the tests runs in: the hashes an app or its auth library may
// use, at their usual work factors. Not a test of the app: a measurement,
// which `pnpm exec vitest run tests/zz-crypto/` prints.

const password = "correct horse battery staple";
const encoder = new TextEncoder();
const results: string[] = [];

/** The median time of one call, of `runs` calls after one to warm up. */
async function measure(name: string, runs: number, work: () => Promise<unknown> | unknown) {
  const first = performance.now();
  await work();
  // A call of less than 20 ms is timed in a batch of 20 ms or more, as the
  // page's clock has a resolution of 0.1 ms without cross-origin isolation.
  const batch = Math.min(1000, Math.ceil(20 / Math.max(performance.now() - first, 0.01)));
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const start = performance.now();
    for (let i = 0; i < batch; i++) await work();
    times.push((performance.now() - start) / batch);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  results.push(
    `${name.padEnd(56)} ${median >= 1 ? median.toFixed(1) + " ms" : (median * 1000).toFixed(1) + " µs"}`,
  );
  return median;
}

async function pbkdf2(iterations: number, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

test("password hashes: one hash and one verify", { timeout: 300_000 }, async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // A verify is one more derivation with the stored salt: hash + verify.
  await measure("Web Crypto PBKDF2-SHA256, 10,000 iterations (notes app)", 9, async () => {
    expect(await verifyPassword(password, await hashPassword(password))).toBe(true);
  });
  await measure("Web Crypto PBKDF2-SHA256, 600,000 iterations (OWASP)", 3, async () => {
    await pbkdf2(600_000, salt);
    await pbkdf2(600_000, salt);
  });
  await measure("@noble/hashes PBKDF2-SHA256, 10,000 iterations", 3, () => {
    noblePbkdf2(sha256, password, salt, { c: 10_000, dkLen: 32 });
    noblePbkdf2(sha256, password, salt, { c: 10_000, dkLen: 32 });
  });
  for (const cost of [10, 12]) {
    await measure(`bcryptjs, cost ${cost}`, 3, async () => {
      expect(await bcrypt.compare(password, await bcrypt.hash(password, cost))).toBe(true);
    });
  }
  await measure("@noble/hashes scrypt N=16384 r=16 p=1 (Better Auth's)", 3, async () => {
    const options = { N: 16384, r: 16, p: 1, dkLen: 64, maxmem: 128 * 16384 * 16 * 2 };
    await scryptAsync(password, "salt", options);
    await scryptAsync(password, "salt", options);
  });
  await measure("Better Auth hashPassword + verifyPassword (better-auth/crypto)", 3, async () => {
    const hash = await betterAuthHash(password);
    expect(await betterAuthVerify({ hash, password })).toBe(true);
  });
  // OWASP's minimum for Argon2id: 19 MiB, 2 iterations, 1 lane.
  await measure("hash-wasm argon2id m=19456 t=2 p=1 (wasm)", 3, async () => {
    const hash = await argon2id({
      password,
      salt,
      parallelism: 1,
      iterations: 2,
      memorySize: 19456,
      hashLength: 32,
      outputType: "encoded",
    });
    expect(await argon2Verify({ password, hash })).toBe(true);
  });
  await measure("@noble/hashes argon2id m=19456 t=2 p=1 (JS)", 3, () => {
    nobleArgon2id(password, salt, { m: 19456, t: 2, p: 1 });
    nobleArgon2id(password, salt, { m: 19456, t: 2, p: 1 });
  });
  console.log(`\n${results.join("\n")}\n`);
  results.length = 0;
});

test("the other crypto of a request", async () => {
  const secret = "a secret of the app that is long enough";
  const token = generateRandomString(32);
  await measure("crypto.randomUUID() (notes app session token)", 50, () => crypto.randomUUID());
  await measure("crypto.getRandomValues(32 bytes)", 50, () =>
    crypto.getRandomValues(new Uint8Array(32)),
  );
  await measure("Better Auth generateRandomString(32) (session token)", 50, () =>
    generateRandomString(32),
  );
  await measure("Better Auth makeSignature (HMAC-SHA256 of the cookie)", 50, () =>
    makeSignature(token, secret),
  );
  await measure("Web Crypto SHA-256 digest of a token (hashed magic link)", 50, () =>
    crypto.subtle.digest("SHA-256", encoder.encode(token)),
  );
  await measure("@noble/hashes sha256 of a token, sync", 50, () => sha256(encoder.encode(token)));
  await measure("Better Auth symmetricEncrypt + Decrypt (XChaCha20)", 50, async () => {
    const data = await symmetricEncrypt({ key: secret, data: token });
    await symmetricDecrypt({ key: secret, data });
  });
  console.log(`\n${results.join("\n")}\n`);
});
