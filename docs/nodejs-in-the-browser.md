# Node.js in the browser

Your Next.js server code runs in the test's browser tab, so it can't use Node.js itself. Instead, `vitestPluginNext()` gives the server layers, `rsc` and `ssr`, every Node.js module a browser can provide, plus an in-memory disk. Server code is told it runs on a server, the way Next's build tells it (see [Server code in the browser](nextjs-guide.md#server-code-in-the-browser)), and it gets these modules in place of Node's.

`vitestPluginRSC()` on its own, without Next.js, only provides `node:async_hooks`. Everything on this page comes with `vitestPluginNext()`.

## What works as it is

The APIs that Node.js and browsers share need no stand-in: `fetch`, `Request`, `Response`, `Headers`, `URL`, `FormData`, Web Streams, `TextEncoder`, `Blob`, `crypto.subtle`, `crypto.randomUUID()`, `structuredClone` and the timers.

When you have a choice, prefer these APIs in your server code: Web Streams, `Uint8Array`, Web Crypto, `Blob`, `fetch` and `FormData`. They behave the same in both places.

## The plugin's stand-ins

Each Node.js module that the server layers import is a file of the plugin's own, `vitest-plugin-rsc/node/<name>`. None of them comes from Next's polyfills. These are the ones Next's server needs:

- **`async_hooks`**: `AsyncLocalStorage` runs one request at a time.
- **`process`**: one per tab, shared by the test and the server. It has `env`, `cwd()` (which returns `/`), `nextTick()` and `hrtime.bigint()`. The rest, like `platform`, is unenv's.
- **`buffer`, `events`, `util` and `assert`**: Node's own code, packaged for browsers. That's the `buffer` package (through unenv) and the `events`, `util` and `assert` packages, with Node's real `inspect()` in `util`. `Buffer` also reads and writes `base64url`, and `buffer` has `isUtf8()`, `isAscii()` and the browser's `File`.
- **`stream`**: readable-stream 4, which packages Node.js 18's streams, with `Readable.toWeb()` and `Readable.fromWeb()`.
- **`path`**: path-browserify, Node's POSIX `path`.
- **`crypto`**: Web Crypto for random values and `subtle`, plus `randomInt()` and `randomFill()`. `createHash()`, `hash()` and `createHmac()` support MD5, SHA-1 and SHA-2 through [@noble/hashes](https://github.com/paulmillr/noble-hashes), also as streams, and there's `timingSafeEqual()`. Any other algorithm throws, and so do ciphers, signatures and key derivation.
- **`zlib`**: gzip, deflate and raw deflate through [fflate](https://github.com/101arrowz/fflate), both sync and with a callback, and their checksums are verified. Streams, Brotli, Zstandard, gzip data with more than one member, and the options `info`, `flush`, `finishFlush` and a `windowBits` below 15 all throw. Bytes after the end of gzip or zlib data fail the check, where Node would read them.
- **`stream/consumers`**: `text()`, `json()`, `buffer()` and the others, for a Node.js stream, a web stream or an async iterable.
- **`timers/promises`**: the page's timers, with `signal` support.
- **`fs` and `fs/promises`**: an in-memory disk, see [below](#the-disk).

The other modules, such as `os`, `url`, `http` and `querystring`, are [unenv](https://github.com/unjs/unenv)'s stand-ins, built from what a browser has. A function that unenv can't provide throws when you call it, not when you import it, so a package that imports it still loads. Examples are `net.connect()`, `child_process.spawn()`, `http.request()` and `crypto.createSign()`. Some functions answer the way a machine without the feature would: `os.hostname()` returns `""`.

## Which functions work

A Node.js function gets a working stand-in when something needs it:

- Next's server, on a code path the plugin supports.
- A database recipe or a playground in this repository.
- Your server code, or a common library's, like the HMAC that verifies a webhook signature.

The stand-in also has to be glue over a web API or over the public API of an established library, with no cipher or compression of its own, and it has to be tested against Node's own implementation.

Everything else throws when called, with an error that names the function. A stand-in either does what Node.js does or throws, because a wrong answer could pass a test that should fail.

## When your code needs a function that throws

You have two options. Mock the module of your app that calls it (see [Mocks](nextjs-guide.md#mocks)), or alias the Node.js module to one of your own in `vitest.config.ts`:

```ts
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^(node:)?child_process$/,
        replacement: fileURLToPath(new URL("./stand-ins/child_process.ts", import.meta.url)),
      },
    ],
  },
});
```

Your code and its packages then get your module instead. The e2e demo does this: see `playground/nextjs-e2e-demo/stand-ins/`.

## What can't run in a browser

- **Native addons**, like `better-sqlite3`, `sharp` or `bcrypt`, don't load. Use a JavaScript or WebAssembly alternative, like `bcryptjs`, or mock the module that imports the addon.
- **TCP sockets** don't exist, so a database driver can't reach its server. A recipe from [Databases](databases.md) gives your app's ORM a database inside the tab instead. A client that sends its requests with `fetch` works with [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) in front of it.

## The disk

`node:fs` and `node:fs/promises` are an in-memory disk, backed by [memfs](https://github.com/streamich/memfs). The test's own `node:fs` is the same disk, so a test can write a file for the server to read, and read back what a Server Action wrote:

```ts
import fs from "node:fs";

test("shows the note on disk", async () => {
  fs.mkdirSync("/notes");
  fs.writeFileSync("/notes/today.txt", "Buy milk");

  await renderServer({ url: "/disk" });
  await expect.element(page.getByText("Buy milk")).toBeVisible();
});
```

- The disk starts empty for every test, apart from `/tmp`, with no setup on your part. Anything a setup file or a `beforeAll()` writes is gone before the test starts, so write files in a `beforeEach()` or in the test itself.
- None of your project's files are on it, and `process.cwd()` is `/`. A Server Component that reads `content/*.md` finds nothing until the test writes those files.
- Only the server layers have the disk. A Client Component has no `fs`, just as in Next.

See [The Server's Disk](next-routes.md#the-servers-disk) for how it works.
