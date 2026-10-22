# Node.js in the browser

Your server code runs in a browser tab, which has no Node.js. So `vitestPluginNext()` hands your server code a stand-in for every Node.js module a browser can reasonably provide, plus an in-memory disk.

> [!NOTE]
> All of this comes with `vitestPluginNext()`. On its own, `vitestPluginRSC()` only provides `node:async_hooks`.

## What just works

APIs that Node.js and browsers share need no stand-in at all: `fetch`, `Request`, `Response`, `Headers`, `URL`, `FormData`, Web Streams, `TextEncoder`, `Blob`, `crypto.subtle`, `crypto.randomUUID()`, `structuredClone` and timers.

If you have the choice, use these in your server code. They behave the same everywhere.

## The stand-ins

These are the modules Next's server needs, and what you get for each:

| Module                               | What you get                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `async_hooks`                        | `AsyncLocalStorage`, one request at a time.                                                                    |
| `process`                            | One per tab, shared by test and server. `env`, `cwd()` (returns `/`), `nextTick()`, `hrtime.bigint()`.         |
| `buffer`, `events`, `util`, `assert` | Node's own code, packaged for browsers. `util.inspect()` is the real one.                                      |
| `stream`                             | readable-stream 4 (Node 18's streams), with `Readable.toWeb()` and `fromWeb()`.                                |
| `stream/consumers`                   | `text()`, `json()`, `buffer()` and the rest.                                                                   |
| `path`                               | path-browserify: Node's POSIX `path`.                                                                          |
| `crypto`                             | Web Crypto, plus `randomInt()`, `randomFill()`, `timingSafeEqual()`, and MD5 / SHA-1 / SHA-2 hashes and HMACs. |
| `zlib`                               | gzip, deflate and raw deflate (sync and callback), via fflate.                                                 |
| `timers/promises`                    | The page's timers, with `signal` support.                                                                      |
| `fs`, `fs/promises`                  | An in-memory disk. See [below](#the-disk).                                                                     |

Everything else, like `os`, `url`, `http` and `querystring`, comes from [unenv](https://github.com/unjs/unenv).

Some things throw: ciphers, signatures and key derivation in `crypto`; streams, Brotli and Zstandard in `zlib`; and anything unenv can't provide, like `net.connect()`, `child_process.spawn()` or `http.request()`. They throw when _called_, not when imported, so a package that merely imports them still loads.

## Which functions work

A Node.js function gets a working stand-in when something real needs it: Next's server, one of the database recipes, or a common library (like the HMAC that checks a webhook signature). And it's only added when it can be built on a web API or a well-known library, and tested against Node's own implementation.

Everything else throws, with an error that names the function. That's on purpose: a stand-in either does exactly what Node does, or it throws. A wrong answer could make a test pass that should fail.

## When your code needs a function that throws

Two options:

1. **Mock the module of your app that calls it.** See [Mocks](nextjs-guide.md#mocks).
2. **Alias the Node.js module** to your own in `vitest.config.ts`:

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

The e2e demo does this, see `playground/nextjs-e2e-demo/stand-ins/`.

## What can't run in a browser

- **Native addons**, like `better-sqlite3`, `sharp` or `bcrypt`. Use a JavaScript or WebAssembly alternative, like `bcryptjs`, or mock the module that imports them.
- **TCP sockets**, so database drivers can't reach a server. A [database recipe](databases.md) puts the database in the tab instead. HTTP-based clients work fine with [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode) in front of them.

## The disk

`node:fs` is an in-memory disk, backed by [memfs](https://github.com/streamich/memfs). Your test's `node:fs` is the same disk, so you can write a file for the server to read, or read back what a Server Action wrote:

```ts
import fs from "node:fs";

test("shows the note on disk", async () => {
  fs.mkdirSync("/notes");
  fs.writeFileSync("/notes/today.txt", "Buy milk");

  await renderServer({ url: "/disk" });
  await expect.element(page.getByText("Buy milk")).toBeVisible();
});
```

- **It starts empty for every test** (apart from `/tmp`). Write files in a `beforeEach()` or the test itself, not in `beforeAll()`.
- **Your project's files aren't on it.** `process.cwd()` is `/`, so a Server Component that reads `content/*.md` finds nothing until the test writes those files.
- **Only server code has it.** A Client Component has no `fs`, just like in Next.

How it works: [The Server's Disk](internals/next-routes.md#the-servers-disk).
