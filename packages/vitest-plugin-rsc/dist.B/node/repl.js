import { builtinModules as builtinModules$1 } from "node:module";
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/repl.mjs
const writer = /* @__PURE__ */ notImplementedClass("repl.writer");
const start = /* @__PURE__ */ notImplemented("repl.start");
const Recoverable = /* @__PURE__ */ notImplementedClass("repl.Recoverable");
const REPLServer = /* @__PURE__ */ notImplementedClass("repl.REPLServer");
const REPL_MODE_SLOPPY = /* @__PURE__ */ Symbol("repl-sloppy");
const REPL_MODE_STRICT = /* @__PURE__ */ Symbol("repl-strict");
const builtinModules = /* @__PURE__ */ builtinModules$1.filter((m) => m[0] !== "_");
const _builtinLibs = builtinModules;
var repl_default = {
	writer,
	start,
	Recoverable,
	REPLServer,
	builtinModules,
	_builtinLibs,
	REPL_MODE_SLOPPY,
	REPL_MODE_STRICT
};
//#endregion
export { REPLServer, REPL_MODE_SLOPPY, REPL_MODE_STRICT, Recoverable, _builtinLibs, builtinModules, repl_default as default, start, writer };
