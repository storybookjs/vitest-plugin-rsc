import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loadNextBuild } from "../compat/build.ts";
import { pageEnvOf, readTestEnv } from "./env.ts";

// The project, and the build code of its own `next`: what the other files in
// this directory work with. The modules of Next's build that the plugin calls
// are loaded by compat/build.ts, where they are first read: one that is gone,
// or an export that is gone, fails with the same message there.

// Next runs a compiled `next.config.ts` as a module without a filename, so
// Node looks up a relative import of the config, like `./env/server.ts`, from
// the working directory. For `next build` that is the project. Vitest loads
// the projects of a workspace in one process, so they take turns to have it.
const workingDirectory = process.cwd();
let directoryQueue: Promise<unknown> = Promise.resolve();

export function inDirectory<T>(directory: string, load: () => Promise<T>): Promise<T> {
  const result = directoryQueue.then(async () => {
    process.chdir(directory);
    try {
      return await load();
    } finally {
      process.chdir(workingDirectory);
    }
  });
  directoryQueue = result.catch(() => {});
  return result;
}

/** The file of a module of Next by its path, which may leave out `.js` or `/index.js`. */
export function moduleFileAt(base: string): string | undefined {
  return [base, `${base}.js`, path.join(base, "index.js")].find((candidate) =>
    fs.statSync(candidate, { throwIfNoEntry: false })?.isFile(),
  );
}

/** The project and its `next`, as `openNextProject()` loads them. */
export type NextContext = Awaited<ReturnType<typeof openNextProject>>;

export async function openNextProject(
  root: string,
  projectRequire: NodeJS.Require,
  options: {
    static?: boolean;
    /** The file of env-worker.ts. */
    envWorker: string;
  },
) {
  const nextDir = path.dirname(projectRequire.resolve("next/package.json"));
  const { version } = projectRequire("next/package.json") as { version: string };
  const [major = 0, minor = 0] = version.split(".").map(Number);
  // 16.4 is where Next's request stores became one per realm, which is what
  // lets the layers run as separate module graphs.
  if (major < 16 || (major === 16 && minor < 4)) {
    throw new Error(`vitest-plugin-rsc/nextjs needs next@16.4 or later, found next@${version}.`);
  }
  const fail = (what: string, cause?: unknown): never => {
    throw new Error(
      `vitest-plugin-rsc: next@${version} differs from the Next.js this plugin was written for: ` +
        `${what}. Use a version of vitest-plugin-rsc that supports next@${version}.`,
      { cause },
    );
  };
  // A piece of the code Next generates that is replaced for Vite.
  const replace = (code: string, piece: string | RegExp, replacement: string, where: string) => {
    const replaced = code.replace(piece, replacement);
    return replaced === code ? fail(`${where} has no \`${piece}\` to replace`) : replaced;
  };

  const { loadConfig, PHASE_PRODUCTION_BUILD, findPagesDir, generateBuildId, ...next } =
    loadNextBuild(projectRequire, fail);

  // The env of the run, see env.ts, with the `@next/env` that Next's config
  // loader uses.
  let nextEnv: string;
  try {
    nextEnv = createRequire(path.join(nextDir, "package.json")).resolve("@next/env");
  } catch (error) {
    return fail(`@next/env is not found next to next (${(error as Error).message})`, error);
  }
  const readEnv = () =>
    readTestEnv(root, { nextEnv, envWorker: options.envWorker, build: !!options.static }).catch(
      (error: Error) => {
        throw new Error(
          `vitest-plugin-rsc: the env files of ${root} do not load: ${error.message}`,
          {
            cause: error,
          },
        );
      },
    );
  const testEnv = await readEnv();
  // Before the config is loaded, for the names the host's process does not
  // have, so that a `next.config` that validates the env, as with t3-env,
  // sees the env of the page. Next's loader in `loadConfig()` then keeps
  // them, as it keeps any name of the process. A host that loaded env files
  // of its own before, like `.env.local`, keeps its value of a name that the
  // test env has too: the config is validated with that value, and a config
  // that reads it gets that one, while the page gets the test env's. Where
  // the host called Next's loader first, the names are not in the snapshot
  // of the process that it took, and a forced reload of it would drop them.
  for (const [name, value] of Object.entries(testEnv.values)) process.env[name] ??= value;

  // The app is served the way a deployment serves it: production Next on its
  // Node.js runtime. Next's code and React's run in development unless the
  // `build` option says otherwise, see build.ts.
  const loadedConfig = await inDirectory(root, () =>
    loadConfig(PHASE_PRODUCTION_BUILD, root, { silent: true }),
  );
  // Without `i18n`, which is the Pages Router's: a URL of the App Router has
  // no locale. With it, Next's route resolution and its proxy look for one in
  // every URL, and find no route of the app.
  //
  // And without Cached Navigations, which Cache Components turns on. With it
  // Next renders a page in stages, so that the browser can keep the static
  // part of a page it navigated to, and the stages lean on the order of
  // `setImmediate` in Node's event loop: the stand-in for
  // `fast-set-immediate.external` throws there. What the server caches is the
  // same without it.
  const config = {
    ...loadedConfig,
    i18n: null,
    experimental: { ...loadedConfig.experimental, cachedNavigations: false },
    // A static build has no server to optimize an image. An app with a
    // loader of its own, like a CDN, keeps it.
    ...(options.static &&
      (loadedConfig.images?.loader ?? "default") === "default" &&
      !loadedConfig.images?.loaderFile && {
        images: { ...loadedConfig.images, unoptimized: true },
      }),
  };
  const { appDir } = findPagesDir(root);
  if (!appDir) {
    throw new Error(`vitest-plugin-rsc: no \`app\` directory found in ${root}`);
  }
  const { pageExtensions } = config;
  const distDir = path.join(root, config.distDir);
  // Next's SWC, before the routes are discovered: Next parses a metadata file
  // like `sitemap.ts` with it for `generateSitemaps`, which gives its route an
  // id, `/sitemap/[__metadata_id__]`. Without the bindings that parse fails
  // and says nothing.
  await next.swc.loadBindings(config.experimental.useWasmBinary);

  const buildId = await generateBuildId(config.generateBuildId, () => "vitest");
  // What a build writes to `.next/` for its server: the build id and the keys
  // of draft mode. A build makes up the keys; here they are the same on every
  // run, so that the pre-bundled dependencies they are compiled into stay
  // cached. cache.ts gives them to Next's server.
  const buildEnvironment = {
    __NEXT_BUILD_ID: buildId,
    __NEXT_PREVIEW_MODE_ID: "vitest-preview-mode-id",
    __NEXT_PREVIEW_MODE_SIGNING_KEY: "vitest-preview-mode-signing-key",
    __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: "vitest-preview-mode-encryption-key".padEnd(64, "0"),
  };
  const previewProps = {
    previewModeId: buildEnvironment.__NEXT_PREVIEW_MODE_ID,
    previewModeSigningKey: buildEnvironment.__NEXT_PREVIEW_MODE_SIGNING_KEY,
    previewModeEncryptionKey: buildEnvironment.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY,
  };

  return {
    root,
    /** What the page's `process.env` gets, see env.ts. */
    env: pageEnvOf(testEnv, next.getNextConfigEnv(config)),
    /** The env again, as the env files have it now. */
    loadEnv: async () => pageEnvOf(await readEnv(), next.getNextConfigEnv(config)),
    /** Finds `next`, and what the project has installed next to it. Not the global one. */
    projectRequire,
    nextDir,
    version,
    fail,
    replace,
    config,
    appDir,
    pageExtensions,
    distDir,
    buildId,
    buildEnvironment,
    previewProps,
    /** The build code of the installed `next`, see compat/build.ts. */
    next,
  };
}
