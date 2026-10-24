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
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/inspector.mjs
const close = noop_default;
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
const open = () => ({
	__unenv__: true,
	[Symbol.dispose]() {
		return Promise.resolve();
	}
});
const url = () => void 0;
const waitForDebugger = noop_default;
const Session = /* @__PURE__ */ notImplementedClass("inspector.Session");
const Network = {
	loadingFailed: /* @__PURE__ */ notImplemented("inspector.Network.loadingFailed"),
	loadingFinished: /* @__PURE__ */ notImplemented("inspector.Network.loadingFinished"),
	requestWillBeSent: /* @__PURE__ */ notImplemented("inspector.Network.requestWillBeSent"),
	responseReceived: /* @__PURE__ */ notImplemented("inspector.Network.responseReceived")
};
var inspector_default = {
	Session,
	close,
	console,
	open,
	url,
	waitForDebugger,
	Network
};
//#endregion
export { Network, Session, close, console, inspector_default as default, open, url, waitForDebugger };
