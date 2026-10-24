//#region src/async-local-storage.ts
let resetGeneration = 0;
let ambientScope;
const exited = Symbol("exited");
let rootFrame = createFrame(void 0, /* @__PURE__ */ new Map());
let currentFrame = rootFrame;
function isPromiseLike(value) {
	return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}
function withFinally(result, onFinally) {
	return result.then((value) => {
		onFinally();
		return value;
	}, (error) => {
		onFinally();
		throw error;
	});
}
function runInFrame(frame, callback, args) {
	const untilSettled = ambientScope === void 0;
	currentFrame = frame;
	let result;
	try {
		result = callback(...args);
	} catch (error) {
		closeFrame(frame);
		throw error;
	}
	if (untilSettled && isPromiseLike(result)) return withFinally(result, () => {
		closeFrame(frame);
	});
	closeFrame(frame);
	return result;
}
var SequentialStorage = class SequentialStorage {
	getStore() {
		const self = this;
		const store = currentFrame.stores.has(self) ? currentFrame.stores.get(self) : ambientStore(self);
		return store === exited ? void 0 : store;
	}
	run(store, callback, ...args) {
		const previousFrame = currentFrame;
		const frame = createFrame(previousFrame, previousFrame.stores);
		frame.stores.set(this, store);
		if (ambientScope && !ambientScope.stores.has(this)) ambientScope.stores.set(this, store);
		return runInFrame(frame, callback, args);
	}
	exit(callback, ...args) {
		const previousFrame = currentFrame;
		const frame = createFrame(previousFrame, previousFrame.stores);
		frame.stores.set(this, exited);
		const scope = ambientScope;
		const result = runInFrame(frame, callback, args);
		if (scope && isPromiseLike(result)) scope.stores.set(this, exited);
		return result;
	}
	enterWith(store) {
		const frame = createFrame(currentFrame, currentFrame.stores);
		frame.stores.set(this, store);
		currentFrame = frame;
	}
	disable() {
		const frame = createFrame(currentFrame, currentFrame.stores);
		frame.stores.set(this, exited);
		currentFrame = frame;
	}
	static bind(fn) {
		const runInSnapshot = SequentialStorage.snapshot();
		return ((...args) => runInSnapshot(fn, ...args));
	}
	static snapshot() {
		const snapshot = currentStores();
		const snapshotGeneration = resetGeneration;
		return (fn, ...args) => {
			if (snapshotGeneration !== resetGeneration) return fn(...args);
			return runInFrame(createFrame(currentFrame, snapshot), fn, args);
		};
	}
};
function currentStores() {
	if (ambientScope === void 0) return currentFrame.stores;
	const stores = /* @__PURE__ */ new Map();
	for (let scope = ambientScope; scope; scope = scope.outer) {
		if (scope.ended) continue;
		for (const [storage, store] of scope.stores) if (!stores.has(storage)) stores.set(storage, store);
	}
	for (const [storage, store] of currentFrame.stores) stores.set(storage, store);
	return stores;
}
/**
* Starts the scope of one request on a server. Until the returned function is
* called:
*
* - The first store a storage is entered with stays readable after its
*   `run()` has returned.
* - A `run()` lasts for the synchronous part of its callback, also when the
*   callback returns a promise. So does a snapshot.
* - An `exit()` whose callback returns a promise leaves the storage for the
*   rest of the scope.
*
* A server enters its request stores once and then does the work from
* scheduled tasks: React renders a tree that way, and an async component
* resumes that way after every `await`. Node carries the store along. A
* browser cannot, so inside this scope the outermost store of the request is
* what a later task reads. That is right for one request at a time.
*
* It is wrong for a store that is entered inside the request for a part of
* the work, like the one of a cache scope: code that resumes after an `await`
* in that part reads the store of the request, unless it is compiled to get
* its own back (asyncFunctionHooks). The alternative is worse. Keeping such a
* store until the promise of its callback settles hands it to everything else
* that runs in the meantime, which is the rest of the page.
*
* The same goes for `exit()`: the work that its callback starts goes on after
* the promise has settled, and has to stay outside the store. Next renders
* the page after a Server Action that way, outside the store of the action.
* What was started in the store before the `exit()` and goes on after it,
* like a promise the action passed to `after()`, has its store back when it
* is compiled (asyncFunctionHooks) or bound (`bind()`, `snapshot()`): both
* take the stores they are called with, the ambient ones included, as Node's
* context does. So does code that awaits the `exit()`, when it is compiled.
* What is not compiled reads the exited store for the rest of the scope.
*
* A `run()` that started before the scope keeps its own rule: it lasts until
* its promise settles, and the request reads its store until then.
*/
function enterAmbientScope() {
	const scope = {
		stores: /* @__PURE__ */ new Map(),
		outer: ambientScope,
		ended: false
	};
	ambientScope = scope;
	return () => {
		scope.ended = true;
		while (ambientScope?.ended) ambientScope = ambientScope.outer;
	};
}
function ambientStore(storage) {
	for (let scope = ambientScope; scope; scope = scope.outer) if (!scope.ended && scope.stores.has(storage)) return scope.stores.get(storage);
}
/**
* What an async function is compiled to call, to read after an `await` the
* stores it was called with: see async-local-storage-transform.ts. A browser
* runs nothing between a promise settling and the function going on, so only
* the function itself can put them back.
*
* The frame of the function is the current one only while its own code runs:
* it leaves it before it waits and when it is done. So what runs in the
* meantime, like the rest of the page, never reads it.
*/
const asyncFunctionHooks = {
	/** At the start of the function. */
	e: () => ({
		stores: currentStores(),
		frame: void 0,
		generation: resetGeneration
	}),
	/** Right before an `await`, with what is awaited. */
	s(call, value) {
		leaveAsyncCall(call);
		return value;
	},
	/** Right after an `await`, with its value. */
	r(call, value) {
		enterAsyncCall(call);
		return value;
	},
	/** In a `catch` and a `finally`: where the function goes on after an `await` that rejected. */
	c(call) {
		if (!call.frame) enterAsyncCall(call);
	},
	/** At the end of the function. */
	x: leaveAsyncCall
};
function enterAsyncCall(call) {
	if (call.generation !== resetGeneration) return;
	currentFrame = call.frame = createFrame(currentFrame, call.stores);
}
function leaveAsyncCall(call) {
	if (!call.frame) return;
	closeFrame(call.frame);
	call.frame = void 0;
}
function resetAsyncLocalStorage() {
	resetGeneration++;
	ambientScope = void 0;
	rootFrame = createFrame(void 0, /* @__PURE__ */ new Map());
	currentFrame = rootFrame;
}
function createFrame(parent, stores) {
	return {
		stores: new Map(stores),
		parent,
		active: true,
		generation: resetGeneration
	};
}
function closeFrame(frame) {
	frame.active = false;
	if (frame.generation !== resetGeneration || currentFrame !== frame) return;
	currentFrame = nearestActiveFrame(frame.parent);
}
function nearestActiveFrame(frame) {
	while (frame && !frame.active) frame = frame.parent;
	return frame ?? rootFrame;
}
const own = {
	SequentialAsyncLocalStorage: SequentialStorage,
	enterAmbientScope,
	asyncFunctionHooks,
	resetAsyncLocalStorage
};
const pageGlobal = "__vitest_plugin_rsc_async_local_storage__";
const page = globalThis[pageGlobal] ??= own;
const SequentialAsyncLocalStorage = page.SequentialAsyncLocalStorage;
const { enterAmbientScope: pageScope, asyncFunctionHooks: pageHooks, resetAsyncLocalStorage: pageReset } = page;
//#endregion
export { pageScope as i, pageHooks as n, pageReset as r, SequentialAsyncLocalStorage as t };
