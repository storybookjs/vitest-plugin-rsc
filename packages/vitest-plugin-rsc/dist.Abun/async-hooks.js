import { t as SequentialAsyncLocalStorage } from "./async-local-storage-B5kOHq_J.js";
//#region src/async-hooks.ts
var AsyncHook = class {
	enable() {
		return this;
	}
	disable() {
		return this;
	}
};
var AsyncResource = class AsyncResource {
	#runInAsyncScope = SequentialAsyncLocalStorage.snapshot();
	constructor(_type) {}
	runInAsyncScope(fn, thisArg, ...args) {
		return this.#runInAsyncScope(() => fn.apply(thisArg, args));
	}
	bind(fn, thisArg) {
		return ((...args) => this.runInAsyncScope(fn, thisArg, ...args));
	}
	asyncId() {
		return 0;
	}
	triggerAsyncId() {
		return 0;
	}
	emitDestroy() {}
	static bind(fn, _type, thisArg) {
		return new AsyncResource("bound").bind(fn, thisArg);
	}
};
const asyncWrapProviders = { NONE: 0 };
function createHook() {
	return new AsyncHook();
}
function executionAsyncId() {
	return 0;
}
function executionAsyncResource() {
	return Object.create(null);
}
function triggerAsyncId() {
	return 0;
}
var async_hooks_default = {
	AsyncLocalStorage: SequentialAsyncLocalStorage,
	AsyncResource,
	asyncWrapProviders,
	createHook,
	executionAsyncId,
	executionAsyncResource,
	triggerAsyncId
};
//#endregion
export { SequentialAsyncLocalStorage as AsyncLocalStorage, AsyncResource, asyncWrapProviders, createHook, async_hooks_default as default, executionAsyncId, executionAsyncResource, triggerAsyncId };
