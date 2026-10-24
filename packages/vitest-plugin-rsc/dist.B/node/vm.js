//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
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
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/vm/script.mjs
var Script = class {
	runInContext(contextifiedObject, options) {
		throw /* @__PURE__ */ createNotImplementedError("Script.runInContext");
	}
	runInNewContext(contextObject, options) {
		throw /* @__PURE__ */ createNotImplementedError("Script.runInNewContext");
	}
	runInThisContext(options) {
		throw /* @__PURE__ */ createNotImplementedError("Script.runInThisContext");
	}
	createCachedData() {
		throw /* @__PURE__ */ createNotImplementedError("Script.createCachedData");
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/vm/constants.mjs
var constants_exports = /* @__PURE__ */ __exportAll({
	DONT_CONTEXTIFY: () => DONT_CONTEXTIFY,
	USE_MAIN_CONTEXT_DEFAULT_LOADER: () => USE_MAIN_CONTEXT_DEFAULT_LOADER
});
const USE_MAIN_CONTEXT_DEFAULT_LOADER = /* @__PURE__ */ Symbol("vm_dynamic_import_main_context_default");
const DONT_CONTEXTIFY = /* @__PURE__ */ Symbol("vm_context_no_contextify");
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/vm.mjs
const compileFunction = /* @__PURE__ */ notImplemented("vm.compileFunction");
const _contextSymbol = /* @__PURE__ */ Symbol("uenv.vm.context");
const createContext = function createContext() {
	return Object.create(null, { [_contextSymbol]: { value: true } });
};
const createScript = function createScript() {
	return new Script();
};
const isContext = (context) => {
	return context && context[_contextSymbol] === true;
};
const measureMemory = () => Promise.resolve({
	total: {
		jsMemoryEstimate: 0,
		jsMemoryRange: [1, 2]
	},
	WebAssembly: {
		code: 0,
		metadata: 0
	}
});
const runInContext = /* @__PURE__ */ notImplemented("vm.runInContext");
const runInNewContext = /* @__PURE__ */ notImplemented("vm.runInNewContext");
const runInThisContext = /* @__PURE__ */ notImplemented("vm.runInThisContext");
var vm_default = {
	Script,
	compileFunction,
	constants: constants_exports,
	createContext,
	isContext,
	measureMemory,
	runInContext,
	runInNewContext,
	runInThisContext,
	createScript
};
//#endregion
export { Script, compileFunction, constants_exports as constants, createContext, createScript, vm_default as default, isContext, measureMemory, runInContext, runInNewContext, runInThisContext };
