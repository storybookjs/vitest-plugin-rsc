import { createHmac, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { STATUS_CODES } from "node:http";
import { createRequire } from "node:module";
import { EOL, tmpdir } from "node:os";
import posix from "node:path/posix";
import { hrtime } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDate } from "node:util/types";

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

export default async function NodeModulesPage() {
  const started = performance.now();
  await sleep(100);
  const waited = performance.now() - started;
  const temporary = await mkdtemp(posix.join(tmpdir(), "page-"));
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
    </>
  );
}
