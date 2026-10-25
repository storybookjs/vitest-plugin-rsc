// The mode of `vitestPluginNext()` (plugin.ts) and its speed features: the
// one list of them, their options, and which of them are on. Without
// imports: the plugin, the registry and speed-features.ts, in the page, all
// read its types.

/**
 * What a test run gives up for speed. `"fidelity"`, the default, gives up
 * nothing: a test sees what a browser shows of the app, as CI is to run it.
 * `"fast"` turns on every speed feature, for a quick feedback loop, like an
 * agent's or a watch run's, which gives up some of that. A suite that passes
 * in fast mode is to pass in fidelity mode too.
 */
export type Mode = "fidelity" | "fast";

// A new speed feature is an option here, with what it changes and gives up,
// and a line in `inFidelityMode` below.
/**
 * The speed features, each an option of `vitestPluginNext()` of its own:
 * `true` is the faster behavior, `false` the faithful one. One that is not
 * set follows `mode`, but for `watchDom`, which gives up nothing and is on
 * in both modes.
 */
export type SpeedOptions = {
  /**
   * Experimental. The pages of a test file render in one app: the first
   * page starts it, and every `renderServer({ url })` after it renders its
   * page in it, from the page's Flight payload, without a page load. The
   * first `renderServer({ url })` after the page heard of a change of a
   * module of the browser layer starts a new app, with the modules as they
   * are now.
   *
   * Gives up: a fresh page per test. Each page gets a tree, a router and
   * caches of the router of its own, so no state of a component carries
   * over from one test to the next. What does is the state of the modules
   * of the app, of a package and of Next and React, as in a single-page app
   * that never reloads, and so is what they took of the window as they
   * loaded: Next reports the error of a page with the `reportError` it
   * found then, which a spy of a later test does not see. The server
   * renders no HTML (`ssr: false`), also not of a page that the app loads
   * itself from one of these, like after a `<form>` without a Server
   * Action, so no preload of the HTML or its `Link` header, and no status
   * of the HTML's render: a page that is not found or fails to render is a
   * 200, and without `flightLoads`, one that redirects opens as itself, and
   * Next's router redirects it after `renderServer()`. A test that asserts
   * on them passes `ssr: true`, and gets a page load of its own. In
   * development the page has no dev overlay.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  keepApp?: boolean;
  /**
   * Experimental. A page of the kept app, one of `renderServer({ url })` or
   * one that the app loads itself with a `GET`, is requested as Next's
   * router requests a page, with `RSC: 1`: the server renders no HTML for
   * it, and the page parses no document. Of the kept app only: without
   * `keepApp` it changes nothing.
   *
   * Gives up: the `response` of `renderServer()` is the one of Flight,
   * `text/x-component`, not the document's. A route handler on the way, like
   * one that redirects to the page, sees `RSC: 1` in its request. A page
   * that the test leaves while it loads stops rendering on the server, where
   * the render of a document would go on: a test of a render that outlives
   * its page passes `ssr: true`.
   *
   * The server handles each page once. A page whose payload redirects, with
   * a `redirect()` anywhere in its render, Suspense or not, loads as its
   * target, as a browser follows the 307 of a document: with one request of
   * Flight of the target, and the `response` is the target's, with
   * `redirected` and the final URL. The 307 itself is not in it. A redirect
   * to another origin throws, as in fidelity mode. A `notFound()` or an
   * error renders its boundary from the payload, with the status 200 of the
   * response of Flight: the 404 or the 500 of a render that fails before
   * any of the document is out is not there, as it is not with `keepApp`
   * alone, whose document of `ssr: false` renders no HTML that could fail.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  flightLoads?: boolean;
  /**
   * Experimental. Next's router prefetches nothing: not for a `<Link>` or a
   * `<Form>`, nor for a `router.prefetch()` of the app.
   *
   * Gives up: a test sees no prefetch: no request of one, and no route
   * that renders from what one got. Next prefetches in production only, so
   * in development it gives up nothing.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  skipPrefetch?: boolean;
  /**
   * Experimental. The server's code runs a timeout of 0 as an immediate,
   * like those that React separates the steps of a render with, unless the
   * test has faked the timers.
   *
   * Gives up: the delay a browser adds to a timeout, at least 4 ms for one
   * that a timeout started, five deep: also for a timeout of 0 of the app's
   * own server code.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  immediates?: boolean;
  /**
   * Experimental. `expect.element()` and `expect.poll()` look again on the
   * next change of the document, not after a growing wait: a mutation of the
   * DOM, or an event of what changes without one, like `input` or the `load`
   * of a stylesheet; after 5 ms for what a script sets on a property. Not
   * with an interval of the poll's own, nor while the test's timers are fake:
   * those poll at that interval, or at `expect.poll.interval` of the config,
   * 5 ms where the config sets none. Else that option does not count.
   *
   * Gives up nothing: it changes when an assertion looks at the DOM, not
   * what it sees. Without it, Vitest waits between the looks, after 0, 20,
   * 50, 100, 100 and then every 500 ms, and a test sees most changes tens of
   * milliseconds late. On an M1 Pro, the 500 tests of the notes benchmark
   * took about 60 s without it and 26 s with it in fidelity mode, and 52 s
   * and 17 s in fast mode.
   *
   * Default: `true` in both modes.
   */
  watchDom?: boolean;
  /**
   * Experimental. A page load does not ask the dev server for the versions
   * of its modules: the page has the server's news of every change of them,
   * and asks once as a test file starts, and as it loads a file with
   * `"use client"` again. In a test run of Vitest only: the
   * page of a dev server of another host, like `storybook dev`, asks at
   * every page load.
   *
   * Gives up: a change that reaches the dev server through another
   * connection than the page's, like a request of the test that changes a
   * file, is seen once the server's news of it has arrived, which may be
   * after the next page load. A change of a file that the tests are watched
   * for runs the test file again.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  cacheDevServer?: boolean;
  /**
   * Experimental. Password hashes and key derivations cost microseconds,
   * with the same API, for the server code in the page and the test files:
   * PBKDF2 of `crypto.subtle`, `pbkdf2`, `scrypt` and `argon2` of
   * `node:crypto`, and the packages bcryptjs, bcrypt, @node-rs/bcrypt,
   * argon2, @node-rs/argon2 and the scrypt, pbkdf2 and argon2 of
   * @noble/hashes, which Better Auth hashes with. A hash a test makes
   * verifies in the app, and a password verifies against its own hash only.
   * It is one SHA-256: never a password hash outside a test, and the plugin
   * gives it to a test run of Vitest only, never to a build.
   *
   * Gives up: a hash made by the real algorithm, like one in a fixture, does
   * not verify under a stand-in: bcrypt's and Argon2's throw an error that
   * says so. See docs/nodejs-in-the-browser.md, "Fast crypto".
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  fastCrypto?: boolean;
};

/** A speed feature, by the name of its option. */
export type SpeedFeature = keyof SpeedOptions;

/** Which speed features are on: `mode` and the options of the features, resolved. */
export type SpeedFeatures = Required<SpeedOptions>;

// Every speed feature, and whether it is on in fidelity mode too: only one
// that gives up nothing is. The type has the compiler list each one here.
const inFidelityMode: Record<SpeedFeature, boolean> = {
  keepApp: false,
  flightLoads: false,
  skipPrefetch: false,
  immediates: false,
  watchDom: true,
  cacheDevServer: false,
  fastCrypto: false,
};

/** Every speed feature, in the order of `SpeedOptions`. */
const features = Object.keys(inFidelityMode) as SpeedFeature[];

const modes: readonly Mode[] = ["fidelity", "fast"];

/** The options of `vitestPluginNext()` that choose the speed features. */
export type ModeOptions = SpeedOptions & {
  /**
   * Experimental. `"fidelity"`, a test run that gives up nothing for speed,
   * or `"fast"`, every speed feature on: see `Mode`. An option of a feature,
   * like `fastCrypto: false` or `skipPrefetch: true`, overrides the mode.
   *
   * @default in a test run of Vitest the environment variable
   * `VITEST_PLUGIN_RSC_MODE`, `fast` or `fidelity`, else `"fidelity"`
   */
  mode?: Mode;
};

/**
 * The speed features that `options` turn on: every one that is set as it is
 * set, and the others as `mode` has them, all on for `"fast"` and all but
 * `watchDom` off for `"fidelity"`. Without `mode`, `VITEST_PLUGIN_RSC_MODE`
 * of `env` chooses it in a test run of Vitest, else it is `"fidelity"`.
 * Throws for an unknown mode.
 */
export function resolveSpeedFeatures(
  options: ModeOptions,
  env: Record<string, string | undefined>,
): SpeedFeatures {
  // The switch of a test run, as Vitest's own `VITEST` says: not of
  // `storybook dev` or a build, which a shell that exports it also starts.
  const fromEnv = env.VITEST === undefined ? undefined : env.VITEST_PLUGIN_RSC_MODE;
  const mode = options.mode ?? (fromEnv || "fidelity");
  if (!modes.includes(mode as Mode)) {
    const source = options.mode === undefined ? "`VITEST_PLUGIN_RSC_MODE`" : "`mode`";
    throw new Error(
      `vitest-plugin-rsc: ${source} is "fidelity" or "fast", not ${JSON.stringify(mode)}.`,
    );
  }
  return Object.fromEntries(
    features.map((feature) => [
      feature,
      options[feature] ?? (mode === "fast" || inFidelityMode[feature]),
    ]),
  ) as SpeedFeatures;
}
