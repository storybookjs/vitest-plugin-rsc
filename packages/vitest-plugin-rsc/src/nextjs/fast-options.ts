// The features of fast mode, `fast` of `vitestPluginNext()` (plugin.ts), and
// which of them an option turns on. A module of its own, without imports:
// the plugin, the registry and fast-mode.ts, in the page, all read the type.

/**
 * The features of fast mode, `fast` of `vitestPluginNext()`, each by its
 * flag: one that is not listed is on, and one set to `false` is off.
 */
export type FastOptions = {
  /** The pages of a test file render in one app, from their Flight payload, without HTML of the server. */
  keepApp?: boolean;
  /** `<Link>` and `<Form>` prefetch nothing. */
  skipPrefetch?: boolean;
  /** Server code's timeouts of no delay run as immediates, unless the timers are faked. */
  immediates?: boolean;
  /** `expect.element()` looks again on every change of the DOM, and `expect.poll()` every 5 ms. */
  watchDom?: boolean;
  /** What the dev server answers about a test file's files is asked once per file. */
  cacheDevServer?: boolean;
  /** Password hashes and key derivation cost microseconds, with the same API. */
  crypto?: boolean;
};

/** Which features of fast mode are on: `fast` of `vitestPluginNext()`, resolved. */
export type ResolvedFastOptions = Required<FastOptions>;

const fastFeatures = [
  "keepApp",
  "skipPrefetch",
  "immediates",
  "watchDom",
  "cacheDevServer",
  "crypto",
] as const satisfies (keyof FastOptions)[];

/**
 * The features of fast mode that `option`, the `fast` option, turns on:
 * all of them for `true`, none for `false`, and for an object every one it
 * does not set to `false`. Without the option, `VITEST_PLUGIN_RSC_FAST=1`
 * of `env` is `true`.
 */
export function resolveFast(
  option: boolean | FastOptions | undefined,
  env: Record<string, string | undefined>,
): ResolvedFastOptions {
  const fast = option ?? env.VITEST_PLUGIN_RSC_FAST === "1";
  return Object.fromEntries(
    fastFeatures.map((feature) => [
      feature,
      typeof fast === "object" ? fast[feature] !== false : fast,
    ]),
  ) as ResolvedFastOptions;
}
