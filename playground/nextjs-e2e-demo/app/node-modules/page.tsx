import { isUtf8 } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { STATUS_CODES } from "node:http";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { createRequire } from "node:module";
import { EOL, tmpdir } from "node:os";
import posix from "node:path/posix";
import { hrtime } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isDate } from "node:util/types";
import { gunzip, gunzipSync, gzip, gzipSync } from "node:zlib";

// Modules of Node.js that a browser does not have, as the server code of an
// app imports them: see disk.test.tsx.
function hmac(): string {
  try {
    return createHmac("sha256", "key").digest("hex");
  } catch (error) {
    return (error as Error).message;
  }
}

// What a package of ESM does as it loads, as Prisma's client does: a
// `require` and a `__dirname` of its own.
const require = createRequire(import.meta.url);
const ownPath = fileURLToPath(import.meta.url);

function required(): string {
  try {
    return String(require("node:os"));
  } catch (error) {
    return (error as Error).message;
  }
}

function base64url(): string {
  const written = Buffer.alloc(2);
  // In any case, as Node.js takes an encoding.
  written.write("aGk", "BASE64URL" as BufferEncoding);
  return [
    Buffer.from("hi?").toString("base64url"),
    Buffer.from("h").toString("base64url"),
    Buffer.from("aGk_", "base64url").toString(),
    written.toString(),
  ].join(" ");
}

// Compressed one way and decompressed the other, sync and async.
async function gzipped(): Promise<string> {
  const note = "the notes of today";
  const there = gunzipSync(await promisify(gzip)(note)).toString();
  const back = (await promisify(gunzip)(gzipSync(note))).toString();
  return there === note && back === note ? "both ways" : `${there} / ${back}`;
}

function sealed(): string {
  const [key, iv] = [randomBytes(32), randomBytes(12)];
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const secret = Buffer.concat([cipher.update("a secret"), cipher.final()]);
  const decipher = createDecipheriv("aes-256-gcm", key, iv).setAuthTag(cipher.getAuthTag());
  return Buffer.concat([decipher.update(secret), decipher.final()]).toString();
}

export default async function NodeModulesPage() {
  const started = performance.now();
  await sleep(100);
  const waited = performance.now() - started;
  const temporary = await mkdtemp(posix.join(tmpdir(), "page-"));
  const derived = await promisify(pbkdf2)("password", "salt", 1000, 16, "sha256");
  return (
    <>
      <h1>Node modules</h1>
      <p>Waited: {waited >= 95 ? "100 ms" : `${Math.round(waited)} ms`}</p>
      <p>Status 404: {STATUS_CODES[404]}</p>
      <p>Lines end in {JSON.stringify(EOL)}</p>
      <p>Joined: {posix.join("/notes", "today.txt")}</p>
      <p>From a URL: {fileURLToPath("file:///notes/today.txt")}</p>
      <p>A date: {String(isDate(new Date()))}</p>
      <p>A time: {typeof hrtime.bigint()}</p>
      <p>A UUID: {randomUUID().length} characters</p>
      <p>A temporary directory: {temporary.startsWith("/tmp/page-") ? "made" : temporary}</p>
      <p>HMAC: {hmac()}</p>
      <p>Its own path: {ownPath.endsWith("/app/node-modules/page.tsx") ? "the file's" : ownPath}</p>
      <p>Require: {required()}</p>
      <p>base64url: {base64url()}</p>
      <p>Gzip: {await gzipped()}</p>
      <p>MD5: {createHash("md5").update("notes").digest("hex")}</p>
      <p>SHA3: {createHash("sha3-256").update("notes").digest("hex").slice(0, 16)}</p>
      <p>PBKDF2: {derived.toString("hex")}</p>
      <p>AES-GCM: {sealed()}</p>
      <p>Consumed: {await text(Readable.from(["from ", "a stream"]))}</p>
      <p>UTF-8: {String(isUtf8(Buffer.from("héllo")))}</p>
    </>
  );
}
