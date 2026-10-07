// Runs Next's SWC transform on a fixture, as next-swc-loader does for the rsc layer.
const path = require("node:path");
const fs = require("node:fs");
const nextDir = fs.realpathSync("/tmp/next164");
const { getLoaderSWCOptions } = require(path.join(nextDir, "dist/build/swc/options.js"));
const swc = require(path.join(nextDir, "dist/build/swc/index.js"));
const { WEBPACK_LAYERS } = require(path.join(nextDir, "dist/lib/constants.js"));

async function run(file, { layer = WEBPACK_LAYERS.reactServerComponents, useCacheEnabled = true, serverActions = true, development = false } = {}) {
  const filename = path.resolve(file);
  const source = fs.readFileSync(filename, "utf8");
  await swc.loadBindings();
  const options = getLoaderSWCOptions({
    filename, development, isServer: true, pagesDir: undefined, appDir: path.dirname(filename),
    isPageFile: false, isCacheComponents: true, hasReactRefresh: false, configDir: path.dirname(filename),
    modularizeImports: undefined, optimizeServerReact: false, optimizePackageImports: undefined,
    swcPlugins: undefined, compilerOptions: undefined, jsConfig: { compilerOptions: { jsx: "preserve" } }, supportedBrowsers: undefined,
    swcCacheDir: "/tmp/uc-research/spike/.swc", relativeFilePathFromRoot: path.basename(filename),
    serverComponents: true, serverReferenceHashSalt: "", bundleLayer: layer, esm: true,
    cacheHandlers: { custom: "x" }, useCacheEnabled, taintEnabled: false, trackDynamicImports: false, pageExtensions: ["tsx","ts","jsx","js"],
  });
  if (process.env.DUMP) console.error(JSON.stringify(options, null, 1));
  if (!serverActions) delete options.serverActions;
  if (process.env.ONLY) { // restricted: only the server-actions transform + syntax
    for (const k of Object.keys(options)) if (!["jsc","serverActions","filename","sourceMaps","inlineSourcesContent","sourceFileName","isModule"].includes(k)) delete options[k];
  }
  if (process.env.KEEPJSX) options.jsc.transform.react = undefined, options.jsc.parser.tsx = true;
  const out = await swc.transform(source, { ...options, filename, sourceMaps: false, inputSourceMap: undefined, sourceFileName: filename });
  return out.code;
}
module.exports = { run };
if (require.main === module) {
  (async () => {
    for (const file of process.argv.slice(2)) {
      console.log(`\n===== ${file} =====`);
      try { console.log(await run(file)); } catch (e) { console.log("ERROR:", String(e.message ?? e).slice(0, 1500)); }
    }
    process.exit(0);
  })();
}
