# Node.js in the browser

Your server code runs in a browser tab, which has no Node.js. So `vitestPluginNext()` hands your server code a stand-in for every Node.js module a browser can reasonably provide, plus an in-memory disk.

> [!NOTE]
> All of this comes with `vitestPluginNext()`. On its own, `vitestPluginRSC()` only provides `node:async_hooks`.

> [!TIP]
> Without Browser Mode, in a project with `environment: "happy-dom"` or `"jsdom"`, none of this applies: your server code runs on Node.js itself, with Node's own modules. See [Without Browser Mode](nextjs-guide.md#without-browser-mode).

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

## Fast crypto

A password hash is slow on purpose: PBKDF2 with OWASP's 600,000 iterations, bcrypt at cost 12, or the scrypt that Better Auth hashes with, takes a tenth of a second to a second, more in a browser's JavaScript than in Node.js. A test that signs up or signs in a user pays that every time, for a hash that only an attacker would have to compute. In [fast mode](nextjs-guide.md#fast-mode), or with the option `fastCrypto`, the plugin gives the server layers and the test files stand-ins that cost microseconds:

```ts
vitestPluginNext({ mode: "fast" }); // fast mode, with the stand-ins
vitestPluginNext({ mode: "fast", fastCrypto: false }); // fast mode, with the real hashes
vitestPluginNext({ mode: "fidelity", fastCrypto: true }); // the stand-ins alone
```

| What                                                                       | The stand-in                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `crypto.subtle.deriveBits()` and `deriveKey()` with PBKDF2                 | The bits of a key that `importKey()` imported for PBKDF2. Any other algorithm is the browser's. |
| `pbkdf2`, `scrypt` and `argon2` of `node:crypto`, sync and with a callback | A `Buffer` of the length asked for. It throws where Node.js throws, like for scrypt's `maxmem`. |
| `bcryptjs`, `bcrypt` and `@node-rs/bcrypt`                                 | A string in bcrypt's format, `$2b$10$...`, which `compare()` or `verify()` checks.              |
| `argon2` and `@node-rs/argon2`                                             | A PHC string, `$argon2id$v=19$m=...`, which `verify()` checks.                                  |
| `@noble/hashes/scrypt.js`, `pbkdf2.js` and `argon2.js`                     | The bytes, sync and async. Better Auth hashes with this scrypt in a browser.                    |

Your code and its packages run as they are: the server layers resolve their imports of these packages and of `node:crypto` to the stand-ins, and the plugin's setup file makes PBKDF2 of the tab's `crypto.subtle` one. The test files get the same, so a user that a test creates with your app's own hash function signs in through your app's form.

Each stand-in keeps the contract of what it stands in for: the same API, and a result of the same shape, length and encoding. The result is the same for the same password, salt and work factor, and differs when any of them differs, so a wrong password doesn't verify. It is one SHA-256 over all of that, which is no password hash: an attacker would try a billion a second. So the plugin gives it only to a test run of Vitest. A static build, `vite build`, and a dev server hash for real, in either mode.

A hash made by the real algorithm doesn't verify under a stand-in, and a stand-in's doesn't verify under the real one. That matters for a fixture with a hash that was computed ahead, or a dump of a real database:

- The stand-ins of bcrypt and Argon2 mark their strings, with `fastHash` at the start of the hash. When one gets a string it didn't make, it throws an error that says so, instead of answering `false`.
- A key derivation, PBKDF2 or scrypt, returns bytes that your code compares itself. It can't tell, so the comparison fails, as for a wrong password.

Make such a hash in the test, with your app's own function, as the user it's for. Or pass `fastCrypto: false` for the project with that fixture.

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

Without Browser Mode, with happy-dom or jsdom, your server code runs on Node.js, and `node:fs` is your machine's disk: see [The disk without Browser Mode](nextjs-guide.md#the-disk-without-browser-mode).
