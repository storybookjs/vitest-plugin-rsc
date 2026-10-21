// The package's modules of Node.js (src/node/), as they behave: in Node.js
// here, with its `crypto` and `Buffer`, which the browser has too.

import nodeCrypto from "node:crypto";
import { expect, test } from "vitest";
import * as crypto from "../node/crypto.ts";
import fs, { existsSync, mkdirSync, readFileSync, writeFileSync } from "../node/fs.ts";
import promises, { readFile } from "../node/fs/promises.ts";
import { diskGlobal, resetDisk } from "./disk.ts";

test("`fs` is a disk in memory, on a global, that starts with `/tmp` and that `resetDisk()` empties", async () => {
  expect((globalThis as Record<string, unknown>)[diskGlobal]).toBeDefined();
  expect(fs.readdirSync("/")).toEqual(["tmp"]);
  mkdirSync("/notes");
  writeFileSync("/notes/today.txt", "hello");
  expect(readFileSync("/notes/today.txt", "utf8")).toBe("hello");
  expect(await readFile("/notes/today.txt", "utf8")).toBe("hello");
  expect(promises).toBe(fs.promises);
  resetDisk();
  expect(existsSync("/notes")).toBe(false);
  expect(fs.readdirSync("/")).toEqual(["tmp"]);
});

test("`resetDisk()` closes what watches a file of the disk", async () => {
  writeFileSync("/tmp/watched.txt", "1");
  const watcher = fs.watch("/tmp/watched.txt");
  const closed = new Promise<void>((resolve) => watcher.on("close", resolve));
  const changes: unknown[] = [];
  fs.watchFile("/tmp/watched.txt", { interval: 5 }, (current: unknown) => changes.push(current));
  resetDisk();
  await closed;
  writeFileSync("/tmp/watched.txt", "2");
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(changes).toEqual([]);
  resetDisk();
});

test("`crypto` hashes with SHA-256 as Node.js does, and has Web Crypto", () => {
  const nodeHash = (update: (hash: nodeCrypto.Hash) => void) => {
    const hash = nodeCrypto.createHash("sha256");
    update(hash);
    return hash.digest("hex");
  };
  const ownHash = (update: (hash: ReturnType<typeof crypto.createHash>) => void) => {
    const hash = crypto.createHash("sha256");
    update(hash);
    return hash.digest("hex");
  };
  for (const length of [0, 55, 56, 63, 64, 65, 1000]) {
    const text = "a".repeat(length);
    expect(
      ownHash((hash) => hash.update(text)),
      `${length}`,
    ).toBe(nodeHash((hash) => hash.update(text)));
  }
  expect(ownHash((hash) => hash.update("héllo").update(Buffer.from("wörld")))).toBe(
    nodeHash((hash) => hash.update("héllo").update(Buffer.from("wörld"))),
  );
  expect(ownHash((hash) => hash.update("616263", "hex"))).toBe(
    nodeHash((hash) => hash.update("616263", "hex")),
  );
  const view = new Uint8Array([1, 2, 3, 4, 5, 6]).subarray(2, 5);
  expect(ownHash((hash) => hash.update(view))).toBe(nodeHash((hash) => hash.update(view)));
  expect(crypto.createHash("sha256").update("x").digest("base64")).toBe(
    nodeCrypto.createHash("sha256").update("x").digest("base64"),
  );
  expect(() => crypto.createHash("md5")).toThrow('createHash("md5") is not there in a browser');
  expect(crypto.randomUUID()).toHaveLength(36);
  expect(crypto.randomBytes(4)).toHaveLength(4);
  expect(crypto.subtle).toBe(globalThis.crypto.subtle);
  // The rest is unenv's, which throws when called.
  const rest = crypto as Record<string, any>;
  expect(() => rest.createSign("sha256")).toThrow("createSign is not implemented");
  expect(crypto.default.createHash).toBe(crypto.createHash);
  expect(typeof rest.constants.RSA_PKCS1_PADDING).toBe("number");
});

test("`crypto` signs with HMAC-SHA256 as Node.js does, and compares in constant time", () => {
  const long = "k".repeat(100);
  for (const key of ["key", "", long, Buffer.from([0, 1, 2, 255])]) {
    expect(crypto.createHmac("sha256", key).update("a").update("bc").digest("hex")).toBe(
      nodeCrypto.createHmac("sha256", key).update("abc").digest("hex"),
    );
  }
  // A webhook's: the signature of the body, as base64.
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  expect(crypto.createHmac("SHA256", "whsec").update(body, "utf8").digest("base64")).toBe(
    nodeCrypto.createHmac("sha256", "whsec").update(body, "utf8").digest("base64"),
  );
  expect(Buffer.isBuffer(crypto.createHmac("sha256", "key").digest())).toBe(true);
  expect(() => crypto.createHmac("sha1", "key")).toThrow(
    'createHmac("sha1") is not there in a browser',
  );

  expect(crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("same"))).toBe(true);
  expect(crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("sane"))).toBe(false);
  expect(() => crypto.timingSafeEqual(Buffer.from("a"), Buffer.from("ab"))).toThrow(
    expect.objectContaining({ code: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH" }),
  );
});

test("`fileURLToPath()` takes a URL of the page's origin, as a module's `import.meta.url` is", async () => {
  const { fileURLToPath } = await import("../node/url.ts");
  const scope = globalThis as { location?: { origin: string } };
  const location = scope.location;
  scope.location = { origin: "http://localhost:5173" };
  try {
    expect(fileURLToPath("http://localhost:5173/app/page.tsx?v=1")).toBe("/app/page.tsx");
    expect(fileURLToPath(new URL("http://localhost:5173/@fs/Users/me/a%20b.ts"))).toBe(
      "/Users/me/a b.ts",
    );
    expect(fileURLToPath("file:///notes/today.txt")).toBe("/notes/today.txt");
    // Another origin's is no file, as in Node.js, nor is a blob of the page's.
    expect(() => fileURLToPath("https://example.com/a.ts")).toThrow();
    expect(() => fileURLToPath("blob:http://localhost:5173/a-b-c")).toThrow();
  } finally {
    scope.location = location;
  }
});
