import { Writable } from "node:stream";
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {}, { __unenv__: true });
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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/console.mjs
const _console = globalThis.console;
const _ignoreErrors = true;
const _stderr = new Writable();
const _stdout = new Writable();
const log = _console?.log ?? noop_default;
const info = _console?.info ?? log;
const trace = _console?.trace ?? info;
const debug = _console?.debug ?? log;
const table = _console?.table ?? log;
const error = _console?.error ?? log;
const warn = _console?.warn ?? error;
const createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
const assert = /* @__PURE__ */ notImplemented("console.assert");
const clear = _console?.clear ?? noop_default;
const count = _console?.count ?? noop_default;
const countReset = _console?.countReset ?? noop_default;
const dir = _console?.dir ?? noop_default;
const dirxml = _console?.dirxml ?? noop_default;
const group = _console?.group ?? noop_default;
const groupEnd = _console?.groupEnd ?? noop_default;
const groupCollapsed = _console?.groupCollapsed ?? noop_default;
const profile = _console?.profile ?? noop_default;
const profileEnd = _console?.profileEnd ?? noop_default;
const time = _console?.time ?? noop_default;
const timeEnd = _console?.timeEnd ?? noop_default;
const timeLog = _console?.timeLog ?? noop_default;
const timeStamp = _console?.timeStamp ?? noop_default;
const Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
const _times = /* @__PURE__ */ new Map();
function context() {
	return _console;
}
const _stdoutErrorHandler = noop_default;
const _stderrErrorHandler = noop_default;
var console_default = {
	_times,
	_ignoreErrors: true,
	_stdoutErrorHandler,
	_stderrErrorHandler,
	_stdout,
	_stderr,
	assert,
	clear,
	Console,
	count,
	countReset,
	debug,
	dir,
	dirxml,
	error,
	context,
	createTask,
	group,
	groupEnd,
	groupCollapsed,
	info,
	log,
	profile,
	profileEnd,
	table,
	time,
	timeEnd,
	timeLog,
	timeStamp,
	trace,
	warn
};
//#endregion
export { Console, _ignoreErrors, _stderr, _stderrErrorHandler, _stdout, _stdoutErrorHandler, _times, assert, clear, context, count, countReset, createTask, debug, console_default as default, dir, dirxml, error, group, groupCollapsed, groupEnd, info, log, profile, profileEnd, table, time, timeEnd, timeLog, timeStamp, trace, warn };
