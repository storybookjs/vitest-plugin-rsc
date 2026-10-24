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
// and a line in `featureSet` below.
/**
 * The speed features, each an option of `vitestPluginNext()` of its own:
 * `true` is the faster behavior, `false` the faithful one. One that is not
 * set follows `mode`.
 */
export type SpeedOptions = {
  /**
   * Experimental. The pages of a test file render in one app: the first
   * page starts it, and every `renderServer({ url })` after it renders its
   * page in it, from the page's Flight payload, without a page load.
   *
   * Gives up: a fresh page per test. Each page gets a tree, a router and
   * caches of the router of its own, so no state of a component carries
   * over from one test to the next. What does is the state of the modules
   * of the app, of a package and of Next and React, as in a single-page app
   * that never reloads. The server renders no HTML (`ssr: false`), also not
   * of a page that the app loads itself from one of these, like after a
   * `<form>` without a Server Action: a test that asserts on it passes
   * `ssr: true`, and gets a page load of its own. In development the page
   * has no dev overlay.
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
   * `text/x-component`, not the document's. The head has no
   * `<meta name="next-size-adjust">` of `next/font`, and no preload of a
   * font that no page before it preloaded. A route handler on the way, like
   * one that redirects to the page, sees `RSC: 1` in its request. A page
   * that the test leaves while it loads stops rendering on the server, where
   * the render of a document would go on: a test of a render that outlives
   * its page passes `ssr: true`. A page whose render calls `redirect()` is
   * followed as a browser follows the 307 of its document, with a request of
   * Flight of the page it redirects to: the `response` is that page's, with
   * `redirected`, and the 307 itself is not in it. A page that calls
   * `notFound()` or throws renders its boundary from the payload, with the
   * status 200 of the response of Flight, as the document of `ssr: false`
   * has it, where a document with HTML could have a 404 or a 500.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  flightLoads?: boolean;
  /**
   * Experimental. Next's `<Link>` and `<Form>` prefetch nothing.
   *
   * Gives up: a test sees no prefetch: no request of one, and no route
   * that renders from what one got.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  skipPrefetch?: boolean;
  /**
   * Experimental. The server runs the steps of a render, which React
   * separates with `setTimeout(work, 0)`, as immediates, unless the test has
   * faked the timers.
   *
   * Gives up: the delay a browser adds to a timeout, at least 4 ms for one
   * that a timeout started, five deep.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  immediates?: boolean;
  /**
   * Experimental. `expect.element()` looks for an element again on every
   * change of the DOM, not after a growing wait, and `expect.poll()` every
   * 5 ms unless the config sets `expect.poll.interval`.
   *
   * Gives up: Vitest's own waits between the looks, after 0, 20, 50, 100
   * and then every 500 ms.
   *
   * Default: `true` in fast mode, `false` in fidelity mode.
   */
  watchDom?: boolean;
  /**
   * Experimental. What the dev server answers about the stylesheets and the
   * modules of a test file is asked once per test file, not for every page.
   *
   * Gives up: an answer that changes while a test file runs, which nothing
   * does: a change of a file runs the test file again.
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

// Every speed feature: the type has the compiler list each one here.
const featureSet: Record<SpeedFeature, true> = {
  keepApp: true,
  flightLoads: true,
  skipPrefetch: true,
  immediates: true,
  watchDom: true,
  cacheDevServer: true,
  fastCrypto: true,
};

/** Every speed feature, in the order of `SpeedOptions`. */
const features = Object.keys(featureSet) as SpeedFeature[];

const modes: readonly Mode[] = ["fidelity", "fast"];

/** The options of `vitestPluginNext()` that choose the speed features. */
export type ModeOptions = SpeedOptions & {
  /**
   * Experimental. `"fidelity"`, a test run that gives up nothing for speed,
   * or `"fast"`, every speed feature on: see `Mode`. An option of a feature,
   * like `fastCrypto: false` or `watchDom: true`, overrides the mode.
   *
   * @default in a test run of Vitest the environment variable
   * `VITEST_PLUGIN_RSC_MODE`, `fast` or `fidelity`, else `"fidelity"`
   */
  mode?: Mode;
};

/**
 * The speed features that `options` turn on: every one that is set as it is
 * set, and the others as `mode` has them, all on for `"fast"` and all off
 * for `"fidelity"`. Without `mode`, `VITEST_PLUGIN_RSC_MODE` of `env`
 * chooses it in a test run of Vitest, else it is `"fidelity"`. Throws for an
 * unknown mode.
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
    features.map((feature) => [feature, options[feature] ?? mode === "fast"]),
  ) as SpeedFeatures;
}
