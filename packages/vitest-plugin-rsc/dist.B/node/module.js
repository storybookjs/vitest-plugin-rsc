//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/_internal/utils.mjs
/* @__NO_SIDE_EFFECTS__ */
function createNotImplementedError(name) {
	return /* @__PURE__ */ new Error(`[unenv] ${name} is not implemented yet!`);
}
/* @__NO_SIDE_EFFECTS__ */
function notImplemented(name) {
	const fn = () => {
		throw /* @__PURE__ */ createNotImplementedError(name);
	};
	return Object.assign(fn, { __unenv__: true });
}
/* @__NO_SIDE_EFFECTS__ */
function notImplementedClass(name) {
	return class {
		__unenv__ = true;
		constructor() {
			throw new Error(`[unenv] ${name} is not implemented yet!`);
		}
	};
}
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/module.mjs
const _cache = Object.create(null);
const _extensions = {
	".js": /* @__PURE__ */ notImplemented("module.require.extensions['.js']"),
	".json": /* @__PURE__ */ notImplemented("module.require.extensions['.json']"),
	".node": /* @__PURE__ */ notImplemented("module.require.extensions['.node']")
};
const createRequire$1 = function(_filename) {
	return Object.assign(/* @__PURE__ */ notImplemented("module.require"), {
		resolve: Object.assign(/* @__PURE__ */ notImplemented("module.require.resolve"), { paths: /* @__PURE__ */ notImplemented("module.require.resolve.paths") }),
		cache: Object.create(null),
		extensions: _extensions,
		main: void 0
	});
};
const getCompileCacheDir = function() {};
const enableCompileCache = function(_cacheDir) {
	return {
		status: 0,
		message: "not implemented"
	};
};
const constants = Object.freeze({ compileCacheStatus: Object.freeze({
	FAILED: 0,
	ENABLED: 1,
	ALREADY_ENABLED: 2,
	DISABLED: 3
}) });
const builtinModules = [
	"_http_agent",
	"_http_client",
	"_http_common",
	"_http_incoming",
	"_http_outgoing",
	"_http_server",
	"_stream_duplex",
	"_stream_passthrough",
	"_stream_readable",
	"_stream_transform",
	"_stream_wrap",
	"_stream_writable",
	"_tls_common",
	"_tls_wrap",
	"assert",
	"assert/strict",
	"async_hooks",
	"buffer",
	"child_process",
	"cluster",
	"console",
	"constants",
	"crypto",
	"dgram",
	"diagnostics_channel",
	"dns",
	"dns/promises",
	"domain",
	"events",
	"fs",
	"fs/promises",
	"http",
	"http2",
	"https",
	"inspector",
	"inspector/promises",
	"module",
	"net",
	"os",
	"path",
	"path/posix",
	"path/win32",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"readline/promises",
	"repl",
	"stream",
	"stream/consumers",
	"stream/promises",
	"stream/web",
	"string_decoder",
	"sys",
	"timers",
	"timers/promises",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"util/types",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib"
];
const isBuiltin = function(id) {
	return id.startsWith("node:") || builtinModules.includes(id);
};
const runMain = /* @__PURE__ */ notImplemented("module.runMain");
const register = /* @__PURE__ */ notImplemented("module.register");
const syncBuiltinESMExports = function() {
	return [];
};
const findSourceMap$1 = function(path, error) {};
const flushCompileCache = function flushCompileCache() {};
const wrap = function(source) {
	return `(function (exports, require, module, __filename, __dirname) { ${source}\n});`;
};
const wrapper = ["(function (exports, require, module, __filename, __dirname) { ", "\n});"];
const stripTypeScriptTypes = /* @__PURE__ */ notImplemented("module.stripTypeScriptTypes");
const SourceMap = /* @__PURE__ */ notImplementedClass("module.SourceMap");
const _debug = console.debug;
const _findPath = /* @__PURE__ */ notImplemented("module._findPath");
const _initPaths = /* @__PURE__ */ notImplemented("module._initPaths");
const _load = /* @__PURE__ */ notImplemented("module._load");
const _nodeModulePaths = /* @__PURE__ */ notImplemented("module._nodeModulePaths");
const _preloadModules = /* @__PURE__ */ notImplemented("module._preloadModules");
const _resolveFilename = /* @__PURE__ */ notImplemented("module._resolveFilename");
const _resolveLookupPaths = /* @__PURE__ */ notImplemented("module._resolveLookupPaths");
const _stat = /* @__PURE__ */ notImplemented("module._stat");
const _readPackage = /* @__PURE__ */ notImplemented("module._readPackage");
const findPackageJSON = /* @__PURE__ */ notImplemented("module.findPackageJSON");
const getSourceMapsSupport = /* @__PURE__ */ notImplemented("module.getSourceMapsSupport");
const setSourceMapsSupport = /* @__PURE__ */ notImplemented("module.setSourceMapsSupport");
const _pathCache = Object.create(null);
const globalPaths = ["node_modules"];
const Module = {
	get Module() {
		return Module;
	},
	SourceMap,
	_cache,
	_extensions,
	_debug,
	_pathCache,
	_findPath,
	_initPaths,
	_load,
	_nodeModulePaths,
	_preloadModules,
	_resolveFilename,
	_resolveLookupPaths,
	_stat,
	_readPackage,
	builtinModules,
	constants,
	createRequire: createRequire$1,
	enableCompileCache,
	findSourceMap: findSourceMap$1,
	getCompileCacheDir,
	globalPaths,
	isBuiltin,
	register,
	runMain,
	syncBuiltinESMExports,
	wrap,
	wrapper,
	flushCompileCache,
	stripTypeScriptTypes,
	findPackageJSON,
	getSourceMapsSupport,
	setSourceMapsSupport
};
//#endregion
//#region src/node/module.ts
const missing = (name) => function() {
	throw new Error(`vitest-plugin-rsc: ${name} of Node.js is not there in the browser`);
};
const findSourceMap = () => void 0;
const createRequire = () => Object.assign(missing("module.createRequire()'s require"), {
	resolve: missing("module.createRequire()'s require.resolve"),
	cache: {}
});
var module_default = {
	...Module,
	findSourceMap,
	createRequire
};
//#endregion
export { Module, SourceMap, _cache, _debug, _extensions, _findPath, _initPaths, _load, _nodeModulePaths, _pathCache, _preloadModules, _readPackage, _resolveFilename, _resolveLookupPaths, _stat, builtinModules, constants, createRequire, module_default as default, enableCompileCache, findPackageJSON, findSourceMap, flushCompileCache, getCompileCacheDir, getSourceMapsSupport, globalPaths, isBuiltin, register, runMain, setSourceMapsSupport, stripTypeScriptTypes, syncBuiltinESMExports, wrap, wrapper };
