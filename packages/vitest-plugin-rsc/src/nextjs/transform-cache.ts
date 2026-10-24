import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizePath, version as viteVersion, type DevEnvironment, type Plugin } from "vite";

// Vite compiles every module it serves at every start of its dev server: it
// keeps what it compiled in memory only. For the pre-bundled dependencies of
// a test run that is about 100 modules and 8 MB of code per layer, which the
// page asks for before its first test, and which are the same at every start:
// a pre-bundled chunk is a file of the optimizer, whose URL has the hash of
// its build (`?v=`). So what Vite makes of one, with every plugin's
// transform, is kept on disk, in the project's `node_modules/.cache/`, as the
// scan of client boundaries is (plugin.ts), and a start reads it there.
//
// What is kept is keyed by everything the compile of a chunk depends on: the
// file (its size and time of change), its URL with the optimizer's hash, the
// optimizer's hash of the lockfile and the config, the environment, its
// plugins by name and its `define`, the versions of Vite and Vitest, and the
// code of this plugin. The module graph gets the result as Vite's compile
// sets it, with what the module imports. The version of the format is in the
// name of the directory.

type Cached = {
  code: string;
  map: unknown;
  etag?: string;
  deps?: string[];
  dynamicDeps?: string[];
};

/**
 * The dev server's compiled pre-bundled dependencies, on disk across starts.
 * `codeKey` is the key of this plugin's code (optimizer-cache-key.ts).
 */
export function transformCachePlugin(options: {
  enabled: () => boolean;
  codeKey: () => string;
  vitestVersion: () => string;
}): Plugin {
  return {
    name: "vitest-plugin-rsc:next-transform-cache",
    configureServer(server) {
      if (!options.enabled()) return;
      const dir = path.join(server.config.root, "node_modules/.cache/vitest-plugin-rsc/transforms-1");
      const cacheDir = `${normalizePath(server.config.cacheDir)}/`;
      const common = [viteVersion, options.vitestVersion(), options.codeKey(), server.config.mode];
      for (const environment of Object.values(server.environments)) {
        cacheTransforms(environment, dir, cacheDir, common);
      }
    },
  };
}

function cacheTransforms(
  environment: DevEnvironment,
  dir: string,
  cacheDir: string,
  common: string[],
): void {
  const transformRequest = environment.transformRequest.bind(environment);
  const warmupRequest = environment.warmupRequest.bind(environment);
  // A pre-bundled chunk, by its URL with the optimizer's hash.
  const start = cacheDir.indexOf("/node_modules/");
  const chunkPath = start === -1 ? cacheDir : cacheDir.slice(start);
  const isChunk = (url: string) => /[?&]v=/.test(url) && normalizePath(url).includes(chunkPath);
  let environmentKey: string | undefined;
  const keyOfEnvironment = () =>
    (environmentKey ??= JSON.stringify([
      ...common,
      environment.name,
      environment.plugins.map((plugin) => plugin.name),
      JSON.stringify(environment.config.define ?? {}),
    ]));
  const results = new Map<string, ReturnType<typeof transformRequest>>();
  const cached = (url: string) => {
    let result = results.get(url);
    if (!result) {
      result = compileOnce(url);
      results.set(url, result);
    }
    return result;
  };
  const compileOnce = async (url: string) => {
    const module = await environment.moduleGraph.ensureEntryFromUrl(url);
    if (module.transformResult) return module.transformResult;
    const metadata = environment.depsOptimizer?.metadata;
    const stats = module.file ? fs.statSync(module.file, { throwIfNoEntry: false }) : undefined;
    if (!stats || !metadata) return transformRequest(url);
    const key = createHash("sha256")
      .update(keyOfEnvironment())
      .update(`\0${url}\0${stats.size}\0${stats.mtimeMs}\0${metadata.hash}\0${metadata.browserHash}`)
      .digest("hex")
      .slice(0, 32);
    const file = path.join(dir, `${key}.json`);
    try {
      const hit = JSON.parse(fs.readFileSync(file, "utf8")) as Cached;
      const result = {
        code: hit.code,
        map: hit.map ?? null,
        etag: hit.etag,
        deps: hit.deps,
        dynamicDeps: hit.dynamicDeps,
      } as NonNullable<Awaited<ReturnType<typeof transformRequest>>>;
      module.transformResult = result;
      return result;
    } catch {}
    const result = await transformRequest(url);
    if (result) {
      // By a rename, so that a run that reads it at the same time reads all
      // of it. A disk that cannot be written to only means the compile again.
      try {
        fs.mkdirSync(dir, { recursive: true });
        const written = `${file}.${process.pid}`;
        const { code, map, etag, deps, dynamicDeps } = result;
        fs.writeFileSync(written, JSON.stringify({ code, map, etag, deps, dynamicDeps }));
        fs.renameSync(written, file);
      } catch {}
    }
    return result;
  };
  environment.transformRequest = (url) => (isChunk(url) ? cached(url) : transformRequest(url));
  environment.warmupRequest = (url) =>
    isChunk(url) ? cached(url).then(() => {}, () => {}) : warmupRequest(url);
}
