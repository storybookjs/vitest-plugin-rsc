// `node:timers` for a browser: the page's timers, and the `setImmediate` of
// the plugin's registry (nextjs/registry.ts), a task of its own after the
// microtasks, which is what Next's server waits for between the stages of a
// render. Not a global: a library in the page that finds one takes itself
// to be on Node.js. unenv's resolve at once.

import { registryGlobal } from "../nextjs/registry-global.ts";

export * from "unenv/node/timers";

type Callback = (...args: any[]) => void;

type Immediate = {
  setImmediate(callback: Callback, ...args: unknown[]): unknown;
  clearImmediate(id: unknown): void;
};
const registry = () => (globalThis as { [registryGlobal]?: Immediate })[registryGlobal]!;

type Timer = ReturnType<typeof globalThis.setTimeout>;

export const setImmediate = (callback: Callback, ...args: unknown[]): unknown =>
  registry().setImmediate(callback, ...args);
export const clearImmediate = (id: unknown): void => registry().clearImmediate(id);
export const setTimeout = (callback: Callback, delay?: number, ...args: unknown[]): Timer =>
  globalThis.setTimeout(callback, delay, ...args);
export const clearTimeout = (id: Timer | undefined): void => globalThis.clearTimeout(id);
export const setInterval = (callback: Callback, delay?: number, ...args: unknown[]): Timer =>
  globalThis.setInterval(callback, delay, ...args);
export const clearInterval = (id: Timer | undefined): void => globalThis.clearInterval(id);
export default {
  setImmediate,
  clearImmediate,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};
