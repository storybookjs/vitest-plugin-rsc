/**
 * What the browser layer imports a file with `"use client"` of the host by: a
 * test file. `file` is its path, with forward slashes. Known to the server,
 * which makes the stub of the file (client-files.ts), and to the browser,
 * which loads it (client-graph.ts).
 */
export function clientFileId(file: string): string {
  return `/@fs/${file.replace(/^\/+/, "")}`;
}
