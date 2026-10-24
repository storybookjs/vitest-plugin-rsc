import promises from "node:timers/promises";
//#region src/nextjs/registry-global.ts
const registryGlobal = "__vitest_plugin_rsc_next__";
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
Object.assign(() => {}, { __unenv__: true });
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/timers/timeout.mjs
var Timeout = class {
	constructor(callback, args) {
		if (typeof callback === "function") callback(...args);
	}
	close() {
		throw /* @__PURE__ */ createNotImplementedError("node.timers.timeout.close");
	}
	_onTimeout(...args) {
		throw /* @__PURE__ */ createNotImplementedError("node.timers.timeout._onTimeout");
	}
	ref() {
		return this;
	}
	unref() {
		return this;
	}
	hasRef() {
		return false;
	}
	refresh() {
		return this;
	}
	[Symbol.dispose]() {}
	[Symbol.toPrimitive]() {
		return 0;
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/timers/set-timeout.mjs
function setTimeoutFallbackPromises(delay, value, options) {
	return new Promise((res) => {
		res(value);
	});
}
function setTimeoutFallback(callback, ms, ...args) {
	return new Timeout(callback, args);
}
setTimeoutFallback.__promisify__ = setTimeoutFallbackPromises;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/timers/immediate.mjs
var Immediate = class {
	_onImmediate;
	_timeout;
	constructor(callback, args) {
		this._onImmediate = callback;
		if ("setTimeout" in globalThis) this._timeout = setTimeout(callback, 0, ...args);
		else callback(...args);
	}
	ref() {
		this._timeout?.ref();
		return this;
	}
	unref() {
		this._timeout?.unref();
		return this;
	}
	hasRef() {
		return this._timeout?.hasRef() ?? false;
	}
	[Symbol.dispose]() {
		if ("clearTimeout" in globalThis) clearTimeout(this._timeout);
	}
};
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/timers/set-immediate.mjs
function setImmediateFallbackPromises(value) {
	return new Promise((res) => {
		res(value);
	});
}
function setImmediateFallback(callback, ...args) {
	return new Immediate(callback, args);
}
setImmediateFallback.__promisify__ = setImmediateFallbackPromises;
//#endregion
//#region ../../node_modules/.pnpm/unenv@2.0.0-rc.24/node_modules/unenv/dist/runtime/node/internal/timers/set-interval.mjs
async function* setIntervalFallbackPromises(delay, value) {
	yield value;
}
function setIntervalFallback(callback, ms, ...args) {
	return new Timeout(callback, args);
}
setIntervalFallback.__promisify__ = setIntervalFallbackPromises;
globalThis.clearImmediate?.bind(globalThis);
globalThis.clearInterval?.bind(globalThis);
globalThis.clearTimeout?.bind(globalThis);
globalThis.setImmediate?.bind(globalThis);
globalThis.setTimeout?.bind(globalThis);
globalThis.setInterval?.bind(globalThis);
const active = function active(timeout) {
	timeout?.refresh?.();
};
const _unrefActive = active;
const enroll = /* @__PURE__ */ notImplemented("timers.enroll");
const unenroll = /* @__PURE__ */ notImplemented("timers.unenroll");
//#endregion
//#region src/node/timers.ts
const registry = () => globalThis[registryGlobal];
const setImmediate = (callback, ...args) => registry().setImmediate(callback, ...args);
const clearImmediate = (id) => registry().clearImmediate(id);
const setTimeout$1 = (callback, delay, ...args) => globalThis.setTimeout(callback, delay, ...args);
const clearTimeout$1 = (id) => globalThis.clearTimeout(id);
const setInterval = (callback, delay, ...args) => globalThis.setInterval(callback, delay, ...args);
const clearInterval = (id) => globalThis.clearInterval(id);
var timers_default = {
	setImmediate,
	clearImmediate,
	setTimeout: setTimeout$1,
	clearTimeout: clearTimeout$1,
	setInterval,
	clearInterval
};
//#endregion
export { _unrefActive, active, clearImmediate, clearInterval, clearTimeout$1 as clearTimeout, timers_default as default, enroll, promises, setImmediate, setInterval, setTimeout$1 as setTimeout, unenroll };
