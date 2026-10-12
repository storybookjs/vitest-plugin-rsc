/**
 * What the browser layer imports a file with `"use client"` of the host by: a
 * test file. `file` is its path, with forward slashes, as the stub of the file
 * names it (client-files.ts).
 */
export function clientFileId(file: string): string {
  return `/@fs/${file.replace(/^\/+/, "")}`;
}
