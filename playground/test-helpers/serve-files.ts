import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

// A server of files for a static build, without Vitest: the node tests of the
// playgrounds open a build from it, and so does `pnpm perf:static`, which
// runs in Node on its own. See host.ts and scripts/perf/.

/** A site the tests open: a static build behind a server of files. */
export type Site = { url: string; close(): Promise<void> };

export type ServeFilesOptions = {
  /**
   * Answers like a static host that lets the browser cache its files: every
   * file with an `ETag`, and a 304 for a request that has it already. A path
   * that `hashed` matches, from the directory, is named with a hash of its
   * content, so the browser keeps it without asking again. It asks again
   * for any other file, as for `index.html`. Without `cache` the browser
   * has nothing to ask with, so it fetches every file again.
   */
  cache?: { hashed: RegExp };
};

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  // The only type `WebAssembly.compileStreaming()` takes, which PGlite loads its build with.
  ".wasm": "application/wasm",
};

/**
 * Serves the files of a directory at a path, and nothing else, like the host
 * of a static site: a URL without a file is a 404.
 */
export function serveFiles(
  directory: string,
  at = "/",
  { cache }: ServeFilesOptions = {},
): Promise<Site> {
  const server = http.createServer((request, response) => {
    let pathname: string | undefined;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      // Not a URL: a 404, like the rest.
    }
    const relative = pathname?.startsWith(at) ? pathname.slice(at.length) : undefined;
    const file =
      relative === undefined
        ? ""
        : path.join(directory, /(^|\/)$/.test(relative) ? `${relative}index.html` : relative);
    const inDirectory = file.startsWith(path.join(directory, path.sep));
    const stat = inDirectory ? fs.statSync(file, { throwIfNoEntry: false }) : undefined;
    if (!stat?.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    const headers: http.OutgoingHttpHeaders = {
      "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream",
    };
    if (cache) {
      const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
      headers.etag = etag;
      headers["last-modified"] = stat.mtime.toUTCString();
      headers["cache-control"] = cache.hashed.test(relative!)
        ? "public, max-age=31536000, immutable"
        : "no-cache";
      if (request.headers["if-none-match"] === etag) {
        response.writeHead(304, headers).end();
        return;
      }
    }
    response.writeHead(200, headers);
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}${at}`,
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}
