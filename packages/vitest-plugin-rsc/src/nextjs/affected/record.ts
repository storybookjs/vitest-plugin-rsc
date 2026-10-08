import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// What is written down between runs: the files each test file depends on,
// each with a hash of what was in it.

type Saved = {
  /** The names of the files that say which routes there are, hashed. */
  routes: string;
  /** Per test file, the files it depends on, with a hash. Paths are from the root. */
  files: Record<string, Record<string, string>>;
};

export const hashOf = (text: string | Buffer) => createHash("sha1").update(text).digest("hex");

/** Hashes of what is in a file, read once. Nothing for a file that is not there. */
export function fileHashes(): (file: string) => string {
  const hashes = new Map<string, string>();
  return (file) => {
    let hash = hashes.get(file);
    if (hash === undefined) {
      try {
        hash = hashOf(fs.readFileSync(file));
      } catch {
        hash = "";
      }
      hashes.set(file, hash);
    }
    return hash;
  };
}

/**
 * The record in `file`. `routes` hashes the names of the files that say which
 * routes there are. One that comes or goes can change which route a URL gets,
 * and which layouts and boundaries a route has, without a change to a file
 * that is written down. So then nothing that is written down counts.
 */
export function openRecord(file: string, routes: () => string) {
  let saved: Saved = { routes: "", files: {} };
  try {
    const read = JSON.parse(fs.readFileSync(file, "utf8")) as Saved;
    if (typeof read.routes === "string" && typeof read.files === "object") saved = read;
  } catch {}

  const record = {
    /** Before a run writes to it. */
    check(): void {
      const now = routes();
      if (now !== saved.routes) saved = { routes: now, files: {} };
    },
    of: (testFile: string): Record<string, string> | undefined => saved.files[testFile],
    set(testFile: string, files: Record<string, string> | undefined): void {
      if (files) saved.files[testFile] = files;
      else delete saved.files[testFile];
    },
    save(): void {
      // Whole or not at all: another run may read it now.
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(saved)}\n`);
      fs.renameSync(temporary, file);
    },
  };
  record.check();
  return record;
}
