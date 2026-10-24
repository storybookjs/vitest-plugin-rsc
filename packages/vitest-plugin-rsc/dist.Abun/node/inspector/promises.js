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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {}, { __unenv__: true });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/inspector/promises.mjs
const console = {
	debug: noop_default,
	error: noop_default,
	info: noop_default,
	log: noop_default,
	warn: noop_default,
	dir: noop_default,
	dirxml: noop_default,
	table: noop_default,
	trace: noop_default,
	group: noop_default,
	groupCollapsed: noop_default,
	groupEnd: noop_default,
	clear: noop_default,
	count: noop_default,
	countReset: noop_default,
	assert: noop_default,
	profile: noop_default,
	profileEnd: noop_default,
	time: noop_default,
	timeLog: noop_default,
	timeStamp: noop_default
};
const Network = /* @__PURE__ */ notImplementedClass("inspectorPromises.Network");
const Session = /* @__PURE__ */ notImplementedClass("inspectorPromises.Session");
const url = /* @__PURE__ */ notImplemented("inspectorPromises.url");
const waitForDebugger = /* @__PURE__ */ notImplemented("inspectorPromises.waitForDebugger");
const open = /* @__PURE__ */ notImplemented("inspectorPromises.open");
const close = /* @__PURE__ */ notImplemented("inspectorPromises.close");
var promises_default = {
	close,
	console,
	Network,
	open,
	Session,
	url,
	waitForDebugger
};
//#endregion
export { Network, Session, close, console, promises_default as default, open, url, waitForDebugger };
