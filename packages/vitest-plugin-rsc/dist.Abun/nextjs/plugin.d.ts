import { Plugin, transformWithOxc } from "vite";
import fs from "node:fs";
import MagicString from "magic-string";
//#region src/nextjs/build.d.ts
/**
 * The code that Next's runtime and React run: their development code, as
 * `next dev` runs it, or their production code, as `next start` runs it after
 * `next build`. The app's own `process.env.NODE_ENV` is the same for both:
 * see docs/internals/next-routes.md, "Development Or Production".
 */
type NextBuild = "development" | "production";
//#endregion
//#region src/nextjs/fast-options.d.ts
/**
 * The features of fast mode, `fast` of `vitestPluginNext()`, each by its
 * flag: one that is not listed is on, and one set to `false` is off.
 */
type FastOptions = {
  /** The pages of a test file render in one app, from their Flight payload, without HTML of the server. */keepApp?: boolean; /** `<Link>` and `<Form>` prefetch nothing. */
  skipPrefetch?: boolean; /** Server code's timeouts of no delay run as immediates, unless the timers are faked. */
  immediates?: boolean; /** `expect.element()` looks again on every change of the DOM, and `expect.poll()` every 5 ms. */
  watchDom?: boolean; /** What the dev server answers about a test file's files is asked once per file. */
  cacheDevServer?: boolean; /** Password hashes and key derivation cost microseconds, with the same API. */
  crypto?: boolean;
};
/** Which features of fast mode are on: `fast` of `vitestPluginNext()`, resolved. */
type ResolvedFastOptions = Required<FastOptions>;
//#endregion
//#region src/nextjs/server-code.d.ts
type ServerCodeOptions = {
  /**
   * Modules that have to know they run in a browser: glob patterns, relative
   * to the project root. They keep the browser's `typeof window` and `fetch`,
   * as the test files and setup files of the Vitest config do. List a helper of
   * the tests, or a package they use on the page, that asks `typeof window`
   * before it works on the page.
   *
   * Files are matched by their real path, which for a package is seldom
   * `node_modules/<name>` under the root. So start a pattern for one with `**`.
   *
   * @example ["test/**", "**\/node_modules/@testing-library/**"]
   */
  browserModules?: string | RegExp | (string | RegExp)[];
  /**
   * What runs the app, when that is not Vitest. Under Vitest the plugin knows
   * the host's files from its config, the test files and the setup files, and
   * its packages, `vitest` and `@vitest/*`. Another host says here what is its
   * own. A file of the host is not server code: it keeps the browser's
   * `typeof window` and `fetch`, and Next's compiler does not run on
   * it. With `"use client"` it is a module of the browser layer. A package of
   * the host is the one instance the page has, also in the browser layer.
   */
  host?: {
    /**
     * The files of the host, like the ones it renders: glob patterns,
     * relative to the project root. What a test file is to Vitest.
     *
     * @example ["host/**", "src/**\/*.demo.tsx"]
     */
    files?: string | RegExp | (string | RegExp)[];
    /**
     * The packages of the host, by name. A name that ends in `/*` is every
     * package of that scope the project has, or every module under that path
     * of a package, like `host-kit/internal/*`. A module of a package, like
     * `host-kit/test`, is the page's own, and the package's other modules
     * are not, but the files of the whole package are the host's runtime in
     * the rsc layer. What they depend on is the host's too, but for this
     * plugin and what it depends on, which a framework of the host can
     * depend on.
     *
     * Not something the plugin can read off the files: a file of the host
     * with `"use client"` imports `react` and `host-kit/test` the same way,
     * and the first has to be the browser layer's React, where the second
     * has to be the page's own module, whose spies the host shows. What
     * `vitest` is to a test file. The same list keeps the host's runtime
     * the browser's in the rsc layer, where every other package is server
     * code.
     *
     * A package of the list that the browser layer imports only from inside
     * another package reaches the rsc layer through the page, which no scan
     * of Vite's reads: list it in `optimizeDeps.include` too, or Vite
     * pre-bundles it as the first page loads.
     *
     * @example ["host-kit/test", "host-kit/preview"]
     */
    packages?: string[];
  };
};
//#endregion
//#region src/nextjs/plugin.d.ts
type VitestPluginNextOptions = ServerCodeOptions & {
  /**
   * Experimental. The code that Next's runtime and React run, in all three
   * layers: `"development"` as `next dev` runs it, `"production"` as
   * `next start` runs it after `next build`. Production renders faster,
   * without what the development code checks and reports. In a test run
   * the app's `process.env.NODE_ENV` stays as it is, in a static build it is
   * the build. See docs/internals/next-routes.md, "Development Or Production".
   *
   * @default `"development"` for a test run and a dev server, `"production"`
   * for `vite build`, a static build of the app
   */
  build?: NextBuild;
  /**
   * Experimental. A fast mode for a quick feedback loop, like an agent's or
   * a watch run's, which gives up some of what a test sees of a browser. A
   * suite that passes in fast mode is to pass without it too, as in CI.
   *
   * `true` turns on every feature of it, `false` none. An object is fast mode
   * with exceptions: a feature it sets to `false` is off, and every other is
   * on, so `{ crypto: false }` is fast mode with the real password hashes. To
   * run one feature alone, set every other to `false`. The features, by
   * their flags in `FastOptions`:
   *
   * - `keepApp`: the pages of a test file render in one app: the first page
   *   starts it, and every `renderServer({ url })` after it renders its page
   *   in it, from the page's Flight payload, without a page load. Each page
   *   gets a tree, a router and caches of the router of its own, so no state
   *   of a component carries over from one test to the next. What does is
   *   the state of the modules of the app, of a package and of Next and
   *   React, as in a single-page app that never reloads. The server renders
   *   no HTML (`ssr: false`): a test that asserts on it passes `ssr: true`,
   *   and gets a page load of its own. In development the page has no dev
   *   overlay.
   * - `skipPrefetch`: Next's `<Link>` and `<Form>` prefetch nothing.
   * - `immediates`: the server runs the steps of a render, which React
   *   separates with `setTimeout(work, 0)`, without the delay a browser adds
   *   to a timeout, unless the test has faked the timers.
   * - `watchDom`: `expect.element()` looks for an element again on every
   *   change of the DOM, not after a growing wait, and `expect.poll()` every
   *   5 ms unless the config sets `expect.poll.interval`.
   * - `cacheDevServer`: what the dev server answers about the stylesheets and
   *   the modules of a test file is asked once per test file, not for every
   *   page.
   * - `crypto`: password hashes and key derivations cost microseconds, with
   *   the same API, for the server code in the page and the test files:
   *   PBKDF2 of `crypto.subtle`, `pbkdf2`, `scrypt` and `argon2` of
   *   `node:crypto`, and the packages bcryptjs, bcrypt, @node-rs/bcrypt,
   *   argon2, @node-rs/argon2 and the scrypt, pbkdf2 and argon2 of
   *   @noble/hashes, which Better Auth hashes with. A hash a test makes
   *   verifies in the app, and a password verifies against its own hash
   *   only. It is one SHA-256: never a password hash outside a test, and the
   *   plugin gives it to a test run of Vitest only, never to a build. A hash
   *   made by the real algorithm, like one in a fixture, does not verify
   *   under a stand-in: bcrypt's and Argon2's throw an error that says so.
   *   See docs/nodejs-in-the-browser.md, "Fast crypto".
   *
   * @default `true` when the environment variable `VITEST_PLUGIN_RSC_FAST`
   * is `1`, else `false`
   */
  fast?: boolean | FastOptions;
};
declare function vitestPluginNext(options?: VitestPluginNextOptions): Plugin[];
//#endregion
export { type FastOptions, type NextBuild, type ResolvedFastOptions, VitestPluginNextOptions, vitestPluginNext };