// The mode of `vitestPluginNext()` (plugin.ts) and its speed features: the
// one list of them, their options, and which of them are on. A module of its
// own, without imports: the plugin, the registry and fast-mode.ts, in the
// page, all read the types.

/**
 * What a test run gives up for speed. `"fidelity"`, the default, gives up
 * nothing: a test sees what a browser shows of the app, as CI is to run it.
 * `"fast"` turns on every speed feature, for a quick feedback loop, like an
 * agent's or a watch run's, which gives up some of that. A suite that passes
 * in fast mode is to pass in fidelity mode too.
 */
export type Mode = "fidelity" | "fast";

/**
 * The speed features, each an option of `vitestPluginNext()` of its own:
 * `true` is the faster behaviour, `false` the faithful one. One that is not
 * set follows `mode`. A new feature is an option here, with what it changes
 * and gives up, and a line in `featureSet` below.
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
export type Feature = keyof SpeedOptions;

/** Which speed features are on: `mode` and the options of the features, resolved. */
export type Features = Required<SpeedOptions>;

// Every speed feature: the type has the compiler list each one here.
const featureSet: Record<Feature, true> = {
  keepApp: true,
  skipPrefetch: true,
  immediates: true,
  watchDom: true,
  cacheDevServer: true,
  fastCrypto: true,
};

/** Every speed feature, in the order of `SpeedOptions`. */
export const features = Object.keys(featureSet) as Feature[];

const modes: readonly Mode[] = ["fidelity", "fast"];

/** The options of `vitestPluginNext()` that choose the speed features. */
export type ModeOptions = SpeedOptions & {
  /**
   * Experimental. `"fidelity"`, a test run that gives up nothing for speed,
   * or `"fast"`, every speed feature on: see `Mode`. An option of a feature,
   * like `fastCrypto: false` or `watchDom: true`, overrides the mode.
   *
   * @default the environment variable `VITEST_PLUGIN_RSC_MODE`, `fast` or
   * `fidelity`, else `"fidelity"`
   */
  mode?: Mode;
};

/**
 * The speed features that `options` turn on: every one that is set as it is
 * set, and the others as `mode` has them, all on for `"fast"` and all off
 * for `"fidelity"`. Without `mode`, `VITEST_PLUGIN_RSC_MODE` of `env`
 * chooses it, else it is `"fidelity"`. Throws for an unknown mode.
 */
export function resolveMode(
  options: ModeOptions,
  env: Record<string, string | undefined>,
): Features {
  const mode = options.mode ?? (env.VITEST_PLUGIN_RSC_MODE || "fidelity");
  if (!modes.includes(mode as Mode)) {
    const source = options.mode === undefined ? "VITEST_PLUGIN_RSC_MODE" : "`mode`";
    throw new Error(
      `vitest-plugin-rsc: ${source} is "fidelity" or "fast", not ${JSON.stringify(mode)}.`,
    );
  }
  return Object.fromEntries(
    features.map((feature) => [feature, options[feature] ?? mode === "fast"]),
  ) as Features;
}
