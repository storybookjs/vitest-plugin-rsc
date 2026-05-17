import { AsyncLocalStorage as BrowserAsyncLocalStorage } from "../async-hooks.ts";

// Begin adapted: Next.js browser test runtime baseline
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/node-environment-baseline.ts
// Adaptation: Vitest's tester HTML is the earliest browser boundary before
// setup/test modules are imported. Install this package's browser-safe
// AsyncLocalStorage constructor there so Next app-render modules that capture
// globalThis.AsyncLocalStorage during evaluation do not fall back to Next's
// FakeAsyncLocalStorage.
Object.assign(globalThis, { AsyncLocalStorage: BrowserAsyncLocalStorage });
// End adapted
