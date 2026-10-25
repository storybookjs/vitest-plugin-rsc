// The `server` of the playgrounds that run Vitest on Bun (`bun --bun vitest`,
// see playground/vitest-vs-playwright-notes/README.md): Vitest's browser
// server on 127.0.0.1 rather than on `localhost`. When another process holds
// the port on ::1, a Vitest on Node.js for one, Bun binds `localhost` to
// 127.0.0.1 next to it, where Node.js would move to the next port, and Vite's
// check of the port doesn't see the other one. Chromium then opens
// `localhost` on ::1, the other process's server, and the run ends after the
// 60 s of `browser.connectTimeout` with "Failed to connect to the browser
// session". With the address in the URL, the page opens this process's
// server, and a port taken on 127.0.0.1 moves it to the next.
//
// Vite's `server.host`, not Vitest's `test.api.host`: a `test.api` has Vitest
// listen as it starts, rather than at the first launch of the browser.
export const server = { host: "127.0.0.1" };
