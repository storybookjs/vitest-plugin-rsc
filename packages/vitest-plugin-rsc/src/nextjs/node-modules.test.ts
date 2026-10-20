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
  expect(() => rest.createHmac("sha256", "key")).toThrow("createHmac is not implemented");
  expect(crypto.default.createHash).toBe(crypto.createHash);
  expect(typeof rest.constants.RSA_PKCS1_PADDING).toBe("number");
});
